import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { CategoriesEditor } from "./categories-editor"

export const metadata: Metadata = { title: "Categories" }

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="Group items for lists, counts and reports (e.g. Cakes, Bread, Ingredients)."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <CategoriesContent />
      </Suspense>
    </>
  )
}

async function CategoriesContent() {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase
    .from("categories")
    .select("id, name, items(count)")
    .order("sort_order")
    .order("name")

  return (
    <CategoriesEditor
      categories={(data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        itemCount: c.items[0]?.count ?? 0,
      }))}
    />
  )
}
