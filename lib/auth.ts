import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { CurrentUser, UserLocation } from "@/lib/permissions"

/**
 * The signed-in user with their location roles, or null when signed out or
 * deactivated. Reads cookies, so call it inside a <Suspense> boundary.
 * Wrapped in React cache() so one request only loads it once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Everything signed-in is live data: render it per request, never prerender.
  await connection()
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  if (!userId) return null

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, is_admin, active")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_locations")
      .select("role, location_id")
      .eq("user_id", userId),
  ])

  if (!profile || !profile.active) return null

  const roleByLocation = new Map(
    (roles ?? []).map((r) => [r.location_id, r.role] as const),
  )

  let query = supabase
    .from("locations")
    .select("id, code, name, type, can_produce, timezone")
    .eq("active", true)
    .order("type") // warehouses first (enum order)
    .order("name")

  if (!profile.is_admin) {
    query = query.in("id", [...roleByLocation.keys()])
  }

  const { data: locationRows } = await query

  const locations: UserLocation[] = (locationRows ?? []).map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    type: l.type,
    canProduce: l.can_produce,
    timezone: l.timezone,
    role: roleByLocation.get(l.id) ?? null,
  }))

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email || "Unknown user",
    isAdmin: profile.is_admin,
    locations,
  }
})

/**
 * For pages: redirects to /login when signed out, or to /login?error=inactive
 * when the account exists but was deactivated.
 */
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login?error=inactive")
  return user
}

/** For admin-only pages: sends non-admins back to the dashboard. */
export async function requireAdmin() {
  const user = await requireUser()
  if (!user.isAdmin) redirect("/dashboard")
  return user
}
