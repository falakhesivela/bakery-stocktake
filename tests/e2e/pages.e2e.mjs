// Page and permission checks over plain HTTP: each user sees what they
// should, and nothing they shouldn't. Expects fresh demo data.
import { existsSync } from "node:fs"
import { createServerClient } from "@supabase/ssr"
import { BASE } from "./helpers.mjs"

if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", {
  timeZone: "Africa/Johannesburg",
})
const WH = "10000000-0000-0000-0000-000000000001"
const CHOC = "40000000-0000-0000-0000-000000000001"

const cookies = {}
async function cookieFor(email) {
  if (cookies[email]) return cookies[email]
  const jar = new Map()
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  )
  const { error } = await client.auth.signInWithPassword({ email, password: "password123" })
  if (error) throw error
  return (cookies[email] = [...jar].map(([n, v]) => `${n}=${v}`).join("; "))
}

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")

// [user, path, must contain, must not contain]
const CHECKS = [
  // Phase 2: transfers and production
  ["warehouse", "/transfers?tab=needs", ["T-00002", "T-00003", "T-00004", "Approve"], ["T-00001"]],
  ["westham", "/transfers?tab=needs", ["T-00001", "Receive"], ["T-00002"]],
  ["riverside", "/transfers", ["T-00002", "T-00003"], ["T-00001", "T-00004"]],
  ["driver", "/transfers?tab=needs", ["Nothing is waiting for you"], []],
  ["westham", "/transfers/T-00001", ["On the way", "Receive delivery", "Delivery note"], ["Start picking"]],
  ["admin", "/transfers/T-00001/note", ["Delivery note", "Scan to receive", "Received by"], []],
  ["staff", "/transfers/new?type=request", ["Only managers can create transfers"], []],
  ["westham", "/production", ["No bakery locations"], []],
  // Phase 3: store day
  ["westham", `/end-of-day?date=${yesterday}`, ["C-00001 approved", "Posted: 14 items sold", "-1"], []],
  ["westham", `/sales?date=${yesterday}`, ["Posted", "Reopen to correct"], []],
  ["staff", `/sales?date=${yesterday}`, ["ask a manager to reopen"], ["Reopen to correct"]],
  ["staff", "/waste", ["Log waste", "Use or remove", "Vanilla cupcake", "Dropped on the floor"], []],
  ["westham", "/stock-takes/C-00001", ["Result", "Expected", "Vanilla cupcake"], ["Cancel count"]],
  ["driver", "/sales", ["You don't work at a location that sells"], []],
  // Phase 4: recipes and ingredients
  ["admin", "/recipes", ["Cost to make", "Chocolate cake (large)", "72.70", "Margin"], []],
  ["admin", `/recipes/${CHOC}`, ["Recipe: Chocolate cake (large)", "Cocoa powder", "One round", "Save recipe"], []],
  ["baker", `/recipes/${CHOC}`, ["Only admins and bakery managers can change recipes", "Cocoa powder"], ["Save recipe"]],
  ["westham", `/recipes/${CHOC}`, ["Only admins and bakery managers"], ["Save recipe"]],
  ["warehouse", "/deliveries", ["Running low", "Cocoa powder", "R-00001", "Mills & Co", "Receive delivery"], []],
  ["warehouse", "/deliveries/R-00002", ["Dairy Fresh", "DF-8812", "Butter", "Label", "Cancel delivery"], []],
  ["baker", "/deliveries/R-00002", ["Dairy Fresh", "Label"], ["Cancel delivery"]],
  ["staff", "/suppliers", ["Mills & Co", "Dairy Fresh"], ["Add supplier"]],
  ["warehouse", "/suppliers", ["Add supplier", "Pack-It Packaging"], []],
  ["warehouse", "/stock/levels", ["Reorder at", "Order up to", "Cake flour"], []],
  ["staff", "/stock/levels", ["Only managers can set reorder levels"], []],
  ["baker", "/production", ["Ingredients for this bake list", "Cake flour", "Log a bake"], []],
  ["admin", `/end-of-day?location=${WH}&date=${yesterday}&all=1`, ["Cocoa powder", "Sent / used / other"], []],
  ["admin", `/stock/history?location=${WH}`, ["Used in baking", "Supplier delivery", "R-00002"], []],
  ["admin", "/catalogue/40000000-0000-0000-0000-000000000001", ["Recipe and cost to make"], []],
  // Phase 5: customer orders
  ["westham", "/orders", ["To collect", "Priya Naidoo", "Lerato Mokoena", "New order"], ["Tom Jacobs"]],
  ["baker", "/orders?tab=make", ["Priya Naidoo"], ["Lerato Mokoena", "Tom Jacobs"]],
  ["riverside", "/orders", ["Tom Jacobs", "on T-00005"], ["Priya Naidoo"]],
  ["westham", "/orders/O-00001", ["Priya Naidoo", "Salted caramel", "Happy 40th Priya!", "Still to pay", "350.00", "Mark ready"].slice(0, 5), ["Customer collected"]],
  ["baker", "/orders/O-00001", ["Mark ready", "To be made at Central Warehouse"], ["Customer collected", "Change"]],
  ["westham", "/orders/O-00003", ["Customer collected", "Ready to collect"], []],
  ["westham", "/orders/O-00001/ticket?size=sheet", ["Collect", "Happy 40th Priya!", "Salted caramel", "To pay"], []],
  ["baker", "/production", ["Customer orders to make", "Happy 40th Priya!", "Custom cake"], []],
  ["admin", "/transfers/T-00005", ["Customer orders on this delivery", "Tom Jacobs"], []],
  ["westham", "/sales", ["1 customer order was collected here that day"], ["CAKE-CUSTOM"]],
  ["westham", "/dashboard", ["Customer orders", "to hand over today"], []],
  // Phase 6: reports, notifications and audit log
  ["westham", "/reports", ["Shelf sales", "Waste at cost", "By location", "Most wasted", "Vanilla cupcake", "Units sold"], ["Riverside", "Baked"]],
  ["admin", "/reports", ["ST-01", "ST-02", "WH-01", "Baked"], []],
  ["staff", "/reports", ["Reports are for managers"], ["Shelf sales"]],
  ["admin", "/reports?report=sales", ["Shelf sales", "Chocolate cake (large)", "Customer orders collected"], []],
  ["riverside", "/reports?report=waste", ["Waste by reason", "Unsold at end of day", "Butter croissant"], ["Vanilla cupcake"]],
  ["westham", "/reports?report=sell-through", ["Received, sold & wasted", "Sold %", "Waste %", "Vanilla cupcake"], []],
  ["admin", "/reports?report=stock-value", ["Stock on hand, at cost", "Ingredients", "Cocoa powder"], []],
  ["warehouse", "/reports?report=production", ["Butter croissant", "48"], []],
  ["warehouse", "/reports?report=ingredients", ["Recipe use", "Actual use", "Butter"], []],
  ["admin", "/reports?report=counts", ["C-00001", "Vanilla cupcake", "-1"], []],
  ["westham", "/reports?report=deliveries", ["Every delivery in this period arrived as sent"], []],
  ["westham", "/dashboard", ["Last 7 days", "Shelf sales", "Open reports"], []],
  ["staff", "/dashboard", [], ["Last 7 days"]],
  ["warehouse", "/notifications", ["New request T-00002 from Riverside Store", "unread"], []],
  ["staff", "/notifications", ["T-00001 is on the way"], ["T-00002", "New customer order"]],
  ["admin", "/settings/audit", ["Audit log", "Changed by", "Standing orders"], []],
  ["westham", "/settings/audit", [], ["Changed by"]],
  ["westham", "/transfers/standing", ["Suggest from last 4 weeks"], []],
  ["admin", "/stock", ["Download CSV"], []],
]

const NOT_FOUND = [
  ["riverside", "/transfers/T-00001"],
  ["riverside", "/stock-takes/C-00001"],
  ["admin", "/deliveries/R-99999"],
  ["riverside", "/orders/O-00001"],
]

export default async function pages() {
  console.log("\nPages and permissions")
  let failures = 0
  for (const [who, path, has, not] of CHECKS) {
    const res = await fetch(BASE + path, { headers: { cookie: await cookieFor(`${who}@bakery.test`) } })
    const html = await res.text()
    const t = textOf(html)
    const errors = []
    if (res.status !== 200) errors.push(`status ${res.status}`)
    if (/data-dgst|__next_error__/.test(html)) errors.push("error page")
    for (const h of has) if (!t.includes(h)) errors.push(`missing "${h}"`)
    for (const n of not) if (t.includes(n)) errors.push(`unexpected "${n}"`)
    if (errors.length) {
      failures++
      console.log(`   FAIL ${who.padEnd(10)} ${path}  -> ${errors.join("; ")}`)
    }
  }
  for (const [who, path] of NOT_FOUND) {
    const res = await fetch(BASE + path, { headers: { cookie: await cookieFor(`${who}@bakery.test`) } })
    const html = await res.text()
    if (!/NEXT_HTTP_ERROR_FALLBACK;404|could not be found/.test(html)) {
      failures++
      console.log(`   FAIL ${who.padEnd(10)} ${path}  -> expected "not found"`)
    }
  }
  const total = CHECKS.length + NOT_FOUND.length
  console.log(failures ? `  ${failures} of ${total} checks failed.` : `  All ${total} checks passed.`)
  return failures === 0
}

if (process.argv[1]?.endsWith("pages.e2e.mjs")) {
  process.exitCode = (await pages()) ? 0 : 1
}
