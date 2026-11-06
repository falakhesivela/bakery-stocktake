"use server"

import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { createClient } from "@/lib/supabase/server"

const text = (max: number) => z.string().trim().max(max).optional()

const saveSchema = z.object({
  id: z.guid().optional(),
  customerName: z.string().trim().min(1, "Enter the customer's name").max(100),
  customerPhone: text(40),
  customerEmail: z.union([z.literal(""), z.email("Check the email address")]).optional(),
  takenAtLocationId: z.guid().optional(),
  pickupLocationId: z.guid("Choose the pickup store"),
  fulfilLocationId: z.guid("Choose where it's made"),
  pickupDate: z.iso.date("Choose the pickup date"),
  pickupTime: z.union([z.literal(""), z.iso.time({ precision: -1 })]).optional(),
  notes: text(1000),
  deposit: z.number("The deposit must be a number").min(0, "The deposit can't be negative").max(1_000_000),
  confirm: z.boolean(),
  lines: z
    .array(
      z.object({
        itemId: z.guid("Choose an item on every line"),
        qty: z.number("Enter a quantity on every line").positive("Quantities must be more than 0").max(10_000),
        unitPrice: z.number("Enter a price on every line").min(0, "Prices can't be negative").max(1_000_000),
        details: z
          .object({
            size: text(100),
            flavour: text(100),
            filling: text(100),
            inscription: text(200),
            notes: text(500),
          })
          .nullable(),
        photoPath: z.string().max(300).nullable(),
      }),
    )
    .min(1, "Add at least one item to the order")
    .max(50),
})

export async function saveOrder(input: z.input<typeof saveSchema>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the order")
  const d = parsed.data

  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc("save_customer_order", {
    p_id: d.id,
    p_order: {
      customer_name: d.customerName,
      customer_phone: d.customerPhone || null,
      customer_email: d.customerEmail || null,
      taken_at_location_id: d.takenAtLocationId ?? null,
      pickup_location_id: d.pickupLocationId,
      fulfil_location_id: d.fulfilLocationId,
      pickup_date: d.pickupDate,
      pickup_time: d.pickupTime || null,
      notes: d.notes || null,
      deposit: d.deposit,
      confirm: d.confirm,
    },
    p_lines: d.lines.map((l) => ({
      item_id: l.itemId,
      qty: l.qty,
      unit_price: l.unitPrice,
      details: l.details
        ? Object.fromEntries(Object.entries(l.details).filter(([, v]) => v))
        : null,
      photo_path: l.photoPath,
    })),
  })
  if (error || !id) return fail(friendlyDbError(error ?? { message: "Not saved" }))

  const { data: order } = await supabase.from("customer_orders").select("code").eq("id", id).single()
  redirect(`/orders/${order?.code ?? id}`)
}

const statusSchema = z.object({
  id: z.guid(),
  action: z.enum(["confirm", "ready", "cancel"]),
  reason: text(300),
})

export async function changeOrderStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<{ transferCode: string | null }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return fail("Check the form")
  const { id, action, reason } = parsed.data

  const supabase = await createClient()
  let transferCode: string | null = null
  if (action === "confirm") {
    const { error } = await supabase.rpc("confirm_customer_order", { p_id: id })
    if (error) return fail(friendlyDbError(error))
  } else if (action === "ready") {
    const { data, error } = await supabase.rpc("mark_order_ready", { p_id: id })
    if (error) return fail(friendlyDbError(error))
    transferCode = data ?? null
  } else {
    const { error } = await supabase.rpc("cancel_customer_order", { p_id: id, p_reason: reason || undefined })
    if (error) return fail(friendlyDbError(error))
  }
  refresh()
  return ok({ transferCode })
}

export async function collectOrder(input: { id: string; paid: number }): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const parsed = z
    .object({ id: z.guid(), paid: z.number("Enter what the customer paid").min(0).max(1_000_000) })
    .safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the amount")

  const supabase = await createClient()
  const { error } = await supabase.rpc("collect_customer_order", {
    p_id: parsed.data.id,
    p_paid: parsed.data.paid,
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}

/** Finds a returning customer by phone (same matching as the database). */
export async function findCustomer(
  phone: string,
): Promise<ActionResult<{ name: string; email: string | null; orders: number } | null>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const digits = String(phone ?? "").replace(/\D/g, "")
  if (digits.length < 6) return ok(null)

  const supabase = await createClient()
  const { data } = await supabase
    .from("customers")
    .select("name, email, customer_orders(count)")
    .eq("phone_key", digits.slice(-9))
    .order("created_at")
    .limit(1)
    .maybeSingle()
  if (!data) return ok(null)
  return ok({ name: data.name, email: data.email, orders: data.customer_orders[0]?.count ?? 0 })
}
