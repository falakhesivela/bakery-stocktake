import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"
import { getSupabaseSecretKey, getSupabaseUrl } from "./env"

/**
 * Service-role client: bypasses RLS. Only use after checking the caller is an
 * admin (e.g. for creating staff accounts).
 */
export function createAdminClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
