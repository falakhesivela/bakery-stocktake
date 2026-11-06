import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireUser } from "@/lib/auth"
import { canManageLocation } from "@/lib/permissions"
import { loadParLevels, loadTransfer, loadTransferItems } from "@/lib/transfer-data"
import { transferPermissions } from "@/lib/transfers"
import { TransferForm, type TransferFormMode } from "../../transfer-form"

export const metadata: Metadata = { title: "Edit transfer" }

export default function EditTransferPage({
  params,
  searchParams,
}: PageProps<"/transfers/[id]/edit">) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <EditTransferContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function EditTransferContent({
  params,
  searchParams,
}: {
  params: PageProps<"/transfers/[id]/edit">["params"]
  searchParams: PageProps<"/transfers/[id]/edit">["searchParams"]
}) {
  const user = await requireUser()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const transfer = await loadTransfer(id)
  if (!transfer) notFound()

  const perms = transferPermissions(user, {
    fromLocationId: transfer.from.id,
    toLocationId: transfer.to.id,
    origin: transfer.origin,
    status: transfer.status,
  })

  let mode: TransferFormMode
  if (sp.approve && perms.approve) mode = "approve"
  else if (perms.edit) mode = transfer.status === "draft" ? "draft" : "edit"
  else if (perms.approve) mode = "approve"
  else redirect(`/transfers/${transfer.code}`)

  const keepRequested =
    mode === "edit" && (transfer.status === "approved" || transfer.status === "picking")

  const [items, par] = await Promise.all([
    loadTransferItems(),
    canManageLocation(user, transfer.to.id) ? loadParLevels([transfer.to.id]) : {},
  ])

  // Keep items that were deactivated after being added, so the line still shows.
  const knownIds = new Set(items.map((i) => i.id))
  for (const line of transfer.lines) {
    if (!knownIds.has(line.itemId)) {
      items.push({
        id: line.itemId,
        sku: line.sku,
        name: `${line.name} (inactive)`,
        kind: "product",
        unit: line.unit,
        madeToOrder: false,
        barcodes: [],
      })
    }
  }

  const title =
    mode === "approve"
      ? `Approve ${transfer.code}`
      : mode === "draft"
        ? `Edit draft ${transfer.code}`
        : `Change ${transfer.code}`

  return (
    <>
      <PageHeader
        title={title}
        description={
          mode === "approve"
            ? "Change what you will send, then approve. Set a line to 0 if you can't send it; the store still sees what they asked for."
            : keepRequested
              ? "You can change quantities until the transfer is dispatched."
              : undefined
        }
      />
      <TransferForm
        // Start from the saved values whenever the transfer changes.
        key={`${transfer.updatedAt}-${mode}`}
        mode={mode}
        origin={transfer.origin}
        transferId={transfer.id}
        fromOptions={[transfer.from]}
        toOptions={[transfer.to]}
        initial={{
          fromLocationId: transfer.from.id,
          toLocationId: transfer.to.id,
          neededOn: transfer.neededOn ?? "",
          note: transfer.note ?? "",
          lines: transfer.lines.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            requestedQty: l.requestedQty,
          })),
        }}
        items={items}
        parByLocation={par}
        keepRequested={keepRequested}
        cancelHref={`/transfers/${transfer.code}`}
      />
    </>
  )
}
