import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { LocationForm } from "../location-form"

export const metadata: Metadata = { title: "Edit location" }

export default function EditLocationPage({ params }: PageProps<"/settings/locations/[id]">) {
  return (
    <>
      <PageHeader title="Edit location" />
      <Suspense>
        <EditForm params={params} />
      </Suspense>
    </>
  )
}

async function EditForm({ params }: { params: PageProps<"/settings/locations/[id]">["params"] }) {
  await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const { data: l } = await supabase.from("locations").select("*").eq("id", id).maybeSingle()
  if (!l) notFound()

  return (
    <LocationForm
      initial={{
        id: l.id,
        code: l.code,
        name: l.name,
        type: l.type,
        address: l.address ?? "",
        phone: l.phone ?? "",
        canProduce: l.can_produce,
        timezone: l.timezone,
        active: l.active,
      }}
    />
  )
}
