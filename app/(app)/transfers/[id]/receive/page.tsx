import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/format"
import { loadTransfer } from "@/lib/transfer-data"
import { transferPermissions } from "@/lib/transfers"
import { ReceiveForm } from "./receive-form"

export const metadata: Metadata = { title: "Receive delivery" }

export default function ReceivePage({ params }: PageProps<"/transfers/[id]/receive">) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <ReceiveContent params={params} />
    </Suspense>
  )
}

async function ReceiveContent({
  params,
}: {
  params: PageProps<"/transfers/[id]/receive">["params"]
}) {
  const user = await requireUser()
  const { id } = await params
  const transfer = await loadTransfer(id)
  if (!transfer) notFound()

  const perms = transferPermissions(user, {
    fromLocationId: transfer.from.id,
    toLocationId: transfer.to.id,
    origin: transfer.origin,
    status: transfer.status,
  })

  const back = (
    <Link
      href={`/transfers/${transfer.code}`}
      className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}
    >
      <ArrowLeft />
      {transfer.code}
    </Link>
  )

  if (!perms.receive) {
    return (
      <>
        {back}
        <p className="text-sm text-muted-foreground">
          {transfer.status === "received"
            ? `${transfer.code} has already been received.`
            : transfer.status === "in_transit"
              ? `Only staff at ${transfer.to.name} can receive this delivery.`
              : `${transfer.code} hasn't been dispatched yet.`}
        </p>
      </>
    )
  }

  const rows = transfer.lines.flatMap((line) =>
    line.batches.map((b) => ({
      id: b.id,
      itemName: line.name,
      sku: line.sku,
      unit: line.unit,
      batchCode: b.batchCode,
      bestBefore: b.bestBefore,
      sentQty: b.dispatchedQty,
    })),
  )
  const notSent = transfer.lines
    .filter((l) => (l.dispatchedQty ?? 0) < l.qty)
    .map((l) => ({
      name: l.name,
      unit: l.unit,
      approved: l.qty,
      sent: l.dispatchedQty ?? 0,
    }))

  return (
    <>
      {back}
      <PageHeader
        title={`Receive ${transfer.code}`}
        description={`From ${transfer.from.name}, dispatched ${formatDateTime(transfer.dispatchedAt)}. Check the delivery against the list and change anything that didn't arrive as sent.`}
      />
      <ReceiveForm transferId={transfer.id} code={transfer.code} rows={rows} notSent={notSent} />
    </>
  )
}
