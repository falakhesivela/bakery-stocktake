import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { todayIn } from "@/lib/dates"
import { canManageLocation, workLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { DeliveryForm } from "./delivery-form"

export const metadata: Metadata = { title: "Receive delivery" }

export default function NewDeliveryPage() {
  return (
    <>
      <Link href="/deliveries" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Deliveries
      </Link>
      <PageHeader
        title="Receive a delivery"
        description="Enter what arrived, as on the supplier's delivery note. Stock is added straight away."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <NewDeliveryContent />
      </Suspense>
    </>
  )
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function NewDeliveryContent() {
  const user = await requireUser()
  const locations = workLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">You don&apos;t work at a location that takes deliveries.</p>
  }

  const supabase = await createClient()
  const [{ data: suppliers }, { data: items }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    supabase
      .from("items")
      .select("id, sku, name, kind, unit, cost, track_batches, shelf_life_days, item_barcodes(barcode)")
      .eq("active", true)
      .order("name"),
  ])

  // Warehouses first: that's where most deliveries arrive.
  const sorted = [...locations].sort((a, b) => (a.type === b.type ? 0 : a.type === "warehouse" ? -1 : 1))

  return (
    <DeliveryForm
      locations={sorted.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        today: todayIn(l.timezone),
        canManage: canManageLocation(user, l.id),
      }))}
      suppliers={suppliers ?? []}
      items={(items ?? []).map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        kind: i.kind,
        unit: i.unit as Unit,
        cost: i.cost === null ? null : Number(i.cost),
        trackBatches: i.track_batches,
        shelfLifeDays: i.shelf_life_days,
        barcodes: i.item_barcodes.map((b) => b.barcode),
      }))}
    />
  )
}
