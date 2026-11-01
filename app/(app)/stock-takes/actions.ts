"use server"

import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { canWorkLocation } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

const startSchema = z.object({
  locationId: z.guid(),
  countDate: z.iso.date(),
  scope: z.enum(["products", "all", "categories"]),
  categoryIds: z.array(z.guid()).max(100),
  blind: z.boolean(),
  note: z.string().trim().max(500).optional(),
})

export async function startStockTake(input: z.input<typeof startSchema>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = startSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const d = parsed.data
  if (!canWorkLocation(user, d.locationId)) return fail("You can't count stock at this location.")

  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc("start_stock_take", {
    p_location_id: d.locationId,
    p_count_date: d.countDate,
    p_scope: d.scope,
    p_category_ids: d.categoryIds,
    p_blind: d.blind,
    p_note: d.note || undefined,
  })
  if (error || !id) return fail(friendlyDbError(error ?? { message: "Not started" }))

  const { data: take } = await supabase.from("stock_takes").select("code").eq("id", id).single()
  redirect(`/stock-takes/${take?.code ?? id}`)
}

type DbError = { code?: string; message: string; details?: string | null }

async function run(call: () => PromiseLike<{ error: DbError | null }>): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const { error } = await call()
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}

const guid = z.guid()

export async function setCount(input: { lineId: string; counted: number | null }) {
  const parsed = z
    .object({ lineId: guid, counted: z.number().min(0, "Counts can't be negative").max(1_000_000).nullable() })
    .safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the count")
  const supabase = await createClient()
  return run(() =>
    supabase.rpc("set_stock_take_count", {
      p_line_id: parsed.data.lineId,
      // null clears the count
      p_counted: parsed.data.counted as number,
    }),
  )
}

export async function addCountByCode(input: {
  stockTakeId: string
  code: string
}): Promise<ActionResult<{ itemName: string; batchCode: string | null; counted: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const parsed = z
    .object({ stockTakeId: guid, code: z.string().trim().min(1).max(200) })
    .safeParse(input)
  if (!parsed.success) return fail("Scan a label")

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("add_stock_take_count", {
    p_stock_take_id: parsed.data.stockTakeId,
    p_code: parsed.data.code,
  })
  if (error) return fail(friendlyDbError(error))
  const row = data?.[0]
  if (!row) return fail("Nothing was counted. Try again.")
  refresh()
  return ok({ itemName: row.item_name, batchCode: row.batch_code, counted: Number(row.counted_qty) })
}

export async function addCountLine(input: { stockTakeId: string; itemId: string }) {
  const parsed = z.object({ stockTakeId: guid, itemId: guid }).safeParse(input)
  if (!parsed.success) return fail("Choose an item")
  const supabase = await createClient()
  return run(() =>
    supabase.rpc("add_stock_take_line", {
      p_stock_take_id: parsed.data.stockTakeId,
      p_item_id: parsed.data.itemId,
    }),
  )
}

/** Sets every line that hasn't been counted to 0. */
export async function zeroUncounted(input: { stockTakeId: string }) {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const parsed = z.object({ stockTakeId: guid }).safeParse(input)
  if (!parsed.success) return fail("Count not found")

  const supabase = await createClient()
  const { data: lines } = await supabase
    .from("stock_take_lines")
    .select("id")
    .eq("stock_take_id", parsed.data.stockTakeId)
    .is("counted_qty", null)
  for (const line of lines ?? []) {
    const { error } = await supabase.rpc("set_stock_take_count", { p_line_id: line.id, p_counted: 0 })
    if (error) return fail(friendlyDbError(error))
  }
  refresh()
  return ok(null)
}

const statusSchema = z.object({
  id: guid,
  action: z.enum(["submit", "return", "approve", "cancel"]),
  reason: z.string().trim().max(300).optional(),
})

export async function changeCountStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<{ adjusted?: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return fail("Check the form")
  const { id, action, reason } = parsed.data

  const supabase = await createClient()
  let error: DbError | null = null
  let adjusted: number | undefined
  if (action === "submit") ({ error } = await supabase.rpc("submit_stock_take", { p_id: id }))
  if (action === "return") ({ error } = await supabase.rpc("return_stock_take", { p_id: id }))
  if (action === "cancel") {
    ;({ error } = await supabase.rpc("cancel_stock_take", { p_id: id, p_reason: reason || undefined }))
  }
  if (action === "approve") {
    const r = await supabase.rpc("approve_stock_take", { p_id: id })
    error = r.error
    adjusted = r.data ?? undefined
  }
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok({ adjusted })
}
