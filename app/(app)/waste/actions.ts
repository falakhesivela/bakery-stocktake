"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canWorkLocation } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const REASONS = ["expired", "damaged", "unsold", "quality", "staff_sample", "other"] as const

const logSchema = z.object({
  locationId: z.guid(),
  date: z.union([z.literal(""), z.iso.date()]).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.guid("Choose an item on every line"),
        batchId: z.guid().nullable(),
        qty: z.number("Enter a quantity").positive("Quantities must be more than 0").max(100_000),
        reason: z.enum(REASONS, "Choose a reason on every line"),
        note: z.string().trim().max(300).optional(),
        photoPath: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1, "Add at least one line")
    .max(500),
})

export async function logWaste(input: z.input<typeof logSchema>): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = logSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the lines")
  const d = parsed.data
  if (!canWorkLocation(user, d.locationId)) return fail("You can't log waste at this location.")

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("log_waste", {
    p_location_id: d.locationId,
    p_business_date: d.date || undefined,
    p_lines: d.lines.map((l) => ({
      item_id: l.itemId,
      batch_id: l.batchId,
      qty: l.qty,
      reason: l.reason,
      note: l.note || null,
      photo_path: l.photoPath ?? null,
    })),
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok({ count: data ?? d.lines.length })
}

export async function undoWaste(input: { id: string; reason: string }): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = z
    .object({ id: z.guid(), reason: z.string().trim().min(1, "Give a reason").max(300) })
    .safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")

  const supabase = await createClient()
  const { error } = await supabase.rpc("void_waste_entry", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}
