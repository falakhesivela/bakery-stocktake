import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireUser } from "@/lib/auth"
import { addDays, todayIn } from "@/lib/dates"
import { managedLocations } from "@/lib/permissions"
import { loadAllLocations, loadParLevels, loadTransferItems } from "@/lib/transfer-data"
import { TransferForm } from "../transfer-form"

export const metadata: Metadata = { title: "New transfer" }

export default function NewTransferPage({ searchParams }: PageProps<"/transfers/new">) {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <NewTransferContent searchParams={searchParams} />
    </Suspense>
  )
}

async function NewTransferContent({
  searchParams,
}: {
  searchParams: PageProps<"/transfers/new">["searchParams"]
}) {
  const user = await requireUser()
  const sp = await searchParams
  const isSend = sp.type === "send"
  const managed = managedLocations(user)

  const header = (
    <PageHeader
      title={isSend ? "Send stock" : "Request stock"}
      description={
        isSend
          ? "Send stock from a location you manage: a delivery to a store, a move between warehouses, or a return. It's approved straight away and ready for picking."
          : "Ask another location (usually the warehouse) for stock. They approve it, pick it and send it."
      }
    />
  )

  if (managed.length === 0) {
    return (
      <>
        {header}
        <p className="text-sm text-muted-foreground">
          Only managers can create transfers. Ask your manager to request the stock.
        </p>
      </>
    )
  }

  const [allLocations, items] = await Promise.all([loadAllLocations(), loadTransferItems()])
  const par = isSend ? {} : await loadParLevels(managed.map((l) => l.id))

  // Sensible defaults: stores ask the warehouse; the warehouse sends to stores.
  const managedStores = managed.filter((l) => l.type === "store")
  const managedWarehouses = managed.filter((l) => l.type === "warehouse")
  let fromId: string
  let toId: string
  if (isSend) {
    fromId = (managedWarehouses[0] ?? managed[0]).id
    const fromType = managed.find((l) => l.id === fromId)?.type
    toId =
      allLocations.find((l) => l.id !== fromId && l.type !== fromType)?.id ??
      allLocations.find((l) => l.id !== fromId)?.id ??
      ""
  } else {
    toId = (managedStores[0] ?? managed[0]).id
    fromId = allLocations.find((l) => l.type === "warehouse" && l.id !== toId)?.id ?? ""
  }

  const timezone =
    allLocations.find((l) => l.id === toId)?.timezone ?? managed[0].timezone

  return (
    <>
      {header}
      <TransferForm
        mode="create"
        origin={isSend ? "push" : "request"}
        fromOptions={isSend ? managed : allLocations}
        toOptions={isSend ? allLocations : managed}
        initial={{
          fromLocationId: fromId,
          toLocationId: toId,
          neededOn: addDays(todayIn(timezone), 1),
          note: "",
          lines: [],
        }}
        items={items}
        parByLocation={par}
        cancelHref="/transfers"
      />
    </>
  )
}
