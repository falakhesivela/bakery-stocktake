import "server-only"
import { createClient } from "@/lib/supabase/server"
import type {
  DiscrepancyReason,
  TransferOrigin,
  TransferStatus,
} from "@/lib/transfers"

type Unit = "each" | "g" | "kg" | "ml" | "l"

export type TransferLocation = {
  id: string
  code: string
  name: string
  type: "warehouse" | "store"
  address: string | null
  phone: string | null
  timezone: string
}

export type TransferLineBatch = {
  id: number
  batchId: string | null
  batchCode: string | null
  bestBefore: string | null
  dispatchedQty: number
  receivedQty: number | null
  reason: DiscrepancyReason | null
  reasonNote: string | null
}

export type TransferLine = {
  id: string
  itemId: string
  sku: string
  name: string
  unit: Unit
  trackBatches: boolean
  requestedQty: number | null
  qty: number
  dispatchedQty: number | null
  receivedQty: number | null
  note: string | null
  batches: TransferLineBatch[]
}

export type TransferEvent = {
  id: number
  action: string
  note: string | null
  createdAt: string
  by: string | null
}

export type TransferDetail = {
  id: string
  code: string
  status: TransferStatus
  origin: TransferOrigin
  neededOn: string | null
  note: string | null
  hasDiscrepancy: boolean
  createdAt: string
  updatedAt: string
  dispatchedAt: string | null
  receivedAt: string | null
  createdBy: string | null
  from: TransferLocation
  to: TransferLocation
  lines: TransferLine[]
  events: TransferEvent[]
}

const num = (v: number | string | null | undefined) =>
  v === null || v === undefined ? null : Number(v)

/** Loads one transfer by id or code (T-00042). Null if missing or not visible. */
export async function loadTransfer(idOrCode: string): Promise<TransferDetail | null> {
  const value = decodeURIComponent(idOrCode).trim()
  const isCode = /^T-\d{1,10}$/i.test(value)
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (!isCode && !isId) return null

  const supabase = await createClient()
  let query = supabase.from("transfers").select(
    `id, code, status, origin, needed_on, note, has_discrepancy, created_at, updated_at, dispatched_at, received_at,
     from:locations!transfers_from_location_id_fkey(id, code, name, type, address, phone, timezone),
     to:locations!transfers_to_location_id_fkey(id, code, name, type, address, phone, timezone),
     creator:profiles!transfers_created_by_fkey(full_name),
     transfer_lines(id, item_id, requested_qty, qty, dispatched_qty, received_qty, note,
       items(sku, name, unit, track_batches),
       transfer_line_batches(id, batch_id, dispatched_qty, received_qty, discrepancy_reason, discrepancy_note,
         batches(code, best_before))),
     transfer_events(id, action, note, created_at, profiles(full_name))`,
  )
  query = isCode ? query.eq("code", value.toUpperCase()) : query.eq("id", value)

  const { data: t, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!t || !t.from || !t.to) return null

  const lines: TransferLine[] = t.transfer_lines
    .map((l) => ({
      id: l.id,
      itemId: l.item_id,
      sku: l.items?.sku ?? "",
      name: l.items?.name ?? "",
      unit: (l.items?.unit ?? "each") as Unit,
      trackBatches: l.items?.track_batches ?? false,
      requestedQty: num(l.requested_qty),
      qty: Number(l.qty),
      dispatchedQty: num(l.dispatched_qty),
      receivedQty: num(l.received_qty),
      note: l.note,
      batches: l.transfer_line_batches
        .map((b) => ({
          id: b.id,
          batchId: b.batch_id,
          batchCode: b.batches?.code ?? null,
          bestBefore: b.batches?.best_before ?? null,
          dispatchedQty: Number(b.dispatched_qty),
          receivedQty: num(b.received_qty),
          reason: b.discrepancy_reason,
          reasonNote: b.discrepancy_note,
        }))
        .sort((a, b) => (a.bestBefore ?? "9999").localeCompare(b.bestBefore ?? "9999")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    id: t.id,
    code: t.code,
    status: t.status,
    origin: t.origin,
    neededOn: t.needed_on,
    note: t.note,
    hasDiscrepancy: t.has_discrepancy,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    dispatchedAt: t.dispatched_at,
    receivedAt: t.received_at,
    createdBy: t.creator?.full_name ?? null,
    from: t.from,
    to: t.to,
    lines,
    events: t.transfer_events
      .map((e) => ({
        id: e.id,
        action: e.action,
        note: e.note,
        createdAt: e.created_at,
        by: e.profiles?.full_name ?? null,
      }))
      .sort((a, b) => a.id - b.id),
  }
}

/** Active items for transfer forms, products first. */
export async function loadTransferItems() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("items")
    .select("id, sku, name, kind, unit, made_to_order, item_barcodes(barcode)")
    .eq("active", true)
    .order("kind")
    .order("name")
  return (data ?? []).map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    kind: i.kind,
    unit: i.unit as Unit,
    madeToOrder: i.made_to_order,
    barcodes: i.item_barcodes.map((b) => b.barcode),
  }))
}

export type TransferItem = Awaited<ReturnType<typeof loadTransferItems>>[number]

/** All active locations (everyone can see the list, to send stock anywhere). */
export async function loadAllLocations() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("locations")
    .select("id, code, name, type, timezone")
    .eq("active", true)
    .order("type")
    .order("name")
  return data ?? []
}

/**
 * Par levels and stock on hand per location, for "fill up to par".
 * Only includes locations the user can see stock for.
 */
export async function loadParLevels(locationIds: string[]) {
  if (locationIds.length === 0) return {}
  const supabase = await createClient()
  const [{ data: settings }, { data: stock }] = await Promise.all([
    supabase
      .from("item_location_settings")
      .select("location_id, item_id, par_level")
      .in("location_id", locationIds)
      .not("par_level", "is", null),
    supabase
      .from("stock_by_item")
      .select("location_id, item_id, qty")
      .in("location_id", locationIds),
  ])

  const onHand = new Map(
    (stock ?? []).map((s) => [`${s.location_id}|${s.item_id}`, Number(s.qty)] as const),
  )
  const result: Record<string, { itemId: string; par: number; onHand: number }[]> = {}
  for (const s of settings ?? []) {
    ;(result[s.location_id] ??= []).push({
      itemId: s.item_id,
      par: Number(s.par_level),
      onHand: onHand.get(`${s.location_id}|${s.item_id}`) ?? 0,
    })
  }
  return result
}

/** Customer orders travelling on a transfer (so the store knows whose box is whose). */
export async function loadTransferOrders(transferId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("customer_orders")
    .select("id, code, status, pickup_date, pickup_time, customers(name), customer_order_lines(qty, items(name))")
    .eq("transfer_id", transferId)
    .neq("status", "cancelled")
    .order("pickup_date")
  return (data ?? []).map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    customerName: o.customers?.name ?? "",
    pickupDate: o.pickup_date,
    pickupTime: o.pickup_time ? o.pickup_time.slice(0, 5) : null,
    items: o.customer_order_lines
      .map((l) => (Number(l.qty) === 1 ? l.items?.name : `${Number(l.qty)} × ${l.items?.name}`))
      .join(", "),
  }))
}
