import "server-only"
import { createClient } from "@/lib/supabase/server"
import type { CakeDetails, OrderStatus } from "@/lib/orders"
import type { TransferStatus } from "@/lib/transfers"

type Unit = "each" | "g" | "kg" | "ml" | "l"

export type OrderLocation = { id: string; code: string; name: string; type: "warehouse" | "store"; timezone: string }

export type OrderLine = {
  id: string
  itemId: string
  name: string
  sku: string
  unit: Unit
  madeToOrder: boolean
  qty: number
  unitPrice: number
  details: CakeDetails | null
  photoPath: string | null
  photoUrl: string | null
}

export type OrderDetail = {
  id: string
  code: string
  status: OrderStatus
  customer: { id: string; name: string; phone: string | null; email: string | null }
  takenAt: OrderLocation
  pickup: OrderLocation
  fulfil: OrderLocation
  pickupDate: string
  pickupTime: string | null
  notes: string | null
  deposit: number
  paidOnCollection: number | null
  transfer: { id: string; code: string; status: TransferStatus } | null
  createdAt: string
  createdBy: string | null
  confirmedAt: string | null
  readyAt: string | null
  readyBy: string | null
  collectedAt: string | null
  collectedBy: string | null
  cancelledAt: string | null
  cancelReason: string | null
  updatedAt: string
  lines: OrderLine[]
}

const LOCATION = "id, code, name, type, timezone"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One order by id or code (O-00042), with signed links to its photos. */
export async function loadOrder(idOrCode: string): Promise<OrderDetail | null> {
  const value = decodeURIComponent(idOrCode).trim()
  const isCode = /^O-\d{1,10}$/i.test(value)
  if (!isCode && !UUID.test(value)) return null

  const supabase = await createClient()
  let query = supabase.from("customer_orders").select(
    `id, code, status, pickup_date, pickup_time, notes, deposit, paid_on_collection, created_at, updated_at,
     confirmed_at, ready_at, collected_at, cancelled_at, cancel_reason,
     customers(id, name, phone, email),
     taken:locations!customer_orders_taken_at_location_id_fkey(${LOCATION}),
     pickup:locations!customer_orders_pickup_location_id_fkey(${LOCATION}),
     fulfil:locations!customer_orders_fulfil_location_id_fkey(${LOCATION}),
     transfers(id, code, status),
     creator:profiles!customer_orders_created_by_fkey(full_name),
     readier:profiles!customer_orders_ready_by_fkey(full_name),
     collector:profiles!customer_orders_collected_by_fkey(full_name),
     customer_order_lines(id, position, item_id, qty, unit_price, details, photo_path, items(name, sku, unit, made_to_order))`,
  )
  query = isCode ? query.eq("code", value.toUpperCase()) : query.eq("id", value)
  const { data: o, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!o || !o.customers || !o.taken || !o.pickup || !o.fulfil) return null

  const paths = o.customer_order_lines.map((l) => l.photo_path).filter((p): p is string => Boolean(p))
  const signed = paths.length
    ? ((await supabase.storage.from("photos").createSignedUrls(paths, 3600)).data ?? [])
    : []
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]))

  return {
    id: o.id,
    code: o.code,
    status: o.status,
    customer: o.customers,
    takenAt: o.taken,
    pickup: o.pickup,
    fulfil: o.fulfil,
    pickupDate: o.pickup_date,
    pickupTime: o.pickup_time ? o.pickup_time.slice(0, 5) : null,
    notes: o.notes,
    deposit: Number(o.deposit),
    paidOnCollection: o.paid_on_collection === null ? null : Number(o.paid_on_collection),
    transfer: o.transfers,
    createdAt: o.created_at,
    createdBy: o.creator?.full_name ?? null,
    confirmedAt: o.confirmed_at,
    readyAt: o.ready_at,
    readyBy: o.readier?.full_name ?? null,
    collectedAt: o.collected_at,
    collectedBy: o.collector?.full_name ?? null,
    cancelledAt: o.cancelled_at,
    cancelReason: o.cancel_reason,
    updatedAt: o.updated_at,
    lines: [...o.customer_order_lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        itemId: l.item_id,
        name: l.items?.name ?? "",
        sku: l.items?.sku ?? "",
        unit: (l.items?.unit ?? "each") as Unit,
        madeToOrder: l.items?.made_to_order ?? false,
        qty: Number(l.qty),
        unitPrice: Number(l.unit_price),
        details: (l.details as CakeDetails | null) ?? null,
        photoPath: l.photo_path,
        photoUrl: l.photo_path ? (urlFor.get(l.photo_path) ?? null) : null,
      })),
  }
}

/** Order items for forms: products, with made-to-order ones flagged. */
export async function loadOrderItems() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("items")
    .select("id, sku, name, unit, price, made_to_order")
    .eq("active", true)
    .eq("kind", "product")
    .order("name")
  return (data ?? []).map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    unit: i.unit as Unit,
    price: i.price === null ? null : Number(i.price),
    madeToOrder: i.made_to_order,
  }))
}

export type OrderItem = Awaited<ReturnType<typeof loadOrderItems>>[number]
