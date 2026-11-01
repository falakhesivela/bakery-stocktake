import { beforeAll, describe, expect, it } from "vitest"
import {
  addDays,
  fefoBatch,
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
let driver: Client
let warehouseManager: Client
let westhamManager: Client
let westhamStaff: Client
let riversideManager: Client

beforeAll(async () => {
  ;[admin, baker, driver, warehouseManager, westhamManager, westhamStaff, riversideManager] =
    await Promise.all([
      signedIn(users.admin),
      signedIn(users.baker),
      signedIn(users.driver),
      signedIn(users.warehouse),
      signedIn(users.westhamManager),
      signedIn(users.westhamStaff),
      signedIn(users.riversideManager),
    ])

  // Make sure the warehouse has fresh cakes and cupcakes to send.
  for (const item of [ids.chocolateCake, ids.cupcake, ids.croissant]) {
    const { error } = await baker.rpc("log_production", {
      p_location_id: ids.warehouse,
      p_item_id: item,
      p_qty: 20,
    })
    if (error) throw error
  }
})

async function linesOf(client: Client, transferId: string) {
  const { data, error } = await client
    .from("transfer_lines")
    .select("id, item_id, requested_qty, qty, dispatched_qty, received_qty")
    .eq("transfer_id", transferId)
  if (error) throw error
  return data
}

async function statusOf(transferId: string) {
  const { data } = await serviceClient()
    .from("transfers")
    .select("status, has_discrepancy")
    .eq("id", transferId)
    .single()
  return data!
}

describe("store request → approve → pick → dispatch → receive", () => {
  let transferId: string
  let chocBatch: string
  let cupcakeBatch: string
  let croissantBatch: string

  it("store staff (not managers) can't request stock", async () => {
    const { error } = await westhamStaff.rpc("save_transfer", {
      p_transfer: { origin: "request", from_location_id: ids.warehouse, to_location_id: ids.westham },
      p_lines: [{ item_id: ids.chocolateCake, qty: 1 }],
    })
    expect(error?.code).toBe("42501")
  })

  it("a store manager drafts and submits a request", async () => {
    const { data, error } = await westhamManager.rpc("save_transfer", {
      p_transfer: {
        origin: "request",
        from_location_id: ids.warehouse,
        to_location_id: ids.westham,
        needed_on: addDays(localToday(), 1),
        note: "test request",
      },
      p_lines: [
        { item_id: ids.chocolateCake, qty: 2 },
        { item_id: ids.cupcake, qty: 6 },
      ],
    })
    expect(error).toBeNull()
    transferId = data!
    expect((await statusOf(transferId)).status).toBe("draft")

    const submitted = await westhamManager.rpc("submit_transfer", { p_id: transferId })
    expect(submitted.data).toBe("requested")

    const lines = await linesOf(westhamManager, transferId)
    expect(lines.every((l) => l.requested_qty === l.qty)).toBe(true)
  })

  it("is invisible to other stores", async () => {
    const { data } = await riversideManager.from("transfers").select("id").eq("id", transferId)
    expect(data).toEqual([])
    const lines = await riversideManager.from("transfer_lines").select("id").eq("transfer_id", transferId)
    expect(lines.data).toEqual([])
  })

  it("can't be approved by the store that asked", async () => {
    const { error } = await westhamManager.rpc("approve_transfer", { p_id: transferId })
    expect(error?.code).toBe("42501")
  })

  it("the warehouse approves with changed quantities", async () => {
    const { error } = await warehouseManager.rpc("approve_transfer", {
      p_id: transferId,
      p_lines: [
        { item_id: ids.chocolateCake, qty: 1 },
        { item_id: ids.croissant, qty: 4 },
        // cupcakes left off: kept on record with qty 0
      ],
    })
    expect(error).toBeNull()
    expect((await statusOf(transferId)).status).toBe("approved")

    const lines = await linesOf(warehouseManager, transferId)
    const byItem = new Map(lines.map((l) => [l.item_id, l]))
    expect(byItem.get(ids.chocolateCake)).toMatchObject({ requested_qty: 2, qty: 1 })
    expect(byItem.get(ids.cupcake)).toMatchObject({ requested_qty: 6, qty: 0 })
    expect(byItem.get(ids.croissant)).toMatchObject({ requested_qty: null, qty: 4 })
  })

  it("the warehouse can add cupcakes back before dispatch", async () => {
    const { error } = await warehouseManager.rpc("save_transfer", {
      p_id: transferId,
      p_transfer: { needed_on: addDays(localToday(), 1), note: "test request" },
      p_lines: [
        { item_id: ids.chocolateCake, qty: 1 },
        { item_id: ids.cupcake, qty: 6 },
        { item_id: ids.croissant, qty: 4 },
      ],
    })
    expect(error).toBeNull()
  })

  it("drivers can see it but not pick it", async () => {
    const { data } = await driver.from("transfers").select("id").eq("id", transferId)
    expect(data).toHaveLength(1)
    const { error } = await driver.rpc("start_picking", { p_id: transferId })
    expect(error?.code).toBe("42501")
  })

  it("a baker picks and dispatches oldest batches first", async () => {
    expect((await baker.rpc("start_picking", { p_id: transferId })).error).toBeNull()
    expect((await statusOf(transferId)).status).toBe("picking")

    chocBatch = (await fefoBatch(baker, ids.warehouse, ids.chocolateCake))!.batch_id!
    cupcakeBatch = (await fefoBatch(baker, ids.warehouse, ids.cupcake))!.batch_id!
    croissantBatch = (await fefoBatch(baker, ids.warehouse, ids.croissant))!.batch_id!

    const before = {
      choc: await levelOf(ids.warehouse, ids.chocolateCake, chocBatch),
      cupcake: await levelOf(ids.warehouse, ids.cupcake, cupcakeBatch),
    }

    const lines = await linesOf(baker, transferId)
    const lineFor = (item: string) => lines.find((l) => l.item_id === item)!.id

    const { error } = await baker.rpc("dispatch_transfer", {
      p_id: transferId,
      p_picks: [
        { line_id: lineFor(ids.chocolateCake), batch_id: chocBatch, qty: 1 },
        { line_id: lineFor(ids.cupcake), batch_id: cupcakeBatch, qty: 6 },
        // Short-picked: only 3 of the 4 croissants.
        { line_id: lineFor(ids.croissant), batch_id: croissantBatch, qty: 3 },
      ],
    })
    expect(error).toBeNull()
    expect((await statusOf(transferId)).status).toBe("in_transit")

    expect(await levelOf(ids.warehouse, ids.chocolateCake, chocBatch)).toBe(before.choc - 1)
    expect(await levelOf(ids.warehouse, ids.cupcake, cupcakeBatch)).toBe(before.cupcake - 6)

    const after = await linesOf(baker, transferId)
    expect(after.find((l) => l.item_id === ids.croissant)).toMatchObject({
      qty: 4,
      dispatched_qty: 3,
    })
  })

  it("can't be dispatched twice", async () => {
    const { error } = await baker.rpc("dispatch_transfer", { p_id: transferId, p_picks: [] })
    expect(error?.message).toMatch(/already been dispatched/)
  })

  it("can't be received by another store", async () => {
    const { error } = await riversideManager.rpc("receive_transfer", {
      p_id: transferId,
      p_lines: [],
    })
    expect(error?.code).toBe("42501")
  })

  it("store staff receive it, reporting one damaged cupcake", async () => {
    const { data: sent } = await westhamStaff
      .from("transfer_line_batches")
      .select("id, item_id, batch_id, dispatched_qty, transfer_lines!inner(transfer_id)")
      .eq("transfer_lines.transfer_id", transferId)
    expect(sent).toHaveLength(3)

    const receivedLines = (reason?: string) =>
      sent!.map((row) => ({
        id: row.id,
        received_qty: row.item_id === ids.cupcake ? 5 : Number(row.dispatched_qty),
        reason: row.item_id === ids.cupcake ? reason : undefined,
        note: row.item_id === ids.cupcake ? "Squashed in the crate" : undefined,
      }))

    const noReason = await westhamStaff.rpc("receive_transfer", {
      p_id: transferId,
      p_lines: receivedLines(),
    })
    expect(noReason.error?.message).toMatch(/reason for the difference/)

    const cupcakeBefore = await levelOf(ids.westham, ids.cupcake, cupcakeBatch)
    const { error } = await westhamStaff.rpc("receive_transfer", {
      p_id: transferId,
      p_lines: receivedLines("damaged"),
    })
    expect(error).toBeNull()

    expect(await statusOf(transferId)).toEqual({ status: "received", has_discrepancy: true })
    expect(await levelOf(ids.westham, ids.cupcake, cupcakeBatch)).toBe(cupcakeBefore + 5)
    expect(await levelOf(ids.westham, ids.chocolateCake, chocBatch)).toBeGreaterThanOrEqual(1)

    const { data: moves } = await westhamStaff
      .from("stock_movements")
      .select("type, qty, note")
      .eq("reference_id", transferId)
      .eq("location_id", ids.westham)
      .eq("item_id", ids.cupcake)
      .order("id")
    expect(moves).toEqual([
      { type: "transfer_in", qty: 6, note: null },
      { type: "transfer_loss", qty: -1, note: "Damaged: Squashed in the crate" },
    ])

    const lines = await linesOf(westhamStaff, transferId)
    expect(lines.find((l) => l.item_id === ids.cupcake)!.received_qty).toBe(5)
  })

  it("records the whole story in the timeline", async () => {
    const { data } = await westhamManager
      .from("transfer_events")
      .select("action")
      .eq("transfer_id", transferId)
      .order("id")
    expect(data!.map((e) => e.action)).toEqual([
      "created",
      "requested",
      "approved",
      "updated",
      "picking",
      "dispatched",
      "received",
    ])
  })
})

describe("dispatch checks", () => {
  it("needs a batch for batch-tracked items, and the batch must be at the sender", async () => {
    const { data: id } = await warehouseManager.rpc("save_transfer", {
      p_transfer: { origin: "push", from_location_id: ids.warehouse, to_location_id: ids.riverside },
      p_lines: [{ item_id: ids.chocolateCake, qty: 1 }],
    })
    await warehouseManager.rpc("submit_transfer", { p_id: id! })
    const [line] = await linesOf(warehouseManager, id!)

    const noBatch = await baker.rpc("dispatch_transfer", {
      p_id: id!,
      p_picks: [{ line_id: line.id, batch_id: null, qty: 1 }],
    })
    expect(noBatch.error?.message).toMatch(/needs a batch/)

    // A batch that only exists at Westham.
    const westhamBatch = await fefoBatch(admin, ids.westham, ids.chocolateCake)
    const wrongPlace = await baker.rpc("dispatch_transfer", {
      p_id: id!,
      p_picks: [{ line_id: line.id, batch_id: westhamBatch!.batch_id, qty: 1 }],
    })
    expect(wrongPlace.error?.message).toMatch(/not at this location/)

    const nothing = await baker.rpc("dispatch_transfer", {
      p_id: id!,
      p_picks: [{ line_id: line.id, batch_id: null, qty: 0 }],
    })
    expect(nothing.error?.message).toMatch(/Nothing was picked/)

    // Clean up.
    expect((await warehouseManager.rpc("cancel_transfer", { p_id: id!, p_reason: "test" })).data).toBe(
      "cancelled",
    )
  })

  it("items without batches are sent without one", async () => {
    const { data: id } = await warehouseManager.rpc("save_transfer", {
      p_transfer: { origin: "push", from_location_id: ids.warehouse, to_location_id: ids.riverside },
      p_lines: [{ item_id: ids.cakeBox, qty: 5 }],
    })
    await warehouseManager.rpc("submit_transfer", { p_id: id! })
    const [line] = await linesOf(warehouseManager, id!)
    const before = await levelOf(ids.warehouse, ids.cakeBox, null)

    const { error } = await baker.rpc("dispatch_transfer", {
      p_id: id!,
      p_picks: [{ line_id: line.id, batch_id: null, qty: 5 }],
    })
    expect(error).toBeNull()
    expect(await levelOf(ids.warehouse, ids.cakeBox, null)).toBe(before - 5)

    const { data: sent } = await riversideManager
      .from("transfer_line_batches")
      .select("id")
      .eq("line_id", line.id)
      .single()
    const received = await riversideManager.rpc("receive_transfer", {
      p_id: id!,
      p_lines: [{ id: sent!.id, received_qty: 5 }],
    })
    expect(received.error).toBeNull()
    expect(await statusOf(id!)).toEqual({ status: "received", has_discrepancy: false })
  })
})

describe("reject and cancel", () => {
  async function newRequest() {
    const { data } = await westhamManager.rpc("save_transfer", {
      p_transfer: { origin: "request", from_location_id: ids.warehouse, to_location_id: ids.westham },
      p_lines: [{ item_id: ids.croissant, qty: 2 }],
    })
    return data!
  }

  it("deletes drafts instead of keeping them", async () => {
    const id = await newRequest()
    const { data } = await westhamManager.rpc("cancel_transfer", { p_id: id })
    expect(data).toBe("deleted")
    const { data: rows } = await serviceClient().from("transfers").select("id").eq("id", id)
    expect(rows).toEqual([])
  })

  it("needs a reason to reject", async () => {
    const id = await newRequest()
    await westhamManager.rpc("submit_transfer", { p_id: id })

    const noReason = await warehouseManager.rpc("reject_transfer", { p_id: id, p_reason: " " })
    expect(noReason.error?.message).toMatch(/reason/)

    const { error } = await warehouseManager.rpc("reject_transfer", {
      p_id: id,
      p_reason: "No croissants today",
    })
    expect(error).toBeNull()
    expect((await statusOf(id)).status).toBe("rejected")
  })

  it("only the sender can cancel once approved", async () => {
    const id = await newRequest()
    await westhamManager.rpc("submit_transfer", { p_id: id })
    await warehouseManager.rpc("approve_transfer", { p_id: id })

    const byStore = await westhamManager.rpc("cancel_transfer", { p_id: id, p_reason: "x" })
    expect(byStore.error?.code).toBe("42501")

    const byWarehouse = await warehouseManager.rpc("cancel_transfer", { p_id: id, p_reason: "x" })
    expect(byWarehouse.data).toBe("cancelled")
  })

  it("can't edit once approved from the store side", async () => {
    const id = await newRequest()
    await westhamManager.rpc("submit_transfer", { p_id: id })
    await warehouseManager.rpc("approve_transfer", { p_id: id })
    const { error } = await westhamManager.rpc("save_transfer", {
      p_id: id,
      p_transfer: {},
      p_lines: [{ item_id: ids.croissant, qty: 50 }],
    })
    expect(error?.code).toBe("42501")
    await warehouseManager.rpc("cancel_transfer", { p_id: id })
  })
})

describe("standing orders", () => {
  let original: { item_id: string; weekday: number; qty: number }[] = []

  beforeAll(async () => {
    const { data } = await serviceClient()
      .from("standing_orders")
      .select("item_id, weekday, qty")
      .eq("from_location_id", ids.warehouse)
      .eq("to_location_id", ids.riverside)
    original = (data ?? []).map((r) => ({ ...r, qty: Number(r.qty) }))
  })

  it("store managers can set their own standing order", async () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
      { item_id: ids.croissant, weekday, qty: 10 + weekday },
      { item_id: ids.whiteLoaf, weekday, qty: 0 }, // zero rows are dropped
    ])
    const { data, error } = await riversideManager.rpc("save_standing_orders", {
      p_from: ids.warehouse,
      p_to: ids.riverside,
      p_rows: rows,
    })
    expect(error).toBeNull()
    expect(data).toBe(7)
  })

  it("other stores can't change it", async () => {
    const { error } = await westhamManager.rpc("save_standing_orders", {
      p_from: ids.warehouse,
      p_to: ids.riverside,
      p_rows: [],
    })
    expect(error?.code).toBe("42501")
  })

  it("generates one requested transfer per route and day, only once", async () => {
    // A random far-future date so repeated test runs don't collide.
    const date = addDays("2040-01-01", Math.floor(Math.random() * 3650))
    const isoWeekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

    // Store managers don't run the warehouse's generation.
    const byStore = await riversideManager.rpc("generate_standing_transfers", { p_date: date })
    expect(byStore.data).toBe(0)

    const first = await warehouseManager.rpc("generate_standing_transfers", { p_date: date })
    expect(first.error).toBeNull()
    expect(first.data).toBeGreaterThanOrEqual(1)

    const second = await warehouseManager.rpc("generate_standing_transfers", { p_date: date })
    expect(second.data).toBe(0)

    const { data: transfer } = await riversideManager
      .from("transfers")
      .select("id, status, origin, transfer_lines(item_id, qty, requested_qty)")
      .eq("from_location_id", ids.warehouse)
      .eq("to_location_id", ids.riverside)
      .eq("needed_on", date)
      .eq("origin", "standing_order")
      .single()
    expect(transfer!.status).toBe("requested")
    expect(transfer!.transfer_lines).toEqual([
      { item_id: ids.croissant, qty: 10 + isoWeekday, requested_qty: 10 + isoWeekday },
    ])
  })

  it("restores the seeded standing order", async () => {
    const { error } = await riversideManager.rpc("save_standing_orders", {
      p_from: ids.warehouse,
      p_to: ids.riverside,
      p_rows: original,
    })
    expect(error).toBeNull()
  })
})

describe("ledger after transfers", () => {
  it("still balances, and every received transfer nets to zero", async () => {
    expect(await ledgerMismatches()).toEqual([])

    const service = serviceClient()
    const { data: received } = await service.from("transfers").select("id").eq("status", "received")
    const { data: moves } = await service
      .from("stock_movements")
      .select("reference_id, type, qty")
      .in("reference_id", received!.map((t) => t.id))
      .in("type", ["transfer_out", "transfer_in"])
    const net = new Map<string, number>()
    for (const m of moves!) net.set(m.reference_id!, (net.get(m.reference_id!) ?? 0) + Number(m.qty))
    for (const [, total] of net) expect(total).toBeCloseTo(0, 3)
  })
})
