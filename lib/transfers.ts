// Transfer labels and permission rules shared by server and client code.
// The rules mirror the checks in the database functions, which are the
// source of truth; these only decide which buttons to show.

import { canManageLocation, canWorkLocation, type CurrentUser } from "@/lib/permissions"

export type TransferStatus =
  | "draft"
  | "requested"
  | "approved"
  | "picking"
  | "in_transit"
  | "received"
  | "rejected"
  | "cancelled"

export type TransferOrigin = "request" | "push" | "standing_order"

export type DiscrepancyReason = "missing" | "damaged" | "extra" | "other"

export const STATUS_LABELS: Record<TransferStatus, string> = {
  draft: "Draft",
  requested: "Waiting for approval",
  approved: "Approved",
  picking: "Picking",
  in_transit: "On the way",
  received: "Received",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export const ORIGIN_LABELS: Record<TransferOrigin, string> = {
  request: "Request",
  push: "Sent by warehouse",
  standing_order: "Standing order",
}

export const REASON_LABELS: Record<DiscrepancyReason, string> = {
  missing: "Missing / short",
  damaged: "Damaged",
  extra: "Extra arrived",
  other: "Other",
}

export const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Changed",
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  picking: "Picking started",
  dispatched: "Dispatched",
  received: "Received",
}

/** Statuses that still need someone to act. */
export const OPEN_STATUSES: TransferStatus[] = [
  "draft",
  "requested",
  "approved",
  "picking",
  "in_transit",
]

export const DONE_STATUSES: TransferStatus[] = ["received", "rejected", "cancelled"]

/** Label for the origin, calling store → warehouse pushes "Return". */
export function originLabel(
  origin: TransferOrigin,
  fromType: string | null,
  toType: string | null,
) {
  if (origin === "push" && fromType === "store" && toType === "warehouse") return "Return"
  if (origin === "push" && fromType === "store") return "Sent by store"
  return ORIGIN_LABELS[origin]
}

type TransferRef = {
  fromLocationId: string
  toLocationId: string
  origin: TransferOrigin
  status: TransferStatus
}

export function transferPermissions(user: CurrentUser, t: TransferRef) {
  const manageFrom = canManageLocation(user, t.fromLocationId)
  const manageTo = canManageLocation(user, t.toLocationId)
  const workFrom = canWorkLocation(user, t.fromLocationId)
  const workTo = canWorkLocation(user, t.toLocationId)

  let edit = false
  if (t.status === "draft") edit = t.origin === "push" ? manageFrom : manageTo
  else if (t.status === "requested") edit = manageTo
  else if (t.status === "approved" || t.status === "picking") edit = manageFrom

  let cancel = false
  if (t.status === "draft") cancel = edit
  else if (t.status === "requested") cancel = manageFrom || manageTo
  else if (t.status === "approved" || t.status === "picking") cancel = manageFrom

  return {
    edit,
    submit: t.status === "draft" && edit,
    approve: t.status === "requested" && manageFrom,
    reject: t.status === "requested" && manageFrom,
    cancel,
    pick: (t.status === "approved" || t.status === "picking") && workFrom,
    receive: t.status === "in_transit" && workTo,
  }
}

export type TransferPermissions = ReturnType<typeof transferPermissions>

/** The one thing this user should do next, for list views. */
export function nextAction(perms: TransferPermissions, status: TransferStatus) {
  if (perms.approve) return "Approve"
  if (perms.receive) return "Receive"
  if (perms.pick) return status === "picking" ? "Finish picking" : "Pick"
  if (perms.submit) return "Send"
  return null
}

/** Parses a scanned delivery-note QR (a URL or a bare T-00042 code). */
export function transferCodeFromScan(value: string) {
  const text = value.trim()
  const match = text.match(/\/transfers\/(T-\d{1,10})(?:[/?#]|$)/i) ?? text.match(/^(T-\d{1,10})$/i)
  return match ? match[1].toUpperCase() : null
}
