"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canWorkLocation } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const optionalDate = z
  .union([z.literal(""), z.iso.date()])
  .optional()
  .transform((v) => v || undefined)

const bakeSchema = z.object({
  locationId: z.guid(),
  itemId: z.guid("Choose what you baked"),
  qty: z.number("Enter how many you baked").positive("Quantity must be more than 0").max(100_000),
  producedOn: optionalDate,
  bestBefore: optionalDate,
  note: z.string().trim().max(500).optional(),
  useRecipe: z.boolean().optional(),
})

export type BakeInput = z.input<typeof bakeSchema>
export type BakeResult = {
  runId: string
  batchId: string | null
  batchCode: string | null
  ingredientsUsed: number
}

export async function logProduction(input: BakeInput): Promise<ActionResult<BakeResult>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = bakeSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const { locationId, itemId, qty, producedOn, bestBefore, note, useRecipe } = parsed.data

  if (!canWorkLocation(user, locationId)) {
    return fail("You can't log bakes at this location.")
  }
  if (producedOn && bestBefore && bestBefore < producedOn) {
    return fail("Best-before can't be before the bake date.")
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("log_production", {
    p_location_id: locationId,
    p_item_id: itemId,
    p_qty: qty,
    p_produced_on: producedOn,
    p_best_before: bestBefore,
    p_note: note || undefined,
    p_use_recipe: useRecipe ?? true,
  })
  if (error) return fail(friendlyDbError(error))

  const row = data?.[0]
  if (!row) return fail("The bake was not saved. Try again.")
  refresh()
  return ok({
    runId: row.run_id,
    batchId: row.batch_id,
    batchCode: row.batch_code,
    ingredientsUsed: row.ingredients_used,
  })
}

const voidSchema = z.object({
  runId: z.guid(),
  reason: z.string().trim().min(1, "Give a reason").max(300),
})

export async function voidProduction(input: z.input<typeof voidSchema>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = voidSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")

  const supabase = await createClient()
  const { error } = await supabase.rpc("void_production_run", {
    p_run_id: parsed.data.runId,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}
