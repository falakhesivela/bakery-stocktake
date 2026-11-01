"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { createClient } from "@/lib/supabase/server"

export type LocationFormState = { error?: string }

const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/, "Code: 2–12 letters, numbers or dashes (e.g. ST-01)"),
  name: z.string().trim().min(1, "Enter a name").max(80),
  type: z.enum(["warehouse", "store"]),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(40),
  canProduce: z.boolean(),
  timezone: z.string().trim().min(1).max(64),
  active: z.boolean(),
})

export async function saveLocation(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: "Only admins can change locations." }

  const parsed = schema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    canProduce: formData.get("canProduce") === "on",
    timezone: formData.get("timezone"),
    active: formData.get("active") === "on",
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const tz = parsed.data.timezone
  if (!Intl.supportedValuesOf("timeZone").includes(tz) && tz !== "UTC") {
    return { error: "Choose a valid timezone." }
  }

  const row = {
    code: parsed.data.code,
    name: parsed.data.name,
    type: parsed.data.type,
    address: parsed.data.address || null,
    phone: parsed.data.phone || null,
    can_produce: parsed.data.canProduce,
    timezone: tz,
    active: parsed.data.active,
  }

  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const { error } = id
    ? await supabase.from("locations").update(row).eq("id", id)
    : await supabase.from("locations").insert(row)

  if (error) return { error: friendlyDbError(error) }
  redirect("/settings/locations")
}
