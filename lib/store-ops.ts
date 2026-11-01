// Labels for store daily operations (sales, waste, stock takes).

import type { UserLocation } from "@/lib/permissions"

export type WasteReason = "expired" | "damaged" | "unsold" | "quality" | "staff_sample" | "other"

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  expired: "Past best-before",
  damaged: "Damaged",
  unsold: "Unsold at end of day",
  quality: "Quality problem",
  staff_sample: "Staff / samples",
  other: "Other",
}

export type StockTakeStatus = "counting" | "submitted" | "approved" | "cancelled"
export type StockTakeScope = "products" | "all" | "categories"

export const STOCK_TAKE_STATUS_LABELS: Record<StockTakeStatus, string> = {
  counting: "Counting",
  submitted: "Waiting for approval",
  approved: "Approved",
  cancelled: "Cancelled",
}

export const STOCK_TAKE_SCOPE_LABELS: Record<StockTakeScope, string> = {
  products: "Products (closing count)",
  all: "Everything",
  categories: "Chosen categories",
}

/** Stores first: most daily work happens there. */
export function defaultStoreLocation<T extends Pick<UserLocation, "type">>(locations: T[]) {
  return locations.find((l) => l.type === "store") ?? locations[0]
}
