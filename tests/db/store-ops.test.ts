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
let driver: Client
let westhamManager: Client
let westhamStaff: Client
let riversideManager: Client

const today = localToday()

/** A fresh store per test run, so dates and stock never collide with earlier runs. */
async function newStore(label: string) {
  const code = `T${Date.now().toString(36).slice(-6)}${label}`.toUpperCase().slice(0, 12)
  const { data, error } = await admin
    .from("locations")
    .insert({ code, name: `Test store ${code}`, type: "store" })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

async function batchesAt(locationId: string, itemId: string) {
  const { data } = await serviceClient()
    .from("stock_levels")
    .select("batch_id, qty, batches(code, best_before)")
    .eq("location_id", locationId)
    .eq("item_id", itemId)
  return data ?? []
}

beforeAll(async () => {
  ;[admin, driver, westhamManager, westhamStaff, riversideManager] = await Promise.all([
    signedIn(users.admin),
    signedIn(users.driver),
    signedIn(users.westhamManager),
    signedIn(users.westhamStaff),
    signedIn(users.riversideManager),
  ])
})

describe("business day on the ledger", () => {
  it("every movement has a business date", async () => {
    const { count } = await serviceClient()
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .is("business_date", null)
    expect(count).toBe(0)
  })
})

describe("end-of-day sales", () => {
  let store: string
  let batchSoon: string // best before tomorrow
  let batchLater: string // best before in 3 days
  let batchExpired: string // best before yesterday

  beforeAll(async () => {
    store = await newStore("S")
    const { error } = await admin.rpc("post_opening_stock", {
      p_location_id: store,
      p_lines: [
        { item_id: ids.chocolateCake, qty: 2, produced_on: addDays(today, -2), best_before: addDays(today, 1) },
        { item_id: ids.chocolateCake, qty: 5, produced_on: today, best_before: addDays(today, 3) },
        { item_id: ids.chocolateCake, qty: 4, produced_on: addDays(today, -4), best_before: addDays(today, -1) },
      ],
    })
    if (error) throw error
    const rows = await batchesAt(store, ids.chocolateCake)
    const byBest = (d: string) => rows.find((r) => r.batches?.best_before === d)!.batch_id!
    batchSoon = byBest(addDays(today, 1))
    batchLater = byBest(addDays(today, 3))
    batchExpired = byBest(addDays(today, -1))
  })

  it("posting takes the oldest in-date batches first and skips expired ones", async () => {
    const { data: dayId, error } = await admin.rpc("save_sales_day", {
      p_location_id: store,
      p_business_date: today,
      p_lines: [{ item_id: ids.chocolateCake, qty: 4 }],
      p_post: true,
    })
    expect(error).toBeNull()
    expect(dayId).toBeTruthy()

    expect(await levelOf(store, ids.chocolateCake, batchSoon)).toBe(0)
    expect(await levelOf(store, ids.chocolateCake, batchLater)).toBe(3)
    expect(await levelOf(store, ids.chocolateCake, batchExpired)).toBe(4)

    const { data: line } = await admin
      .from("sales_lines")
      .select("qty, unit_price")
      .eq("sales_day_id", dayId!)
      .single()
    expect(line).toEqual({ qty: 4, unit_price: 350 })
  })

  it("can't be posted twice or for a future date", async () => {
    const again = await admin.rpc("save_sales_day", {
      p_location_id: store,
      p_business_date: today,
      p_lines: [{ item_id: ids.chocolateCake, qty: 1 }],
      p_post: true,
    })
    expect(again.error?.message).toMatch(/already posted/)

    const future = await admin.rpc("save_sales_day", {
      p_location_id: store,
      p_business_date: addDays(today, 1),
      p_lines: [],
    })
    expect(future.error?.message).toMatch(/future/)
  })

  it("reopening puts back exactly what was taken; selling more than in stock goes negative", async () => {
    const { data: day } = await admin
      .from("sales_days")
      .select("id")
      .eq("location_id", store)
      .eq("business_date", today)
      .single()

    const { error } = await admin.rpc("reopen_sales_day", { p_id: day!.id, p_reason: "Typo" })
    expect(error).toBeNull()
    expect(await levelOf(store, ids.chocolateCake, batchSoon)).toBe(2)
    expect(await levelOf(store, ids.chocolateCake, batchLater)).toBe(5)

    // 12 sold but only 11 in stock: 7 in date, then 4 expired, then 1 without a batch.
    const repost = await admin.rpc("save_sales_day", {
      p_location_id: store,
      p_business_date: today,
      p_lines: [{ item_id: ids.chocolateCake, qty: 12 }],
      p_post: true,
    })
    expect(repost.error).toBeNull()
    expect(await levelOf(store, ids.chocolateCake, batchSoon)).toBe(0)
    expect(await levelOf(store, ids.chocolateCake, batchLater)).toBe(0)
    expect(await levelOf(store, ids.chocolateCake, batchExpired)).toBe(0)
    expect(await levelOf(store, ids.chocolateCake, null)).toBe(-1)
  })

  it("only managers reopen, and only staff of the location enter sales", async () => {
    const { data: westhamDay } = await westhamManager
      .from("sales_days")
      .select("id")
      .eq("location_id", ids.westham)
      .eq("status", "posted")
      .limit(1)
      .single()
    const byStaff = await westhamStaff.rpc("reopen_sales_day", { p_id: westhamDay!.id })
    expect(byStaff.error?.code).toBe("42501")

    for (const client of [riversideManager, driver]) {
      const { error } = await client.rpc("save_sales_day", {
        p_location_id: ids.westham,
        p_business_date: today,
        p_lines: [],
      })
      expect(error?.code).toBe("42501")
    }
  })
})

describe("waste", () => {
  let store: string

  beforeAll(async () => {
    store = await newStore("W")
    await admin.rpc("post_opening_stock", {
      p_location_id: store,
      p_lines: [
        { item_id: ids.croissant, qty: 6, produced_on: addDays(today, -3), best_before: addDays(today, -1) },
        { item_id: ids.croissant, qty: 10, produced_on: today, best_before: addDays(today, 2) },
        { item_id: ids.cakeBox, qty: 20 },
      ],
    })
  })

  it("without a batch, takes expired stock first; with a batch, takes that batch", async () => {
    const rows = await batchesAt(store, ids.croissant)
    const expired = rows.find((r) => r.batches?.best_before === addDays(today, -1))!.batch_id!
    const fresh = rows.find((r) => r.batches?.best_before === addDays(today, 2))!.batch_id!

    const { data, error } = await admin.rpc("log_waste", {
      p_location_id: store,
      p_lines: [
        { item_id: ids.croissant, qty: 4, reason: "expired" },
        { item_id: ids.croissant, batch_id: fresh, qty: 1, reason: "damaged", note: "Squashed" },
        { item_id: ids.cakeBox, qty: 2, reason: "damaged" },
      ],
    })
    expect(error).toBeNull()
    expect(data).toBe(3)
    expect(await levelOf(store, ids.croissant, expired)).toBe(2)
    expect(await levelOf(store, ids.croissant, fresh)).toBe(9)
    expect(await levelOf(store, ids.cakeBox, null)).toBe(18)
  })

  it("can be undone once, putting the stock back", async () => {
    const { data: entry } = await admin
      .from("waste_entries")
      .select("id, batch_id")
      .eq("location_id", store)
      .eq("reason", "damaged")
      .eq("item_id", ids.croissant)
      .single()
    const { error } = await admin.rpc("void_waste_entry", { p_id: entry!.id, p_reason: "Wrong item" })
    expect(error).toBeNull()
    expect(await levelOf(store, ids.croissant, entry!.batch_id)).toBe(10)

    const again = await admin.rpc("void_waste_entry", { p_id: entry!.id, p_reason: "again" })
    expect(again.error?.message).toMatch(/already been undone/)
  })

  it("rejects batches from elsewhere, photos from another location and missing reasons", async () => {
    const { data: westhamBatch } = await admin
      .from("stock_levels")
      .select("batch_id")
      .eq("location_id", ids.westham)
      .not("batch_id", "is", null)
      .gt("qty", 0)
      .limit(1)
      .single()
    const wrongBatch = await admin.rpc("log_waste", {
      p_location_id: store,
      p_lines: [{ item_id: ids.chocolateCake, batch_id: westhamBatch!.batch_id, qty: 1, reason: "other" }],
    })
    expect(wrongBatch.error).not.toBeNull()

    const wrongPhoto = await admin.rpc("log_waste", {
      p_location_id: store,
      p_lines: [{ item_id: ids.cakeBox, qty: 1, reason: "other", photo_path: `${ids.westham}/waste/x.jpg` }],
    })
    expect(wrongPhoto.error?.message).toMatch(/photo/)

    const noReason = await admin.rpc("log_waste", {
      p_location_id: store,
      p_lines: [{ item_id: ids.cakeBox, qty: 1 }],
    })
    expect(noReason.error?.message).toMatch(/reason/)
  })

  it("drivers can't log waste", async () => {
    const { error } = await driver.rpc("log_waste", {
      p_location_id: ids.warehouse,
      p_lines: [{ item_id: ids.cakeBox, qty: 1, reason: "damaged" }],
    })
    expect(error?.code).toBe("42501")
  })
})

describe("waste photos (storage)", () => {
  // 1×1 transparent PNG.
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
    (c) => c.charCodeAt(0),
  )

  it("staff can upload and read photos for their own location only", async () => {
    const name = `${ids.westham}/waste/test-${Date.now()}.png`
    const own = await westhamStaff.storage.from("photos").upload(name, png, { contentType: "image/png" })
    expect(own.error).toBeNull()

    const other = await westhamStaff.storage
      .from("photos")
      .upload(`${ids.riverside}/waste/test-${Date.now()}.png`, png, { contentType: "image/png" })
    expect(other.error).not.toBeNull()

    const signed = await westhamManager.storage.from("photos").createSignedUrl(name, 60)
    expect(signed.error).toBeNull()
    const notTheirs = await riversideManager.storage.from("photos").createSignedUrl(name, 60)
    expect(notTheirs.error).not.toBeNull()

    const logged = await westhamStaff.rpc("log_waste", {
      p_location_id: ids.westham,
      p_lines: [{ item_id: ids.cakeBox, qty: 1, reason: "damaged", photo_path: name }],
    })
    expect(logged.error).toBeNull()
  })
})

describe("stock takes", () => {
  let store: string
  let croissantBatch: string
  let cupcakeBatch: string
  let takeId: string

  beforeAll(async () => {
    store = await newStore("C")
    await admin.rpc("post_opening_stock", {
      p_location_id: store,
      p_lines: [
        { item_id: ids.croissant, qty: 10 },
        { item_id: ids.cupcake, qty: 10 },
        { item_id: ids.flour, qty: 25 },
      ],
    })
    croissantBatch = (await batchesAt(store, ids.croissant))[0].batch_id!
    cupcakeBatch = (await batchesAt(store, ids.cupcake))[0].batch_id!
  })

  it("starts with every product batch in stock (products only)", async () => {
    const { data, error } = await admin.rpc("start_stock_take", {
      p_location_id: store,
      p_count_date: today,
      p_scope: "products",
      p_blind: true,
    })
    expect(error).toBeNull()
    takeId = data!

    const { data: lines } = await admin
      .from("stock_take_lines")
      .select("item_id, batch_id")
      .eq("stock_take_id", takeId)
    const items = new Set(lines!.map((l) => l.item_id))
    expect(items.has(ids.croissant)).toBe(true)
    expect(items.has(ids.cupcake)).toBe(true)
    expect(items.has(ids.flour)).toBe(false) // ingredient: not in a products count
  })

  it("counts by typing and by scanning batch labels", async () => {
    const { data: lines } = await admin
      .from("stock_take_lines")
      .select("id, item_id")
      .eq("stock_take_id", takeId)
    const croissantLine = lines!.find((l) => l.item_id === ids.croissant)!

    // Typed: 6 croissants on the shelf (4 were sold today, entered later).
    expect(
      (await admin.rpc("set_stock_take_count", { p_line_id: croissantLine.id, p_counted: 6 })).error,
    ).toBeNull()

    // Scanned: each scan of the cupcake batch label adds one; 6 scans.
    const { data: batch } = await admin.from("batches").select("code").eq("id", cupcakeBatch).single()
    let last: { counted_qty: number } | undefined
    for (let i = 0; i < 6; i++) {
      const { data, error } = await admin.rpc("add_stock_take_count", {
        p_stock_take_id: takeId,
        p_code: batch!.code.toLowerCase(),
      })
      expect(error).toBeNull()
      last = data![0]
    }
    expect(Number(last!.counted_qty)).toBe(6)

    // A product barcode isn't enough for batch-tracked items.
    const barcode = await admin.rpc("add_stock_take_count", {
      p_stock_take_id: takeId,
      p_code: "2000000000046",
    })
    expect(barcode.error?.message).toMatch(/batch label/)

    // Items without batches can be scanned by SKU; found stock is added to the list.
    const box = await admin.rpc("add_stock_take_count", {
      p_stock_take_id: takeId,
      p_code: "BOX-CAKE-L",
      p_delta: 3,
    })
    expect(box.error).toBeNull()
    expect(Number(box.data![0].counted_qty)).toBe(3)
  })

  it("sales entered after counting don't cause a double deduction", async () => {
    // 4 croissants and 3 cupcakes were sold today; entered after the count.
    await admin.rpc("save_sales_day", {
      p_location_id: store,
      p_business_date: today,
      p_lines: [
        { item_id: ids.croissant, qty: 4 },
        { item_id: ids.cupcake, qty: 3 },
      ],
      p_post: true,
    })

    const { data: review } = await admin.rpc("stock_take_review", { p_id: takeId })
    const croissant = review!.find((r) => r.item_id === ids.croissant)!
    expect(Number(croissant.expected_qty)).toBe(6)
    expect(Number(croissant.variance)).toBe(0)
    const cupcake = review!.find((r) => r.item_id === ids.cupcake)!
    expect(Number(cupcake.variance)).toBe(-1) // one cupcake missing
  })

  it("only managers approve; approval posts the differences", async () => {
    const { error: submitError } = await admin.rpc("submit_stock_take", { p_id: takeId })
    expect(submitError).toBeNull()

    const { data: adjusted, error } = await admin.rpc("approve_stock_take", { p_id: takeId })
    expect(error).toBeNull()
    expect(adjusted).toBe(2) // cupcake −1, cake boxes +3

    expect(await levelOf(store, ids.croissant, croissantBatch)).toBe(6)
    expect(await levelOf(store, ids.cupcake, cupcakeBatch)).toBe(6)
    expect(await levelOf(store, ids.cakeBox, null)).toBe(3)

    const { data: moves } = await admin
      .from("stock_movements")
      .select("qty, business_date")
      .eq("reference_id", takeId)
      .eq("item_id", ids.cupcake)
    expect(moves).toEqual([{ qty: -1, business_date: today }])
  })

  it("counts must be approved in date order", async () => {
    const { data: older } = await admin.rpc("start_stock_take", {
      p_location_id: store,
      p_count_date: addDays(today, -1),
      p_scope: "all",
    })
    const { data: line } = await admin
      .from("stock_take_lines")
      .select("id")
      .eq("stock_take_id", older!)
      .limit(1)
      .single()
    await admin.rpc("set_stock_take_count", { p_line_id: line!.id, p_counted: 1 })
    const { error } = await admin.rpc("approve_stock_take", { p_id: older! })
    expect(error?.message).toMatch(/date order/)
    expect((await admin.rpc("cancel_stock_take", { p_id: older!, p_reason: "test" })).error).toBeNull()
  })

  it("the daily summary adds up", async () => {
    const { data } = await admin.rpc("daily_summary", { p_location_id: store, p_date: today })
    const cupcake = data!.find((r) => r.item_id === ids.cupcake)!
    expect({
      other: Number(cupcake.other), // opening stock posted today
      sold: Number(cupcake.sold),
      expected: Number(cupcake.expected_closing),
      difference: Number(cupcake.count_difference),
      closing: Number(cupcake.closing),
      counted: cupcake.counted,
    }).toEqual({ other: 10, sold: 3, expected: 7, difference: -1, closing: 6, counted: true })
  })

  it("staff count, managers approve; other stores can't touch it", async () => {
    const { data: id, error } = await westhamStaff.rpc("start_stock_take", {
      p_location_id: ids.westham,
      p_count_date: today,
      p_scope: "products",
    })
    expect(error).toBeNull()

    const byOther = await riversideManager.rpc("add_stock_take_count", {
      p_stock_take_id: id!,
      p_code: "BOX-CAKE-L",
    })
    expect(byOther.error?.code).toBe("42501")

    const { data: lines } = await westhamStaff.from("stock_take_lines").select("id").eq("stock_take_id", id!)
    await westhamStaff.rpc("set_stock_take_count", { p_line_id: lines![0].id, p_counted: 1 })
    const byStaff = await westhamStaff.rpc("approve_stock_take", { p_id: id! })
    expect(byStaff.error?.code).toBe("42501")

    expect((await westhamManager.rpc("cancel_stock_take", { p_id: id!, p_reason: "test" })).error).toBeNull()
    const closed = await westhamStaff.rpc("set_stock_take_count", { p_line_id: lines![0].id, p_counted: 2 })
    expect(closed.error?.message).toMatch(/counting is closed/)
  })
})

describe("ledger after store operations", () => {
  it("still balances", async () => {
    expect(await ledgerMismatches()).toEqual([])
  })
})
