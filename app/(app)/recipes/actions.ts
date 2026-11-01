"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canEditRecipes } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const saveSchema = z.object({
  productId: z.guid(),
  yieldQty: z.number("Say how many the recipe makes").positive("The recipe must make more than 0").max(100_000),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.guid("Choose an ingredient on every line"),
        qty: z.number("Enter an amount on every line").positive("Amounts must be more than 0").max(100_000),
      }),
    )
    .max(100),
})

export async function saveRecipe(input: z.input<typeof saveSchema>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  if (!canEditRecipes(user)) return fail("Only admins and bakery managers can change recipes.")

  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the recipe")
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc("save_recipe", {
    p_product_item_id: d.productId,
    p_yield: d.yieldQty,
    p_lines: d.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
    p_notes: d.notes || undefined,
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}

/** Admins only: set the product's cost price to what the recipe costs. */
export async function setCostFromRecipe(input: { productId: string; cost: number }): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return fail("Only admins can change cost prices.")

  const parsed = z
    .object({ productId: z.guid(), cost: z.number().min(0).max(1_000_000) })
    .safeParse(input)
  if (!parsed.success) return fail("Check the cost")

  const supabase = await createClient()
  const { error } = await supabase
    .from("items")
    .update({ cost: Math.round(parsed.data.cost * 100) / 100 })
    .eq("id", parsed.data.productId)
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}
