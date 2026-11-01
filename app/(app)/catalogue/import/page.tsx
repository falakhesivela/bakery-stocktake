import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { requireAdmin } from "@/lib/auth"
import { ImportItems } from "./import-items"

export const metadata: Metadata = { title: "Import items" }

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import items from CSV"
        description="Add or update many items at once. Rows are matched by SKU: existing items are updated, new SKUs are created."
      />
      <Suspense>
        <AdminOnly />
      </Suspense>
    </>
  )
}

async function AdminOnly() {
  await requireAdmin()
  return <ImportItems />
}
