import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { NewUserForm } from "./new-user-form"

export const metadata: Metadata = { title: "New user" }

export default function NewUserPage() {
  return (
    <>
      <PageHeader
        title="New user"
        description="Create a staff account with a temporary password. Share it with them in person; they can change it under “Change password”."
      />
      <Suspense>
        <NewUserContent />
      </Suspense>
    </>
  )
}

async function NewUserContent() {
  await requireAdmin()
  const supabase = await createClient()
  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, type")
    .eq("active", true)
    .order("type")
    .order("code")

  return <NewUserForm locations={locations ?? []} />
}
