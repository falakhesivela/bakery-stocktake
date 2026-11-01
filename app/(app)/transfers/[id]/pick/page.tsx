import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { loadTransfer } from "@/lib/transfer-data"
import { transferPermissions } from "@/lib/transfers"
import { PickForm } from "./pick-form"

export const metadata: Metadata = { title: "Pick transfer" }

export default function PickPage({ params }: PageProps<"/transfers/[id]/pick">) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <PickContent params={params} />
    </Suspense>
  )
}

async function PickContent({ params }: { params: PageProps<"/transfers/[id]/pick">["params"] }) {
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
      Back to {transfer.code}
    </Link>
  )

  if (!perms.pick) {
    return (
      <>
        {back}
        <p className="text-sm text-muted-foreground">
          {transfer.status === "in_transit" || transfer.status === "received"
            ? "This transfer has already been dispatched."
            : "This transfer can't be picked by you right now."}
        </p>
      </>
    )
  }

  const lines = transfer.lines.filter((l) => l.qty > 0)
  const supabase = await createClient()
  const { data: stock } = await supabase
    .from("stock_on_hand")
    .select("item_id, batch_id, batch_code, best_before, produced_on, days_to_expiry, qty")
    .eq("location_id", transfer.from.id)
    .in(
      "item_id",
      lines.map((l) => l.itemId),
    )
    .order("best_before", { ascending: true, nullsFirst: false })
    .order("produced_on", { ascending: true, nullsFirst: false })
    .order("batch_code", { ascending: true }) // same day: oldest batch first

  return (
    <>
      {back}
      <PageHeader
        title={`Pick ${transfer.code}`}
        description={`For ${transfer.to.name}. Oldest best-before dates are filled in first, and expired stock is left out. Scan batch labels to tick them off.`}
      />
      <PickForm
        transferId={transfer.id}
        code={transfer.code}
        lines={lines.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          name: l.name,
          sku: l.sku,
          unit: l.unit,
          trackBatches: l.trackBatches,
          qty: l.qty,
        }))}
        stock={(stock ?? []).map((s) => ({
          itemId: s.item_id!,
          batchId: s.batch_id,
          batchCode: s.batch_code,
          bestBefore: s.best_before,
          daysToExpiry: s.days_to_expiry,
          qty: Number(s.qty),
        }))}
      />
    </>
  )
}
