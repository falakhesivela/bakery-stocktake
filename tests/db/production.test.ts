import { beforeAll, describe, expect, it } from "vitest"
import {
  addDays,
  ids,
  ledgerMismatches,
  levelOf,
  localToday,
  signedIn,
  users,
  type Client,
} from "./helpers"

let baker: Client
let driver: Client
let warehouseManager: Client
let westhamManager: Client
let riversideManager: Client

beforeAll(async () => {
  ;[baker, driver, warehouseManager, westhamManager, riversideManager] = await Promise.all([
    signedIn(users.baker),
    signedIn(users.driver),
    signedIn(users.warehouse),
    signedIn(users.westhamManager),
    signedIn(users.riversideManager),
  ])
})

describe("log_production", () => {
  it("creates a batch with best-before from shelf life and adds the stock", async () => {
    const { data, error } = await baker.rpc("log_production", {
      p_location_id: ids.warehouse,
      p_item_id: ids.chocolateCake,
      p_qty: 10,
    })
    expect(error).toBeNull()
    const run = data![0]
    expect(run.batch_code).toMatch(/^B\d{6}-\d{5,}$/)

    const { data: batch } = await baker
      .from("batches")
      .select("source, produced_on, best_before")
      .eq("id", run.batch_id!)
      .single()
    expect(batch!.source).toBe("production")
    expect(batch!.produced_on).toBe(localToday())
    expect(batch!.best_before).toBe(addDays(localToday(), 4)) // 4-day shelf life

    expect(await levelOf(ids.warehouse, ids.chocolateCake, run.batch_id)).toBe(10)

    const { data: movement } = await baker
      .from("stock_movements")
      .select("type, qty, reference_type, reference_id")
      .eq("batch_id", run.batch_id!)
      .single()
    expect(movement).toMatchObject({
      type: "production_in",
      qty: 10,
      reference_type: "production_run",
      reference_id: run.run_id,
    })
  })

  it("only works at locations that bake", async () => {
    const { error } = await westhamManager.rpc("log_production", {
      p_location_id: ids.westham,
      p_item_id: ids.chocolateCake,
      p_qty: 1,
    })
    expect(error?.message).toMatch(/not set up for baking/)
  })

  it("rejects drivers and staff from other locations", async () => {
    for (const client of [driver, riversideManager]) {
      const { error } = await client.rpc("log_production", {
        p_location_id: ids.warehouse,
        p_item_id: ids.chocolateCake,
        p_qty: 1,
      })
      expect(error?.code).toBe("42501")
    }
  })

  it("rejects bake dates in the future", async () => {
    const { error } = await baker.rpc("log_production", {
      p_location_id: ids.warehouse,
      p_item_id: ids.chocolateCake,
      p_qty: 1,
      p_produced_on: addDays(localToday(), 2),
    })
    expect(error?.message).toMatch(/future/)
  })
})

describe("void_production_run", () => {
  it("undoes an untouched bake once", async () => {
    const { data } = await baker.rpc("log_production", {
      p_location_id: ids.warehouse,
      p_item_id: ids.redVelvet,
      p_qty: 5,
    })
    const run = data![0]

    const { error } = await baker.rpc("void_production_run", {
      p_run_id: run.run_id,
      p_reason: "Typed 5 instead of 3",
    })
    expect(error).toBeNull()
    expect(await levelOf(ids.warehouse, ids.redVelvet, run.batch_id)).toBe(0)

    const again = await baker.rpc("void_production_run", {
      p_run_id: run.run_id,
      p_reason: "again",
    })
    expect(again.error?.message).toMatch(/already been undone/)
  })

  it("is blocked once some of the batch has been sent", async () => {
    const { data } = await baker.rpc("log_production", {
      p_location_id: ids.warehouse,
      p_item_id: ids.whiteLoaf,
      p_qty: 6,
    })
    const run = data![0]

    const { data: transferId } = await warehouseManager.rpc("save_transfer", {
      p_transfer: {
        origin: "push",
        from_location_id: ids.warehouse,
        to_location_id: ids.westham,
      },
      p_lines: [{ item_id: ids.whiteLoaf, qty: 2 }],
    })
    await warehouseManager.rpc("submit_transfer", { p_id: transferId! })
    const { data: line } = await warehouseManager
      .from("transfer_lines")
      .select("id")
      .eq("transfer_id", transferId!)
      .single()
    const dispatch = await baker.rpc("dispatch_transfer", {
      p_id: transferId!,
      p_picks: [{ line_id: line!.id, batch_id: run.batch_id, qty: 2 }],
    })
    expect(dispatch.error).toBeNull()

    const { error } = await warehouseManager.rpc("void_production_run", {
      p_run_id: run.run_id,
      p_reason: "Wrong",
    })
    expect(error?.message).toMatch(/already been sent, sold or counted/)
  })

  it("only lets managers or the person who logged it undo a bake", async () => {
    const { data } = await warehouseManager.rpc("log_production", {
      p_location_id: ids.warehouse,
      p_item_id: ids.redVelvet,
      p_qty: 1,
    })
    const { error } = await baker.rpc("void_production_run", {
      p_run_id: data![0].run_id,
      p_reason: "Not mine",
    })
    expect(error?.code).toBe("42501")
  })
})

describe("production_plan", () => {
  it("lists products needed for open outgoing transfers", async () => {
    const tomorrow = addDays(localToday(), 1)
    const { data: id } = await riversideManager.rpc("save_transfer", {
      p_transfer: {
        origin: "request",
        from_location_id: ids.warehouse,
        to_location_id: ids.riverside,
        needed_on: tomorrow,
      },
      p_lines: [{ item_id: ids.carrotCake, qty: 5 }],
    })
    await riversideManager.rpc("submit_transfer", { p_id: id! })

    const { data, error } = await baker.rpc("production_plan", {
      p_location_id: ids.warehouse,
      p_date: tomorrow,
    })
    expect(error).toBeNull()
    const carrot = data!.find((r) => r.item_id === ids.carrotCake)
    expect(Number(carrot!.needed)).toBeGreaterThanOrEqual(5)
    expect(Number(carrot!.to_make)).toBe(
      Math.max(Number(carrot!.needed) - Number(carrot!.usable_stock), 0),
    )
  })

  it("shows nothing to staff of other locations", async () => {
    const { data } = await westhamManager.rpc("production_plan", {
      p_location_id: ids.warehouse,
      p_date: addDays(localToday(), 1),
    })
    // Westham can see its own requests, but not the warehouse's stock or other stores' orders.
    for (const row of data ?? []) {
      expect(Number(row.usable_stock)).toBe(0)
    }
    expect(data?.find((r) => r.item_id === ids.carrotCake)).toBeUndefined()
  })
})

describe("ledger after production", () => {
  it("still balances", async () => {
    expect(await ledgerMismatches()).toEqual([])
  })
})
