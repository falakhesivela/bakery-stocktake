import { beforeAll, describe, expect, it } from "vitest"
import { ids, ledgerMismatches, serviceClient, signedIn, users, type Client } from "./helpers"

let admin: Client
let westhamManager: Client
let westhamStaff: Client
let riversideManager: Client

beforeAll(async () => {
  ;[admin, westhamManager, westhamStaff, riversideManager] = await Promise.all([
    signedIn(users.admin),
    signedIn(users.westhamManager),
    signedIn(users.westhamStaff),
    signedIn(users.riversideManager),
  ])
})

describe("row-level security", () => {
  it("store staff only see stock at their own store", async () => {
    const { data, error } = await westhamStaff.from("stock_levels").select("location_id")
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(new Set(data!.map((r) => r.location_id))).toEqual(new Set([ids.westham]))
  })

  it("admins see stock at every location", async () => {
    const { data } = await admin.from("stock_levels").select("location_id")
    // Other tests add their own test stores, so check these three are included.
    expect([...new Set(data!.map((r) => r.location_id))]).toEqual(
      expect.arrayContaining([ids.warehouse, ids.westham, ids.riverside]),
    )
  })

  it("nobody can write to the ledger directly", async () => {
    const { error } = await admin.from("stock_movements").insert({
      location_id: ids.westham,
      item_id: ids.flour,
      qty: 5,
      type: "manual_adjustment",
      business_date: "2026-01-01",
    })
    expect(error).not.toBeNull()
  })

  it("staff cannot make themselves admin", async () => {
    const { data: me } = await westhamStaff.auth.getUser()
    const { error } = await westhamStaff
      .from("profiles")
      .update({ is_admin: true })
      .eq("id", me.user!.id)
    expect(error?.code).toBe("42501")
  })

  it("only admins can change the catalogue", async () => {
    const { data } = await westhamManager
      .from("items")
      .update({ name: "Hacked" })
      .eq("id", ids.chocolateCake)
      .select()
    expect(data).toEqual([])
  })
})

describe("post_opening_stock", () => {
  it("lets a manager post stock at their own location and creates a batch", async () => {
    const { data, error } = await westhamManager.rpc("post_opening_stock", {
      p_location_id: ids.westham,
      p_lines: [{ item_id: ids.chocolateCake, qty: 2, produced_on: null, best_before: null }],
      p_note: "test",
    })
    expect(error).toBeNull()
    expect(data).toBe(1)

    const { data: batch } = await westhamManager
      .from("batches")
      .select("code, produced_on, best_before, source")
      .eq("location_id", ids.westham)
      .eq("source", "opening")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
    expect(batch!.code).toMatch(/^B\d{6}-\d{5}$/)
    // Chocolate cake has a 4-day shelf life.
    const days =
      (Date.parse(batch!.best_before!) - Date.parse(batch!.produced_on)) / 86_400_000
    expect(days).toBe(4)
  })

  it("rejects managers posting at another location", async () => {
    const { error } = await riversideManager.rpc("post_opening_stock", {
      p_location_id: ids.westham,
      p_lines: [{ item_id: ids.chocolateCake, qty: 1 }],
    })
    expect(error?.code).toBe("42501")
  })

  it("rejects store staff (not managers)", async () => {
    const { error } = await westhamStaff.rpc("post_opening_stock", {
      p_location_id: ids.westham,
      p_lines: [{ item_id: ids.chocolateCake, qty: 1 }],
    })
    expect(error?.code).toBe("42501")
  })

  it("rejects zero or negative quantities", async () => {
    const { error } = await westhamManager.rpc("post_opening_stock", {
      p_location_id: ids.westham,
      p_lines: [{ item_id: ids.chocolateCake, qty: 0 }],
    })
    expect(error?.message).toMatch(/more than 0/)
  })
})

describe("ledger", () => {
  it("stock_levels always equals the sum of stock_movements", async () => {
    expect(await ledgerMismatches()).toEqual([])
  })

  it("is append-only, even for the service role", async () => {
    const service = serviceClient()
    const { error } = await service
      .from("stock_movements")
      .update({ qty: 999 })
      .eq("location_id", ids.westham)
    expect(error?.message).toMatch(/append-only/)
  })
})

describe("catalogue functions", () => {
  it("save_item creates an item with barcodes and blocks duplicate barcodes", async () => {
    const sku = `TEST-${Date.now().toString(36).toUpperCase()}`
    const { data: id, error } = await admin.rpc("save_item", {
      p_item: { sku, name: "Test tart", kind: "product", unit: "each", shelf_life_days: 2 },
      p_barcodes: [`99${Date.now()}`],
    })
    expect(error).toBeNull()
    expect(id).toBeTruthy()

    const { error: dupError } = await admin.rpc("save_item", {
      p_item: { sku: `${sku}-2`, name: "Other", kind: "product", unit: "each" },
      p_barcodes: ["2000000000015"], // chocolate cake's barcode
    })
    expect(dupError?.code).toBe("23505")
  })

  it("find_by_code finds items by barcode, SKU (any case) and batch code", async () => {
    const byBarcode = await westhamStaff.rpc("find_by_code", { p_code: "2000000000015" })
    expect(byBarcode.data?.[0]?.item_id).toBe(ids.chocolateCake)

    const bySku = await westhamStaff.rpc("find_by_code", { p_code: "cake-choc-l" })
    expect(bySku.data?.[0]?.item_id).toBe(ids.chocolateCake)

    const { data: batch } = await westhamStaff
      .from("batches")
      .select("id, code, item_id")
      .limit(1)
      .single()
    const byBatch = await westhamStaff.rpc("find_by_code", { p_code: batch!.code.toLowerCase() })
    expect(byBatch.data?.[0]).toEqual({ item_id: batch!.item_id, batch_id: batch!.id })
  })
})
