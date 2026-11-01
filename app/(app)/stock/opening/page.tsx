import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireUser } from "@/lib/auth"
import { managedLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { OpeningStockForm } from "./opening-stock-form"

export const metadata: Metadata = { title: "Opening stock" }

export default function OpeningStockPage() {
  return (
    <>
      <PageHeader
        title="Opening stock"
        description="Record the stock a location has today, when you start using the app or add a new location. Each line creates a new batch for items with best-before dates."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <OpeningStockContent />
      </Suspense>
    </>
  )
}

async function OpeningStockContent() {
  const user = await requireUser()
  const locations = managedLocations(user)

  if (locations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Only managers and admins can enter opening stock.
      </p>
    )
  }

  const supabase = await createClient()
  const { data: items } = await supabase
    .from("items")
    .select("id, sku, name, kind, unit, track_batches, shelf_life_days, item_barcodes(barcode)")
    .eq("active", true)
    .order("kind")
    .order("name")

  return (
    <OpeningStockForm
      locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name }))}
      items={(items ?? []).map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        kind: i.kind,
        unit: i.unit,
        trackBatches: i.track_batches,
        shelfLifeDays: i.shelf_life_days,
        barcodes: i.item_barcodes.map((b) => b.barcode),
      }))}
    />
  )
}
