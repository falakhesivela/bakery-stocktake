"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { isAnyManager } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  id: z.guid().optional(),
  name: z.string().trim().min(1, "Enter the supplier's name").max(100),
  contactName: z.string().trim().max(100),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email("Check the email address")]),
  notes: z.string().trim().max(500),
  active: z.boolean(),
})

export async function saveSupplier(input: z.input<typeof schema>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  if (!isAnyManager(user)) return fail("Only managers can change suppliers.")

  const parsed = schema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const d = parsed.data
  const row = {
    name: d.name,
    contact_name: d.contactName || null,
    phone: d.phone || null,
    email: d.email || null,
    notes: d.notes || null,
    active: d.active,
  }

  const supabase = await createClient()
  const { error } = d.id
    ? await supabase.from("suppliers").update(row).eq("id", d.id)
    : await supabase.from("suppliers").insert(row)
  if (error) {
    return fail(error.code === "23505" ? "A supplier with that name already exists." : friendlyDbError(error))
  }
  refresh()
  return ok(null)
}
