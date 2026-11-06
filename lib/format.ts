type Unit = "each" | "g" | "kg" | "ml" | "l"

const UNIT_LABELS: Record<Unit, string> = {
  each: "",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
}

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "each", label: "Each (units)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "g", label: "Grams (g)" },
  { value: "l", label: "Litres (L)" },
  { value: "ml", label: "Millilitres (ml)" },
]

export function formatQty(qty: number, unit: Unit = "each") {
  const n = new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(qty)
  const label = UNIT_LABELS[unit]
  return label ? `${n} ${label}` : n
}

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Formats a YYYY-MM-DD date string without timezone shifts. */
export function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function formatDateTime(value: string | null | undefined, timeZone?: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value))
}

export function formatTime(value: string | null | undefined, timeZone?: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value))
}

export type ExpiryStatus = "expired" | "today" | "soon" | "ok" | "none"

/** Classifies days until best-before. "soon" = within 1 day. */
export function expiryStatus(daysToExpiry: number | null | undefined): ExpiryStatus {
  if (daysToExpiry === null || daysToExpiry === undefined) return "none"
  if (daysToExpiry < 0) return "expired"
  if (daysToExpiry === 0) return "today"
  if (daysToExpiry <= 1) return "soon"
  return "ok"
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or a short date. */
export function timeAgo(value: string, now: number = Date.now(), timeZone?: string) {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return "yesterday"
  return formatDateTime(value, timeZone)
}
