"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canWorkLocation } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const saveSchema = z.object({
  locationId: z.guid(),
  date: z.iso.date(),
  note: z.string().trim().max(500).optional(),
  post: z.boolean(),
  lines: z
    .array(
      z.object({
        itemId: z.guid(),
        qty: z.number("Quantities must be numbers").min(0, "Quantities can't be negative").max(1_000_000),
      }),
    )
    .max(2000),
})

export async function saveSales(input: z.input<typeof saveSchema>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the quantities")
  const d = parsed.data
  if (!canWorkLocation(user, d.locationId)) return fail("You can't enter sales at this location.")

  const supabase = await createClient()
  const { error } = await supabase.rpc("save_sales_day", {
    p_location_id: d.locationId,
    p_business_date: d.date,
    p_lines: d.lines.filter((l) => l.qty > 0).map((l) => ({ item_id: l.itemId, qty: l.qty })),
    p_note: d.note || undefined,
    p_post: d.post,
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}

export async function reopenSales(input: { id: string; reason?: string }): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = z
    .object({ id: z.guid(), reason: z.string().trim().max(300).optional() })
    .safeParse(input)
  if (!parsed.success) return fail("Check the form")

  const supabase = await createClient()
  const { error } = await supabase.rpc("reopen_sales_day", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason || undefined,
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}
