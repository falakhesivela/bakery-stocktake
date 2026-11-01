import { beforeAll, describe, expect, it } from "vitest"
import {
  addDays,
  ids,
  ledgerMismatches,
  levelOf,
  localToday,
  serviceClient,
  signedIn,
  users,
  type Client,
} from "./helpers"

let admin: Client
let baker: Client
let warehouseManager: Client
let westhamManager: Client
let westhamStaff: Client

const today = localToday()
const run = Date.now().toString(36).toUpperCase().slice(-6)

/** A fresh bakery per test run, with its own ingredient stock. */
let bakery: string
/** A fresh product per run, with a recipe: 4 per round = 1 kg flour, 0.6 kg butter, 2 eggs. */
let product: string
let butterSoon: string // best before in 5 days
let butterLater: string // best before in 20 days

beforeAll(async () => {
  ;[admin, baker, warehouseManager, westhamManager, westhamStaff] = await Promise.all([
    signedIn(users.admin),
    signedIn(users.baker),
    signedIn(users.warehouse),
    signedIn(users.westhamManager),
    signedIn(users.westhamStaff),
  ])

  const { data: loc, error } = await admin
    .from("locations")
    .insert({ code: `B${run}`.slice(0, 12), name: `Test bakery ${run}`, type: "warehouse", can_produce: true })
    .select("id")
    .single()
  if (error) throw error
  bakery = loc.id

  await admin.rpc("post_opening_stock", {
    p_location_id: bakery,
    p_lines: [
      { item_id: ids.flour, qty: 10 },
      { item_id: ids.butter, qty: 1, produced_on: today, best_before: addDays(today, 5) },
      { item_id: ids.butter, qty: 5, produced_on: today, best_before: addDays(today, 20) },
      { item_id: ids.eggs, qty: 50 },
    ],
  })
  const { data: butterRows } = await serviceClient()
    .from("stock_levels")
    .select("batch_id, batches(best_before)")
    .eq("location_id", bakery)
    .eq("item_id", ids.butter)
  butterSoon = butterRows!.find((r) => r.batches?.best_before === addDays(today, 5))!.batch_id!
  butterLater = butterRows!.find((r) => r.batches?.best_before === addDays(today, 20))!.batch_id!

  const { data: itemId, error: itemError } = await admin.rpc("save_item", {
    p_item: { sku: `TART-${run}`, name: `Test tart ${run}`, kind: "product", unit: "each", shelf_life_days: 2 },
    p_barcodes: [],
  })
  if (itemError) throw itemError
  product = itemId!
})

describe("recipes", () => {
  it("only admins and bakery managers can change recipes", async () => {
    const byStore = await westhamManager.rpc("save_recipe", {
      p_product_item_id: product,
      p_yield: 4,
      p_lines: [{ item_id: ids.flour, qty: 1 }],
    })
    expect(byStore.error?.code).toBe("42501")

    const byBaker = await baker.rpc("save_recipe", {
      p_product_item_id: product,
      p_yield: 4,
      p_lines: [{ item_id: ids.flour, qty: 1 }],
    })
    expect(byBaker.error?.code).toBe("42501")
  })

  it("rejects a product in its own recipe, duplicates and zero amounts", async () => {
    const self = await warehouseManager.rpc("save_recipe", {
      p_product_item_id: product,
      p_yield: 4,
      p_lines: [{ item_id: product, qty: 1 }],
    })
    expect(self.error?.message).toMatch(/itself/)

    const twice = await warehouseManager.rpc("save_recipe", {
      p_product_item_id: product,
      p_yield: 4,
      p_lines: [
        { item_id: ids.flour, qty: 1 },
        { item_id: ids.flour, qty: 2 },
      ],
    })
    expect(twice.error?.message).toMatch(/twice/)

    const zero = await warehouseManager.rpc("save_recipe", {
      p_product_item_id: product,
      p_yield: 4,
      p_lines: [{ item_id: ids.flour, qty: 0 }],
    })
    expect(zero.error?.message).toMatch(/how much/)
  })

  it("a bakery manager saves a recipe; its cost comes from ingredient prices", async () => {
    const { error } = await warehouseManager.rpc("save_recipe", {
      p_product_item_id: product,
      p_yield: 4,
      p_lines: [
        { item_id: ids.flour, qty: 1 },
        { item_id: ids.butter, qty: 0.6 },
        { item_id: ids.eggs, qty: 2 },
      ],
      p_notes: "test",
    })
    expect(error).toBeNull()

    const { data: items } = await admin.from("items").select("id, cost").in("id", [ids.flour, ids.butter, ids.eggs])
    const cost = new Map(items!.map((i) => [i.id, Number(i.cost)]))
    const expected = (cost.get(ids.flour)! * 1 + cost.get(ids.butter)! * 0.6 + cost.get(ids.eggs)! * 2) / 4

    const { data } = await admin.from("recipe_costs").select("unit_cost").eq("product_item_id", product).single()
    expect(Number(data!.unit_cost)).toBeCloseTo(expected, 4)
  })
})

describe("baking with a recipe", () => {
  let runId: string

  it("takes the ingredients out, oldest butter batch first", async () => {
    const { data, error } = await admin.rpc("log_production", {
      p_location_id: bakery,
      p_item_id: product,
      p_qty: 10, // 2.5 rounds: 2.5 kg flour, 1.5 kg butter, 5 eggs
    })
    expect(error).toBeNull()
    expect(data![0].ingredients_used).toBe(3)
    runId = data![0].run_id

    expect(await levelOf(bakery, ids.flour, null)).toBe(7.5)
    expect(await levelOf(bakery, ids.butter, butterSoon)).toBe(0)
    expect(await levelOf(bakery, ids.butter, butterLater)).toBe(4.5)
    expect(await levelOf(bakery, ids.eggs, null)).toBe(45)

    const { data: runRow } = await admin.from("production_runs").select("used_recipe").eq("id", runId).single()
    expect(runRow!.used_recipe).toBe(true)
  })

  it("undoing the bake puts the ingredients back", async () => {
    const { error } = await admin.rpc("void_production_run", { p_run_id: runId, p_reason: "test" })
    expect(error).toBeNull()
    expect(await levelOf(bakery, ids.flour, null)).toBe(10)
    expect(await levelOf(bakery, ids.butter, butterSoon)).toBe(1)
    expect(await levelOf(bakery, ids.butter, butterLater)).toBe(5)
    expect(await levelOf(bakery, ids.eggs, null)).toBe(50)
  })

  it("can skip the recipe", async () => {
    const { data } = await admin.rpc("log_production", {
      p_location_id: bakery,
      p_item_id: product,
      p_qty: 4,
      p_use_recipe: false,
    })
    expect(data![0].ingredients_used).toBe(0)
    expect(await levelOf(bakery, ids.flour, null)).toBe(10)
  })

  it("lists the ingredients needed for open orders", async () => {
    // Westham asks the test bakery for 24 tarts tomorrow; 4 are in stock, so 20 to bake.
    const tomorrow = addDays(today, 1)
    const { data: transferId } = await westhamManager.rpc("save_transfer", {
      p_transfer: { origin: "request", from_location_id: bakery, to_location_id: ids.westham, needed_on: tomorrow },
      p_lines: [{ item_id: product, qty: 24 }],
    })
    await westhamManager.rpc("submit_transfer", { p_id: transferId! })

    const { data } = await admin.rpc("production_ingredient_needs", { p_location_id: bakery, p_date: tomorrow })
    const flour = data!.find((r) => r.item_id === ids.flour)!
    expect(Number(flour.needed)).toBe(5) // 20 / 4 × 1 kg
    expect(Number(flour.short)).toBe(0)
    const eggs = data!.find((r) => r.item_id === ids.eggs)!
    expect(Number(eggs.needed)).toBe(10)
  })
})

describe("deliveries from suppliers", () => {
  let receiptId: string

  it("staff receive a delivery; batch-tracked items get a dated batch", async () => {
    const yesterday = addDays(today, -1)
    const { data, error } = await baker.rpc("receive_goods", {
      p_location_id: ids.warehouse,
      p_supplier_id: "50000000-0000-0000-0000-000000000002",
      p_received_on: yesterday,
      p_reference: `TEST-${run}`,
      p_lines: [
        { item_id: ids.butter, qty: 4, unit_cost: 115, supplier_batch: "LOT-1" },
        { item_id: ids.eggs, qty: 60, unit_cost: 2.9 },
      ],
    })
    expect(error).toBeNull()
    receiptId = data!

    const { data: lines } = await baker
      .from("goods_receipt_lines")
      .select("item_id, batch_id, best_before, supplier_batch, batches(source, produced_on)")
      .eq("receipt_id", receiptId)
    const butter = lines!.find((l) => l.item_id === ids.butter)!
    expect(butter.batch_id).toBeTruthy()
    expect(butter.best_before).toBe(addDays(yesterday, 30)) // butter keeps 30 days
    expect(butter.batches).toEqual({ source: "purchase", produced_on: yesterday })
    expect(lines!.find((l) => l.item_id === ids.eggs)!.batch_id).toBeNull()

    expect(await levelOf(ids.warehouse, ids.butter, butter.batch_id)).toBe(4)
    const { data: moves } = await baker
      .from("stock_movements")
      .select("type, business_date")
      .eq("reference_id", receiptId)
    expect(moves!.every((m) => m.type === "purchase_in" && m.business_date === yesterday)).toBe(true)
  })

  it("only managers can update cost prices from a delivery", async () => {
    const byStaff = await baker.rpc("receive_goods", {
      p_location_id: ids.warehouse,
      p_lines: [{ item_id: ids.sugar, qty: 1, unit_cost: 25 }],
      p_update_costs: true,
    })
    expect(byStaff.error?.code).toBe("42501")

    const { data: before } = await admin.from("items").select("cost").eq("id", ids.sugar).single()
    const { error } = await warehouseManager.rpc("receive_goods", {
      p_location_id: ids.warehouse,
      p_lines: [{ item_id: ids.sugar, qty: 1, unit_cost: 23.456 }],
      p_update_costs: true,
    })
    expect(error).toBeNull()
    const { data: after } = await admin.from("items").select("cost").eq("id", ids.sugar).single()
    expect(Number(after!.cost)).toBe(23.46)
    // Put the seeded cost back.
    await admin.from("items").update({ cost: before!.cost }).eq("id", ids.sugar)
  })

  it("store staff can't receive at the warehouse; a future date is refused", async () => {
    const other = await westhamStaff.rpc("receive_goods", {
      p_location_id: ids.warehouse,
      p_lines: [{ item_id: ids.eggs, qty: 1 }],
    })
    expect(other.error?.code).toBe("42501")

    const future = await baker.rpc("receive_goods", {
      p_location_id: ids.warehouse,
      p_received_on: addDays(today, 1),
      p_lines: [{ item_id: ids.eggs, qty: 1 }],
    })
    expect(future.error?.message).toMatch(/future/)
  })

  it("a manager can cancel a delivery, which takes the stock back out", async () => {
    const byStaff = await baker.rpc("void_goods_receipt", { p_id: receiptId, p_reason: "x" })
    expect(byStaff.error?.code).toBe("42501")

    const { data: line } = await admin
      .from("goods_receipt_lines")
      .select("batch_id")
      .eq("receipt_id", receiptId)
      .eq("item_id", ids.butter)
      .single()
    const { error } = await warehouseManager.rpc("void_goods_receipt", { p_id: receiptId, p_reason: "Wrong supplier" })
    expect(error).toBeNull()
    expect(await levelOf(ids.warehouse, ids.butter, line!.batch_id)).toBe(0)
  })

  it("deliveries count as stock in on the daily summary", async () => {
    const { data } = await admin.rpc("daily_summary", {
      p_location_id: ids.warehouse,
      p_date: addDays(today, -1),
    })
    const cocoa = data!.find((r) => r.item_id === ids.cocoa)!
    expect(Number(cocoa.received)).toBeGreaterThanOrEqual(2) // seeded delivery
  })
})

describe("suppliers and reorder levels", () => {
  it("managers keep the supplier list; staff can only read it", async () => {
    const name = `Test supplier ${run}`
    const byStaff = await westhamStaff.from("suppliers").insert({ name }).select()
    expect(byStaff.error).not.toBeNull()

    const { error } = await westhamManager.from("suppliers").insert({ name })
    expect(error).toBeNull()
    const { data } = await westhamStaff.from("suppliers").select("name").eq("name", name)
    expect(data).toHaveLength(1)
  })

  it("managers set reorder levels for their own locations only", async () => {
    const own = await westhamManager
      .from("item_location_settings")
      .upsert({ item_id: ids.croissant, location_id: ids.westham, reorder_level: 6, par_level: 24 })
    expect(own.error).toBeNull()

    const other = await westhamManager
      .from("item_location_settings")
      .upsert({ item_id: ids.croissant, location_id: ids.riverside, reorder_level: 6 })
    expect(other.error).not.toBeNull()
  })
})

describe("ledger after recipes and deliveries", () => {
  it("still balances", async () => {
    expect(await ledgerMismatches()).toEqual([])
  })
})
