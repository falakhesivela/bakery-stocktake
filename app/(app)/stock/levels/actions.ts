"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canManageLocation } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const level = z.number().min(0, "Levels can't be negative").max(1_000_000).nullable()

const schema = z.object({
  locationId: z.guid(),
  rows: z
    .array(z.object({ itemId: z.guid(), reorderLevel: level, parLevel: level }))
    .max(2000),
})

/** Saves changed reorder / par levels. Rows with both empty are removed. */
export async function saveLevels(input: z.input<typeof schema>): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = schema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the levels")
  const { locationId, rows } = parsed.data
  if (!canManageLocation(user, locationId)) return fail("Only a manager of this location can set its levels.")

  for (const r of rows) {
    if (r.reorderLevel !== null && r.parLevel !== null && r.parLevel < r.reorderLevel) {
      return fail("A par level is lower than its reorder level. Par is the level to order up to.")
    }
  }

  const supabase = await createClient()
  const keep = rows.filter((r) => r.reorderLevel !== null || r.parLevel !== null)
  const clear = rows.filter((r) => r.reorderLevel === null && r.parLevel === null)

  if (keep.length > 0) {
    const { error } = await supabase.from("item_location_settings").upsert(
      keep.map((r) => ({
        item_id: r.itemId,
        location_id: locationId,
        reorder_level: r.reorderLevel,
        par_level: r.parLevel,
      })),
    )
    if (error) return fail(friendlyDbError(error))
  }
  if (clear.length > 0) {
    const { error } = await supabase
      .from("item_location_settings")
      .delete()
      .eq("location_id", locationId)
      .in(
        "item_id",
        clear.map((r) => r.itemId),
      )
    if (error) return fail(friendlyDbError(error))
  }

  refresh()
  return ok({ count: rows.length })
}
