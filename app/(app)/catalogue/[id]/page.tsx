import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { BookOpenText } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { ItemForm } from "../item-form"

export const metadata: Metadata = { title: "Edit item" }

export default function EditItemPage({ params }: PageProps<"/catalogue/[id]">) {
  return (
    <>
      <PageHeader title="Edit item" />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <EditItemForm params={params} />
      </Suspense>
    </>
  )
}

async function EditItemForm({
  params,
}: {
  params: PageProps<"/catalogue/[id]">["params"]
}) {
  await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: item }, { data: categories }] = await Promise.all([
    supabase
      .from("items")
      .select("*, item_barcodes(barcode)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("categories").select("id, name").order("sort_order").order("name"),
  ])

  if (!item) notFound()

  return (
    <>
      {item.kind === "product" && (
        <Link href={`/recipes/${item.id}`} className={`${buttonVariants({ variant: "outline" })} w-fit`}>
          <BookOpenText />
          Recipe and cost to make
        </Link>
      )}
      <ItemForm
        categories={categories ?? []}
        initial={{
          id: item.id,
          sku: item.sku,
          name: item.name,
          kind: item.kind,
          unit: item.unit,
          categoryId: item.category_id ?? "",
          shelfLifeDays: item.shelf_life_days,
          trackBatches: item.track_batches,
          cost: item.cost,
          price: item.price,
          notes: item.notes ?? "",
          active: item.active,
          madeToOrder: item.made_to_order,
          barcodes: item.item_barcodes.map((b) => b.barcode),
        }}
      />
    </>
  )
}
