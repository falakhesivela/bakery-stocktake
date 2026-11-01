/** Only allow redirects to paths inside this app (blocks //evil.com etc.). */
export function safeNextPath(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string") return fallback
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback
  }
  return value
}
