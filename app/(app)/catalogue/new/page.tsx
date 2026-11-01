import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { EMPTY_ITEM, ItemForm } from "../item-form"

export const metadata: Metadata = { title: "New item" }

export default function NewItemPage() {
  return (
    <>
      <PageHeader title="New item" description="Add a product, ingredient or packaging item." />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <NewItemForm />
      </Suspense>
    </>
  )
}

async function NewItemForm() {
  await requireAdmin()
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("sort_order")
    .order("name")

  return <ItemForm initial={EMPTY_ITEM} categories={categories ?? []} />
}
