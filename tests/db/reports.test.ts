import { beforeAll, describe, expect, it } from "vitest"
import { addDays, ids, localToday, serviceClient, signedIn, users, type Client } from "./helpers"

let admin: Client
let baker: Client
let warehouseManager: Client
let westhamManager: Client
let westhamStaff: Client
let riversideManager: Client

const today = localToday()
const monthAgo = addDays(today, -40)

beforeAll(async () => {
  ;[admin, baker, warehouseManager, westhamManager, westhamStaff, riversideManager] = await Promise.all([
    signedIn(users.admin),
    signedIn(users.baker),
    signedIn(users.warehouse),
    signedIn(users.westhamManager),
    signedIn(users.westhamStaff),
    signedIn(users.riversideManager),
  ])
})

describe("reports", () => {
  it("only cover the user's own locations", async () => {
    const { data, error } = await westhamStaff.rpc("report_movements", { p_from: monthAgo, p_to: today })
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(new Set(data!.map((r) => r.location_id))).toEqual(new Set([ids.westham]))

    const waste = await riversideManager.rpc("report_waste", { p_from: monthAgo, p_to: today })
    expect(waste.data!.every((r) => r.location_id === ids.riverside)).toBe(true)
  })

  it("movement totals match the ledger", async () => {
    const { data } = await admin.rpc("report_movements", {
      p_from: monthAgo,
      p_to: today,
      p_location_id: ids.westham,
    })
    const row = data!.find((r) => r.item_id === ids.cupcake)!

    const { data: moves } = await serviceClient()
      .from("stock_movements")
      .select("qty, type")
      .eq("location_id", ids.westham)
      .eq("item_id", ids.cupcake)
      .gte("business_date", monthAgo)
      .lte("business_date", today)
    const sum = (types: string[]) =>
      moves!.filter((m) => types.includes(m.type)).reduce((s, m) => s + Number(m.qty), 0)
    expect(Number(row.sold)).toBeCloseTo(-sum(["sale"]), 3)
    expect(Number(row.wasted)).toBeCloseTo(-sum(["waste"]), 3)
    expect(Number(row.received)).toBeCloseTo(sum(["transfer_in", "transfer_loss", "purchase_in"]), 3)
  })

  it("waste is grouped by reason and valued at cost", async () => {
    const { data } = await admin.rpc("report_waste", { p_from: monthAgo, p_to: today, p_location_id: ids.westham })
    const unsold = data!.find((r) => r.item_id === ids.cupcake && r.reason === "unsold")!
    expect(Number(unsold.cost_value)).toBeCloseTo(Number(unsold.qty) * 8, 2) // cupcakes cost 8
  })

  it("count differences come from approved counts only", async () => {
    const { data } = await westhamManager.rpc("report_count_differences", { p_from: monthAgo, p_to: today })
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((r) => Number(r.difference) !== 0)).toBe(true)
  })

  it("collected customer orders are valued from the order", async () => {
    const { data } = await westhamManager.rpc("report_collected_orders", { p_from: monthAgo, p_to: today })
    const westham = data!.find((r) => r.location_id === ids.westham)
    expect(Number(westham?.orders ?? 0)).toBeGreaterThanOrEqual(1)
  })
})

describe("suggested standing orders", () => {
  it("averages what sold on each weekday", async () => {
    const { data, error } = await westhamManager.rpc("suggest_standing_order", {
      p_from: ids.warehouse,
      p_to: ids.westham,
    })
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    for (const row of data!) {
      expect(row.weekday).toBeGreaterThanOrEqual(1)
      expect(row.weekday).toBeLessThanOrEqual(7)
      expect(Number(row.suggested)).toBe(Math.ceil(Number(row.avg_sold)))
    }
  })

  it("is only for managers of the route", async () => {
    const { error } = await riversideManager.rpc("suggest_standing_order", {
      p_from: ids.warehouse,
      p_to: ids.westham,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("notifications", () => {
  async function unread(client: Client) {
    const { data } = await client.from("notifications").select("id, kind, title, link").is("read_at", null)
    return data ?? []
  }

  it("a request notifies the sender's managers, not the person who made it", async () => {
    const { data: id } = await westhamManager.rpc("save_transfer", {
      p_transfer: { origin: "request", from_location_id: ids.warehouse, to_location_id: ids.westham },
      p_lines: [{ item_id: ids.croissant, qty: 3 }],
    })
    await westhamManager.rpc("submit_transfer", { p_id: id! })
    const { data: t } = await serviceClient().from("transfers").select("code").eq("id", id!).single()

    const forWarehouse = await unread(warehouseManager)
    expect(forWarehouse.some((n) => n.kind === "transfer_requested" && n.link === `/transfers/${t!.code}`)).toBe(true)
    // Bakers aren't managers; the requester isn't told about their own request.
    expect((await unread(baker)).some((n) => n.link === `/transfers/${t!.code}`)).toBe(false)
    expect((await unread(westhamManager)).some((n) => n.link === `/transfers/${t!.code}` && n.kind === "transfer_requested")).toBe(false)

    // Approval tells the store; then clean up.
    await warehouseManager.rpc("approve_transfer", { p_id: id! })
    expect((await unread(westhamManager)).some((n) => n.kind === "transfer_approved" && n.link === `/transfers/${t!.code}`)).toBe(true)
    await warehouseManager.rpc("cancel_transfer", { p_id: id!, p_reason: "test" })
  })

  it("people only see and clear their own notifications", async () => {
    const mine = await unread(warehouseManager)
    expect(mine.length).toBeGreaterThan(0)

    // Riverside can't see Wanda's notifications or mark them read.
    const { data: theirs } = await riversideManager.from("notifications").select("id").in("id", mine.map((n) => n.id))
    expect(theirs).toEqual([])
    const { data: cleared } = await riversideManager.rpc("mark_notifications_read", { p_ids: mine.map((n) => n.id) })
    expect(cleared).toBe(0)

    const { data: done } = await warehouseManager.rpc("mark_notifications_read", { p_ids: [mine[0].id] })
    expect(done).toBe(1)
    expect((await unread(warehouseManager)).some((n) => n.id === mine[0].id)).toBe(false)
  })

  it("daily alerts can't be triggered by users (they run from pg_cron)", async () => {
    const { error } = await westhamStaff.rpc("generate_daily_alerts" as never)
    expect(error).not.toBeNull()
  })
})

describe("audit log", () => {
  it("records catalogue changes with who made them; only admins can read it", async () => {
    const { data: before } = await admin.from("items").select("price").eq("id", ids.whiteLoaf).single()
    const newPrice = Number(before!.price) + 1
    await admin.from("items").update({ price: newPrice }).eq("id", ids.whiteLoaf)

    const { data: me } = await admin.auth.getUser()
    const { data: rows } = await admin
      .from("audit_log")
      .select("table_name, row_key, action, changes, actor")
      .eq("table_name", "items")
      .eq("row_key", ids.whiteLoaf)
      .order("id", { ascending: false })
      .limit(1)
    expect(rows![0]).toMatchObject({ action: "update", actor: me.user!.id })
    expect((rows![0].changes as Record<string, unknown>).price).toEqual([Number(before!.price), newPrice])

    const { data: forStaff } = await westhamManager.from("audit_log").select("id").limit(1)
    expect(forStaff).toEqual([])

    await admin.from("items").update({ price: before!.price }).eq("id", ids.whiteLoaf)
  })

  it("saving a standing order or recipe only logs what changed", async () => {
    const route = { p_from: ids.warehouse, p_to: ids.westham }
    const { data: current } = await westhamManager
      .from("standing_orders")
      .select("item_id, weekday, qty")
      .eq("from_location_id", ids.warehouse)
      .eq("to_location_id", ids.westham)
    const rows = current!.map((r) => ({ item_id: r.item_id, weekday: r.weekday, qty: Number(r.qty) }))
    const latest = async (table: string) => {
      const { data } = await admin.from("audit_log").select("id").eq("table_name", table).order("id", { ascending: false }).limit(1)
      return data?.[0]?.id ?? 0
    }
    const logged = async (table: string, after: number) => {
      const { data } = await admin.from("audit_log").select("action, changes").eq("table_name", table).gt("id", after)
      return data ?? []
    }

    let mark = await latest("standing_orders")
    const changed = rows.map((r, i) => (i === 0 ? { ...r, qty: r.qty + 1 } : r))
    const { error } = await westhamManager.rpc("save_standing_orders", { ...route, p_rows: changed })
    expect(error).toBeNull()
    const entries = await logged("standing_orders", mark)
    expect(entries).toHaveLength(1)
    expect(entries[0].action).toBe("update")
    expect((entries[0].changes as Record<string, unknown>).qty).toEqual([rows[0].qty, rows[0].qty + 1])

    mark = await latest("standing_orders")
    await westhamManager.rpc("save_standing_orders", { ...route, p_rows: rows })
    expect(await logged("standing_orders", mark)).toHaveLength(1)

    const { data: recipe } = await admin
      .from("recipes")
      .select("yield_qty, notes, recipe_lines(ingredient_item_id, qty)")
      .eq("product_item_id", ids.croissant)
      .single()
    mark = await latest("recipe_lines")
    const lines = recipe!.recipe_lines.map((l) => ({ item_id: l.ingredient_item_id, qty: Number(l.qty) }))
    await admin.rpc("save_recipe", {
      p_product_item_id: ids.croissant,
      p_yield: Number(recipe!.yield_qty),
      p_lines: lines,
      p_notes: recipe!.notes ?? undefined,
    })
    expect(await logged("recipe_lines", mark)).toEqual([])
  })

  it("records role changes with a readable key", async () => {
    await westhamManager
      .from("item_location_settings")
      .upsert({ item_id: ids.croissant, location_id: ids.westham, reorder_level: 7 })
    const { data } = await admin
      .from("audit_log")
      .select("row_key, action")
      .eq("table_name", "item_location_settings")
      .order("id", { ascending: false })
      .limit(1)
    expect(data![0].row_key).toBe(`${ids.croissant}|${ids.westham}`)
  })
})
