"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import { createClient } from "@/lib/supabase/server"
import { transferCodeFromScan } from "@/lib/transfers"

const qty = z
  .number("Enter a quantity on every line")
  .min(0, "Quantities can't be negative")
  .max(1_000_000)

const lineSchema = z.object({
  itemId: z.guid("Choose an item on every line"),
  qty,
  note: z.string().trim().max(300).optional(),
})

const saveSchema = z.object({
  id: z.guid().optional(),
  origin: z.enum(["request", "push"]).optional(),
  fromLocationId: z.guid().optional(),
  toLocationId: z.guid().optional(),
  neededOn: z.union([z.literal(""), z.iso.date()]).optional(),
  note: z.string().trim().max(500).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one item").max(500),
  then: z.enum(["save", "submit", "approve"]),
})

export type SaveTransferInput = z.input<typeof saveSchema>

/**
 * Create or edit a transfer, then optionally send it on (submit) or approve it.
 * If saving works but sending on fails, the draft is kept and the error is
 * returned alongside its id so the page can open it.
 */
export async function saveTransfer(
  input: SaveTransferInput,
): Promise<ActionResult<{ id: string; status?: string; followUpError?: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const d = parsed.data

  const ids = new Set<string>()
  for (const line of d.lines) {
    if (ids.has(line.itemId)) return fail("An item is on the list twice. Merge the lines.")
    ids.add(line.itemId)
  }
  if (!d.id && (!d.origin || !d.fromLocationId || !d.toLocationId)) {
    return fail("Choose where the stock comes from and where it goes.")
  }
  if (d.then !== "approve" && d.lines.every((l) => l.qty === 0)) {
    return fail("Enter a quantity for at least one item.")
  }

  const supabase = await createClient()
  const lines = d.lines.map((l) => ({ item_id: l.itemId, qty: l.qty, note: l.note || null }))

  if (d.then === "approve") {
    if (!d.id) return fail("Save the transfer first.")
    const { error } = await supabase.rpc("approve_transfer", { p_id: d.id, p_lines: lines })
    if (error) return fail(friendlyDbError(error))
    refresh()
    return ok({ id: d.id, status: "approved" })
  }

  const { data: id, error } = await supabase.rpc("save_transfer", {
    p_id: d.id,
    p_transfer: {
      origin: d.origin,
      from_location_id: d.fromLocationId,
      to_location_id: d.toLocationId,
      needed_on: d.neededOn || null,
      note: d.note || null,
    },
    p_lines: lines,
  })
  if (error || !id) return fail(friendlyDbError(error ?? { message: "Not saved" }))

  if (d.then === "submit") {
    const submitted = await supabase.rpc("submit_transfer", { p_id: id })
    if (submitted.error) {
      refresh()
      return ok({ id, followUpError: friendlyDbError(submitted.error) })
    }
    refresh()
    return ok({ id, status: submitted.data ?? undefined })
  }

  refresh()
  return ok({ id })
}

const actionSchema = z.object({
  id: z.guid(),
  action: z.enum(["submit", "approve", "reject", "cancel", "start_picking"]),
  reason: z.string().trim().max(500).optional(),
})

/** Simple status changes from the transfer page. */
export async function changeTransferStatus(
  input: z.input<typeof actionSchema>,
): Promise<ActionResult<{ result?: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = actionSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const { id, action, reason } = parsed.data

  const supabase = await createClient()
  let error: { code?: string; message: string; details?: string | null } | null = null
  let result: string | undefined

  switch (action) {
    case "submit": {
      const r = await supabase.rpc("submit_transfer", { p_id: id })
      error = r.error
      result = r.data ?? undefined
      break
    }
    case "approve":
      ;({ error } = await supabase.rpc("approve_transfer", { p_id: id }))
      break
    case "reject":
      if (!reason) return fail("Give a reason so the other location knows why.")
      ;({ error } = await supabase.rpc("reject_transfer", { p_id: id, p_reason: reason }))
      break
    case "cancel": {
      const r = await supabase.rpc("cancel_transfer", { p_id: id, p_reason: reason || undefined })
      error = r.error
      result = r.data ?? undefined
      break
    }
    case "start_picking":
      ;({ error } = await supabase.rpc("start_picking", { p_id: id }))
      break
  }

  if (error) return fail(friendlyDbError(error))
  // A deleted draft has no page left to refresh; the client goes to the list.
  if (result !== "deleted") refresh()
  return ok({ result })
}

const dispatchSchema = z.object({
  id: z.guid(),
  picks: z
    .array(
      z.object({
        lineId: z.guid(),
        batchId: z.guid().nullable(),
        qty: z.number().min(0, "Picked quantities can't be negative").max(1_000_000),
      }),
    )
    .max(2000),
})

export async function dispatchTransfer(
  input: z.input<typeof dispatchSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = dispatchSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the picked quantities")

  const picks = parsed.data.picks.filter((p) => p.qty > 0)
  if (picks.length === 0) return fail("Nothing is picked yet.")

  const supabase = await createClient()
  const { error } = await supabase.rpc("dispatch_transfer", {
    p_id: parsed.data.id,
    p_picks: picks.map((p) => ({ line_id: p.lineId, batch_id: p.batchId, qty: p.qty })),
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}

const receiveSchema = z.object({
  id: z.guid(),
  lines: z
    .array(
      z.object({
        id: z.number().int().positive(),
        receivedQty: z.number("Enter what arrived on every line").min(0).max(1_000_000),
        reason: z.enum(["missing", "damaged", "extra", "other"]).optional(),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(2000),
})

export async function receiveTransfer(
  input: z.input<typeof receiveSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = receiveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the quantities")

  const supabase = await createClient()
  const { error } = await supabase.rpc("receive_transfer", {
    p_id: parsed.data.id,
    p_lines: parsed.data.lines.map((l) => ({
      id: l.id,
      received_qty: l.receivedQty,
      reason: l.reason ?? null,
      note: l.note || null,
    })),
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok(null)
}

/** Finds a transfer from a scanned delivery note (URL or T-00042 code). */
export async function findTransfer(scanned: string): Promise<ActionResult<{ code: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const code = transferCodeFromScan(String(scanned ?? ""))
  if (!code) return fail("That isn't a delivery note code.")

  const supabase = await createClient()
  const { data } = await supabase.from("transfers").select("code").eq("code", code).maybeSingle()
  if (!data) return fail(`Transfer ${code} wasn't found, or it isn't for your location.`)
  return ok({ code: data.code })
}

/** Lines of the most recent transfer on the same route, for "copy last order". */
export async function lastOrderLines(input: {
  fromLocationId: string
  toLocationId: string
}): Promise<ActionResult<{ code: string; lines: { itemId: string; qty: number }[] }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = z
    .object({ fromLocationId: z.guid(), toLocationId: z.guid() })
    .safeParse(input)
  if (!parsed.success) return fail("Choose both locations first.")

  const supabase = await createClient()
  const { data } = await supabase
    .from("transfers")
    .select("code, transfer_lines(item_id, requested_qty, qty)")
    .eq("from_location_id", parsed.data.fromLocationId)
    .eq("to_location_id", parsed.data.toLocationId)
    .not("status", "in", "(draft,cancelled,rejected)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return fail("There is no earlier order on this route.")
  return ok({
    code: data.code,
    lines: data.transfer_lines
      .map((l) => ({ itemId: l.item_id, qty: Number(l.requested_qty ?? l.qty) }))
      .filter((l) => l.qty > 0),
  })
}

const standingSchema = z.object({
  fromLocationId: z.guid(),
  toLocationId: z.guid(),
  rows: z
    .array(
      z.object({
        itemId: z.guid(),
        weekday: z.number().int().min(1).max(7),
        qty: z.number().min(0, "Quantities can't be negative").max(1_000_000),
      }),
    )
    .max(5000),
})

export async function saveStandingOrders(
  input: z.input<typeof standingSchema>,
): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = standingSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the quantities")
  const d = parsed.data
  if (d.fromLocationId === d.toLocationId) return fail("Choose two different locations.")

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("save_standing_orders", {
    p_from: d.fromLocationId,
    p_to: d.toLocationId,
    p_rows: d.rows
      .filter((r) => r.qty > 0)
      .map((r) => ({ item_id: r.itemId, weekday: r.weekday, qty: r.qty })),
  })
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok({ count: data ?? 0 })
}

export async function generateStandingTransfers(): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("generate_standing_transfers", {})
  if (error) return fail(friendlyDbError(error))
  refresh()
  return ok({ count: data ?? 0 })
}

export type StandingSuggestion = {
  itemId: string
  weekday: number
  suggested: number
  avgSold: number
  avgWasted: number
}

/** Average sales per weekday at the receiving store, to fill in a standing order. */
export async function suggestStandingOrder(input: {
  fromLocationId: string
  toLocationId: string
  weeks: number
}): Promise<ActionResult<{ rows: StandingSuggestion[] }>> {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")

  const parsed = z
    .object({ fromLocationId: z.guid(), toLocationId: z.guid(), weeks: z.number().int().min(1).max(26) })
    .safeParse(input)
  if (!parsed.success) return fail("Choose both locations first.")

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("suggest_standing_order", {
    p_from: parsed.data.fromLocationId,
    p_to: parsed.data.toLocationId,
    p_weeks: parsed.data.weeks,
  })
  if (error) return fail(friendlyDbError(error))
  return ok({
    rows: (data ?? []).map((r) => ({
      itemId: r.item_id,
      weekday: r.weekday,
      suggested: Number(r.suggested),
      avgSold: Number(r.avg_sold),
      avgWasted: Number(r.avg_wasted),
    })),
  })
}
