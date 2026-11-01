"use server"

import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canManageLocation, canWorkLocation } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const optionalDate = z.union([z.literal(""), z.iso.date()]).optional()

const receiveSchema = z.object({
  locationId: z.guid(),
  supplierId: z.union([z.literal(""), z.guid()]).optional(),
  receivedOn: optionalDate,
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
  updateCosts: z.boolean(),
  lines: z
    .array(
      z.object({
        itemId: z.guid("Choose an item on every line"),
        qty: z.number("Enter a quantity on every line").positive("Quantities must be more than 0").max(1_000_000),
        unitCost: z.number().min(0, "Costs can't be negative").max(1_000_000).nullable(),
        bestBefore: optionalDate,
        supplierBatch: z.string().trim().max(60).optional(),
      }),
    )
    .min(1, "Add at least one item")
    .max(500),
})

export async function receiveDelivery(input: z.input<typeof receiveSchema>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = receiveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the delivery")
  const d = parsed.data
  if (!canWorkLocation(user, d.locationId)) return fail("You can't receive deliveries at this location.")
  if (d.updateCosts && !canManageLocation(user, d.locationId)) {
    return fail("Only managers can update cost prices.")
  }

  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc("receive_goods", {
    p_location_id: d.locationId,
    p_supplier_id: d.supplierId || undefined,
    p_received_on: d.receivedOn || undefined,
    p_reference: d.reference || undefined,
    p_note: d.note || undefined,
    p_update_costs: d.updateCosts,
    p_lines: d.lines.map((l) => ({
      item_id: l.itemId,
      qty: l.qty,
      unit_cost: l.unitCost,
      best_before: l.bestBefore || null,
      supplier_batch: l.supplierBatch || null,
    })),
  })
  if (error || !id) return fail(friendlyDbError(error ?? { message: "Not saved" }))

  const { data: receipt } = await supabase.from("goods_receipts").select("code").eq("id", id).single()
  redirect(`/deliveries/${receipt?.code ?? id}`)
}

export async function cancelDelivery(input: { id: string; reason: string }): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const parsed = z
    .object({ id: z.guid(), reason: z.string().trim().min(1, "Give a reason").max(300) })
    .safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")

  const supabase = await createClient()
  const { error } = await supabase.rpc("void_goods_receipt", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}
