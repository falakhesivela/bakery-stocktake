// Date helpers. Dates are plain YYYY-MM-DD strings in a location's timezone,
// matching Postgres `date` columns.

/** Today's date in a timezone, e.g. "2026-11-01" (or the date of `at`). */
export function todayIn(timeZone: string, at: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string) {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
}

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const

/** "Today", "Tomorrow", "Yesterday" or a short date, relative to `today`. */
export function relativeDay(date: string | null | undefined, today: string) {
  if (!date) return "No date"
  if (date === today) return "Today"
  if (date === addDays(today, 1)) return "Tomorrow"
  if (date === addDays(today, -1)) return "Yesterday"
  const [y, m, d] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  }).format(new Date(Date.UTC(y, m - 1, d)))
}
