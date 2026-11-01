"use server"

import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canManageLocation } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const optionalDate = z
  .union([z.literal(""), z.iso.date()])
  .optional()
  .transform((v) => v || undefined)

const schema = z.object({
  locationId: z.guid(),
  note: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.guid("Choose an item on every line"),
        qty: z.number("Enter a quantity").positive("Quantities must be more than 0").max(1_000_000),
        producedOn: optionalDate,
        bestBefore: optionalDate,
      }),
    )
    .min(1, "Add at least one line")
    .max(500, "Post at most 500 lines at a time"),
})

export type OpeningStockInput = z.input<typeof schema>

export async function postOpeningStock(
  input: OpeningStockInput,
): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = schema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the lines")

  const { locationId, lines, note } = parsed.data
  if (!canManageLocation(user, locationId)) {
    return fail("Only a manager of this location can post opening stock.")
  }

  for (const line of lines) {
    if (line.producedOn && line.bestBefore && line.bestBefore < line.producedOn) {
      return fail("A best-before date is earlier than its baked/received date.")
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("post_opening_stock", {
    p_location_id: locationId,
    p_note: note || undefined,
    p_lines: lines.map((l) => ({
      item_id: l.itemId,
      qty: l.qty,
      produced_on: l.producedOn ?? null,
      best_before: l.bestBefore ?? null,
    })),
  })

  if (error) return fail(friendlyDbError(error))
  return ok({ count: data ?? lines.length })
}
