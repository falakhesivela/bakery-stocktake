import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { EditUser } from "./edit-user"

export const metadata: Metadata = { title: "Edit user" }

export default function EditUserPage({ params }: PageProps<"/settings/users/[id]">) {
  return (
    <>
      <PageHeader title="Edit user" />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <EditUserContent params={params} />
      </Suspense>
    </>
  )
}

async function EditUserContent({ params }: { params: PageProps<"/settings/users/[id]">["params"] }) {
  const me = await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: profile }, { data: roles }, { data: locations }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, is_admin, active").eq("id", id).maybeSingle(),
    supabase
      .from("user_locations")
      .select("location_id, role, locations(code, name)")
      .eq("user_id", id),
    supabase
      .from("locations")
      .select("id, code, name, type")
      .eq("active", true)
      .order("type")
      .order("code"),
  ])

  if (!profile) notFound()

  return (
    <EditUser
      isSelf={me.id === profile.id}
      profile={{
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email ?? "",
        isAdmin: profile.is_admin,
        active: profile.active,
      }}
      roles={(roles ?? []).map((r) => ({
        locationId: r.location_id,
        code: r.locations?.code ?? "",
        name: r.locations?.name ?? "",
        role: r.role,
      }))}
      locations={locations ?? []}
    />
  )
}
