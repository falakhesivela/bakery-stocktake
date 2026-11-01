import { existsSync } from "node:fs"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

if (existsSync(".env.local")) process.loadEnvFile(".env.local")

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

// These tests write data. Never run them against a hosted project.
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error(`DB tests only run against local Supabase (got "${url}")`)
}

export const ids = {
  warehouse: "10000000-0000-0000-0000-000000000001",
  westham: "10000000-0000-0000-0000-000000000002",
  riverside: "10000000-0000-0000-0000-000000000003",
  chocolateCake: "40000000-0000-0000-0000-000000000001",
  redVelvet: "40000000-0000-0000-0000-000000000002",
  carrotCake: "40000000-0000-0000-0000-000000000003",
  cupcake: "40000000-0000-0000-0000-000000000004",
  croissant: "40000000-0000-0000-0000-000000000005",
  whiteLoaf: "40000000-0000-0000-0000-000000000006",
  flour: "40000000-0000-0000-0000-000000000007",
  sugar: "40000000-0000-0000-0000-000000000008",
  butter: "40000000-0000-0000-0000-000000000009",
  eggs: "40000000-0000-0000-0000-000000000010",
  cocoa: "40000000-0000-0000-0000-000000000011",
  cakeBox: "40000000-0000-0000-0000-000000000012",
}

export const users = {
  admin: "admin@bakery.test",
  warehouse: "warehouse@bakery.test",
  westhamManager: "westham@bakery.test",
  westhamStaff: "staff@bakery.test",
  riversideManager: "riverside@bakery.test",
  baker: "baker@bakery.test",
  driver: "driver@bakery.test",
}

export type Client = SupabaseClient<Database>

export function serviceClient(): Client {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function signedIn(email: string): Promise<Client> {
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: "password123" })
  if (error) throw new Error(`Sign in failed for ${email}: ${error.message}`)
  return client
}

/** Oldest-expiry batch with stock of an item at a location (null if none). */
export async function fefoBatch(client: Client, locationId: string, itemId: string) {
  const { data, error } = await client
    .from("stock_on_hand")
    .select("batch_id, qty, best_before")
    .eq("location_id", locationId)
    .eq("item_id", itemId)
    .gt("qty", 0)
    .order("best_before", { nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Total stock of one batch (or untracked item when batchId is null). */
export async function levelOf(locationId: string, itemId: string, batchId: string | null) {
  let query = serviceClient()
    .from("stock_levels")
    .select("qty")
    .eq("location_id", locationId)
    .eq("item_id", itemId)
  query = batchId ? query.eq("batch_id", batchId) : query.is("batch_id", null)
  const { data } = await query.maybeSingle()
  return Number(data?.qty ?? 0)
}

/** Checks that the cached stock levels equal the sum of the ledger. */
export async function ledgerMismatches() {
  const service = serviceClient()
  const [{ data: movements }, { data: levels }] = await Promise.all([
    service.from("stock_movements").select("location_id, item_id, batch_id, qty"),
    service.from("stock_levels").select("location_id, item_id, batch_id, qty"),
  ])
  const key = (r: { location_id: string; item_id: string; batch_id: string | null }) =>
    `${r.location_id}|${r.item_id}|${r.batch_id ?? "-"}`
  const sums = new Map<string, number>()
  for (const m of movements!) sums.set(key(m), (sums.get(key(m)) ?? 0) + Number(m.qty))

  const problems: string[] = []
  if (levels!.length !== sums.size) problems.push(`${levels!.length} levels vs ${sums.size} keys`)
  for (const level of levels!) {
    const expected = sums.get(key(level))
    if (expected === undefined || Math.abs(Number(level.qty) - expected) > 0.0005) {
      problems.push(`${key(level)}: level ${level.qty}, ledger ${expected}`)
    }
  }
  return problems
}

/** Today's date (YYYY-MM-DD) in the bakery's timezone. */
export function localToday(timeZone = "Africa/Johannesburg") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date())
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
