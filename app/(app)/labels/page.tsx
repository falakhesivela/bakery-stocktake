import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireUser } from "@/lib/auth"
import { canPrintLabels } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { LabelPicker } from "./label-picker"

export const metadata: Metadata = { title: "Labels" }

export default function LabelsPage() {
  return (
    <>
      <PageHeader
        title="Labels"
        description="Print batch labels (with best-before date) for cakes and bakes, or product labels with the item barcode."
      />
      <Suspense fallback={<TableSkeleton />}>
        <LabelsContent />
      </Suspense>
    </>
  )
}

async function LabelsContent() {
  const user = await requireUser()
  if (!canPrintLabels(user)) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to label printing.</p>
  }

  const supabase = await createClient()

  let batchQuery = supabase
    .from("batches")
    .select("id, code, produced_on, best_before, location_id, items(name, sku), locations(code)")
    .order("produced_on", { ascending: false })
    .order("code", { ascending: false })
    .limit(200)

  if (!user.isAdmin) {
    batchQuery = batchQuery.in("location_id", user.locations.map((l) => l.id))
  }

  const [{ data: batches }, { data: products }] = await Promise.all([
    batchQuery,
    supabase
      .from("items")
      .select("id, name, sku, price, item_barcodes(barcode)")
      .eq("active", true)
      .eq("kind", "product")
      .order("name"),
  ])

  return (
    <LabelPicker
      batches={(batches ?? []).map((b) => ({
        id: b.id,
        code: b.code,
        producedOn: b.produced_on,
        bestBefore: b.best_before,
        itemName: b.items?.name ?? "",
        sku: b.items?.sku ?? "",
        locationCode: b.locations?.code ?? "",
      }))}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.item_barcodes[0]?.barcode ?? null,
      }))}
    />
  )
}
