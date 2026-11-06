// Customer order labels, permissions and money, shared by server and client.
// The rules mirror the database functions, which are the source of truth.

import { canManageLocation, canWorkLocation, type CurrentUser } from "@/lib/permissions"
import type { TransferStatus } from "@/lib/transfers"

export type OrderStatus = "new" | "confirmed" | "ready" | "collected" | "cancelled"

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Not confirmed",
  confirmed: "Confirmed",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
}

export type CakeDetails = {
  size?: string
  flavour?: string
  filling?: string
  inscription?: string
  notes?: string
}

export const CAKE_FIELDS: { key: keyof CakeDetails; label: string; placeholder: string }[] = [
  { key: "size", label: "Size / shape", placeholder: "e.g. 30 cm round, 2 tiers" },
  { key: "flavour", label: "Flavour", placeholder: "e.g. Chocolate" },
  { key: "filling", label: "Filling / icing", placeholder: "e.g. Salted caramel" },
  { key: "inscription", label: "Writing on the cake", placeholder: "e.g. Happy 40th Priya!" },
  { key: "notes", label: "Decoration and notes", placeholder: "e.g. Gold sprinkles, no nuts" },
]

type OrderRef = {
  status: OrderStatus
  takenAtLocationId: string
  pickupLocationId: string
  fulfilLocationId: string
}

export function orderPermissions(user: CurrentUser, o: OrderRef) {
  const workTaken = canWorkLocation(user, o.takenAtLocationId)
  const workPickup = canWorkLocation(user, o.pickupLocationId)
  const workFulfil = canWorkLocation(user, o.fulfilLocationId)
  const manageAny =
    canManageLocation(user, o.takenAtLocationId) ||
    canManageLocation(user, o.pickupLocationId) ||
    canManageLocation(user, o.fulfilLocationId)
  const open = o.status === "new" || o.status === "confirmed"

  return {
    edit: open && (workTaken || workPickup),
    confirm: o.status === "new" && (workTaken || workPickup),
    ready: o.status === "confirmed" && workFulfil,
    // Bakery-made orders must be ready first; shelf orders can go straight away.
    collect:
      (o.status === "ready" ||
        (o.status === "confirmed" && o.fulfilLocationId === o.pickupLocationId)) &&
      workPickup,
    cancel: open ? workTaken || workPickup : o.status === "ready" ? manageAny : false,
  }
}

export type OrderPermissions = ReturnType<typeof orderPermissions>

/** Where the order is now, in plain words for staff. */
export function orderProgress(o: {
  status: OrderStatus
  fulfilLocationId: string
  pickupLocationId: string
  fulfilName: string
  pickupName: string
  transferCode: string | null
  transferStatus: TransferStatus | null
}) {
  const fromShelf = o.fulfilLocationId === o.pickupLocationId
  switch (o.status) {
    case "new":
      return "Waiting to be confirmed"
    case "confirmed":
      return fromShelf ? `To set aside at ${o.pickupName}` : `To be made at ${o.fulfilName}`
    case "ready":
      if (fromShelf) return "Ready to collect"
      if (o.transferStatus === "received") return `At ${o.pickupName}, ready to collect`
      if (o.transferStatus === "in_transit") return `On the way to ${o.pickupName} (${o.transferCode})`
      if (o.transferCode) return `Made; going to ${o.pickupName} on ${o.transferCode}`
      return "Made"
    case "collected":
      return "Collected"
    case "cancelled":
      return "Cancelled"
  }
}

export function orderMoney(
  lines: { qty: number; unitPrice: number }[],
  deposit: number,
  paidOnCollection: number | null,
) {
  const total = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  const balance = Math.max(total - deposit - (paidOnCollection ?? 0), 0)
  return { total, deposit, paid: deposit + (paidOnCollection ?? 0), balance }
}

/** "Custom cake, 24 Vanilla cupcake" */
export function orderSummary(lines: { qty: number; name: string }[]) {
  return lines.map((l) => (l.qty === 1 ? l.name : `${l.qty} × ${l.name}`)).join(", ")
}
