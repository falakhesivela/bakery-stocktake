"use server"

import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const ROLES = [
  "warehouse_manager",
  "warehouse_staff",
  "store_manager",
  "store_staff",
  "driver",
] as const

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")

async function adminOnly() {
  const user = await getCurrentUser()
  if (!user) return { user: null, denied: fail("You are signed out. Sign in again.") }
  if (!user.isAdmin) return { user: null, denied: fail("Only admins can manage users.") }
  return { user, denied: null }
}

export type CreateUserState = { error?: string }

const createSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the person's name").max(80),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password,
  isAdmin: z.boolean(),
  locationId: z.union([z.literal(""), z.guid()]),
  role: z.union([z.literal(""), z.enum(ROLES)]),
})

export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const { denied } = await adminOnly()
  if (denied) return { error: denied.error }

  const parsed = createSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    isAdmin: formData.get("isAdmin") === "on",
    locationId: formData.get("locationId") ?? "",
    role: formData.get("role") ?? "",
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const input = parsed.data
  if (input.locationId && !input.role) return { error: "Choose a role for the location." }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  })
  if (error || !data.user) {
    return {
      error: error?.message.includes("already been registered")
        ? "A user with that email already exists."
        : `Couldn't create the account: ${error?.message}`,
    }
  }

  const userId = data.user.id
  const supabase = await createClient()

  if (input.isAdmin) {
    const { error: adminError } = await supabase
      .from("profiles")
      .update({ is_admin: true })
      .eq("id", userId)
    if (adminError) return { error: friendlyDbError(adminError) }
  }

  if (input.locationId && input.role) {
    const { error: roleError } = await supabase
      .from("user_locations")
      .insert({ user_id: userId, location_id: input.locationId, role: input.role })
    if (roleError) return { error: friendlyDbError(roleError) }
  }

  redirect(`/settings/users/${userId}`)
}

const profileSchema = z.object({
  userId: z.guid(),
  fullName: z.string().trim().min(1, "Enter a name").max(80),
  isAdmin: z.boolean(),
  active: z.boolean(),
})

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const { user, denied } = await adminOnly()
  if (denied) return denied

  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const { userId, fullName, isAdmin, active } = parsed.data

  if (userId === user.id && (!isAdmin || !active)) {
    return fail("You can't remove your own admin access or deactivate yourself.")
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, is_admin: isAdmin, active })
    .eq("id", userId)
  if (error) return fail(friendlyDbError(error))

  // Block sign-in for deactivated accounts (and lift the block when reactivated).
  const admin = createAdminClient()
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  })
  if (banError) return fail(`Saved, but couldn't update sign-in access: ${banError.message}`)

  refresh()
  return ok(null)
}

export async function resetPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const { denied } = await adminOnly()
  if (denied) return denied

  const parsed = password.safeParse(newPassword)
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  if (!z.guid().safeParse(userId).success) return fail("Unknown user")

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: parsed.data })
  if (error) return fail(`Couldn't change the password: ${error.message}`)
  return ok(null)
}

const roleSchema = z.object({
  userId: z.guid(),
  locationId: z.guid("Choose a location"),
  role: z.enum(ROLES, "Choose a role"),
})

export async function setRole(input: {
  userId: string
  locationId: string
  role: string
}): Promise<ActionResult> {
  const { denied } = await adminOnly()
  if (denied) return denied

  const parsed = roleSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const { userId, locationId, role } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from("user_locations")
    .upsert({ user_id: userId, location_id: locationId, role }, { onConflict: "user_id,location_id" })
  if (error) return fail(friendlyDbError(error))

  refresh()
  return ok(null)
}

export async function removeRole(userId: string, locationId: string): Promise<ActionResult> {
  const { denied } = await adminOnly()
  if (denied) return denied

  const supabase = await createClient()
  const { error } = await supabase
    .from("user_locations")
    .delete()
    .eq("user_id", userId)
    .eq("location_id", locationId)
  if (error) return fail(friendlyDbError(error))

  refresh()
  return ok(null)
}
