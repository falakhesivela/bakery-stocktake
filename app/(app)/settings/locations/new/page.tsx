import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { requireAdmin } from "@/lib/auth"
import { EMPTY_LOCATION, LocationForm } from "../location-form"

export const metadata: Metadata = { title: "New location" }

export default function NewLocationPage() {
  return (
    <>
      <PageHeader title="New location" />
      <Suspense>
        <AdminForm />
      </Suspense>
    </>
  )
}

async function AdminForm() {
  await requireAdmin()
  return <LocationForm initial={EMPTY_LOCATION} />
}
