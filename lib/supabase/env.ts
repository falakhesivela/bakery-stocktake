export function getSupabaseUrl() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
  // Strip an accidental REST path suffix (common copy-paste mistake).
  return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
}

/** Supabase publishable key (`sb_publishable_…`) or legacy anon JWT. */
export function getSupabasePublishableKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    )
  }
  return key
}

/** Supabase secret key (`sb_secret_…`) or legacy service_role JWT. Server only. */
export function getSupabaseSecretKey() {
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)",
    )
  }
  return key
}
