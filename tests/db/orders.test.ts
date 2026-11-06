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
let driver: Client
let westhamManager: Client
let westhamStaff: Client
let riversideManager: Client

const today = localToday()
const run = Date.now().toString(36).toUpperCase().slice(-6)
const phone7 = String(Date.now()).slice(-7)
const CUSTOM_CAKE = "40000000-0000-0000-0000-000000000013"

/** A fresh store per run, so delivery days and stock never collide. */
let store: string

beforeAll(async () => {
  ;[admin, baker, driver, westhamManager, westhamStaff, riversideManager] = await Promise.all([
    signedIn(users.admin),
    signedIn(users.baker),
    signedIn(users.driver),
    signedIn(users.westhamManager),
    signedIn(users.westhamStaff),
    signedIn(users.riversideManager),
  ])
  const { data, error } = await admin
    .from("locations")
    .insert({ code: `O${run}`.slice(0, 12), name: `Order test store ${run}`, type: "store" })
    .select("id")
    .single()
  if (error) throw error
  store = data.id
})

function order(extra: Record<string, unknown> = {}) {
  return {
    customer_name: "Test Customer",
    customer_phone: `+27 (0)82 ${phone7.slice(0, 3)} ${phone7.slice(3)}`,
    taken_at_location_id: ids.westham,
    pickup_location_id: store,
    pickup_date: addDays(today, 2),
    pickup_time: "11:30",
    deposit: 200,
    confirm: true,
    ...extra,
  }
}

const customCake = {
  item_id: CUSTOM_CAKE,
  qty: 1,
  unit_price: 550,
  details: { size: "24 cm", flavour: "Vanilla", inscription: `Test ${run}` },
}

async function statusOf(id: string) {
  const { data } = await serviceClient()
    .from("customer_orders")
    .select("status, transfer_id, paid_on_collection, fulfil_location_id")
    .eq("id", id)
    .single()
  return data!
}

describe("taking orders", () => {
  it("store staff take an order; the customer is found again by phone", async () => {
    const first = await westhamStaff.rpc("save_customer_order", { p_order: order(), p_lines: [customCake] })
    expect(first.error).toBeNull()
    const second = await westhamStaff.rpc("save_customer_order", {
      p_order: order({ customer_name: "Test Customer (again)", customer_phone: `082${phone7}` }),
      p_lines: [{ item_id: ids.cupcake, qty: 12 }],
    })
    expect(second.error).toBeNull()

    const { data: orders } = await serviceClient()
      .from("customer_orders")
      .select("customer_id, status, fulfil_location_id, customer_order_lines(unit_price, details)")
      .in("id", [first.data!, second.data!])
    expect(orders![0].customer_id).toBe(orders![1].customer_id)
    expect(orders!.every((o) => o.status === "confirmed")).toBe(true)
    // The test store doesn't bake, so the warehouse makes it.
    expect(orders!.every((o) => o.fulfil_location_id === ids.warehouse)).toBe(true)
    const cupcakes = orders!.find((o) => o.customer_order_lines[0].details === null)!
    expect(cupcakes.customer_order_lines[0].unit_price).toBe(25) // catalogue price
  })

  it("needs a price for made-to-order items and a pickup day that isn't past", async () => {
    const noPrice = await westhamStaff.rpc("save_customer_order", {
      p_order: order(),
      p_lines: [{ item_id: CUSTOM_CAKE, qty: 1 }],
    })
    expect(noPrice.error?.message).toMatch(/price/)

    const past = await westhamStaff.rpc("save_customer_order", {
      p_order: order({ pickup_date: addDays(today, -1) }),
      p_lines: [customCake],
    })
    expect(past.error?.message).toMatch(/past/)
  })

  it("only staff of a location can take orders there; drivers can't", async () => {
    for (const client of [driver, riversideManager]) {
      const { error } = await client.rpc("save_customer_order", { p_order: order(), p_lines: [customCake] })
      expect(error?.code).toBe("42501")
    }
  })

  it("is visible to the stores and bakery involved, not to others", async () => {
    const { data: id } = await westhamStaff.rpc("save_customer_order", { p_order: order(), p_lines: [customCake] })
    expect((await baker.from("customer_orders").select("id").eq("id", id!)).data).toHaveLength(1)
    expect((await riversideManager.from("customer_orders").select("id").eq("id", id!)).data).toEqual([])
    expect((await riversideManager.from("customer_order_lines").select("id").eq("order_id", id!)).data).toEqual([])
  })
})

describe("from bakery to customer", () => {
  let cakeOrder: string
  let cupcakeOrder: string
  let transferId: string

  beforeAll(async () => {
    const pickup = addDays(today, 3)
    cakeOrder = (await westhamStaff.rpc("save_customer_order", {
      p_order: order({ pickup_date: pickup }),
      p_lines: [customCake],
    })).data!
    cupcakeOrder = (await westhamStaff.rpc("save_customer_order", {
      p_order: order({ pickup_date: pickup }),
      p_lines: [{ item_id: ids.cupcake, qty: 6 }],
    })).data!
  })

  it("confirmed orders are on the bakery's production plan", async () => {
    const { data } = await baker.rpc("production_plan", {
      p_location_id: ids.warehouse,
      p_date: addDays(today, 3),
    })
    const custom = data!.find((r) => r.item_id === CUSTOM_CAKE)
    expect(Number(custom!.needed)).toBeGreaterThanOrEqual(1)
  })

  it("store staff can't mark it ready; the bakery can, which puts it on a delivery", async () => {
    const byStore = await westhamStaff.rpc("mark_order_ready", { p_id: cakeOrder })
    expect(byStore.error?.code).toBe("42501")

    const { data: code, error } = await baker.rpc("mark_order_ready", { p_id: cakeOrder })
    expect(error).toBeNull()
    expect(code).toMatch(/^T-\d+$/)

    const o = await statusOf(cakeOrder)
    expect(o.status).toBe("ready")
    transferId = o.transfer_id!
    const { data: t } = await serviceClient()
      .from("transfers")
      .select("status, from_location_id, to_location_id, needed_on, transfer_lines(item_id, qty)")
      .eq("id", transferId)
      .single()
    expect(t).toMatchObject({
      status: "approved",
      from_location_id: ids.warehouse,
      to_location_id: store,
      needed_on: addDays(today, 3),
    })
    expect(t!.transfer_lines).toEqual([{ item_id: CUSTOM_CAKE, qty: 1 }])
  })

  it("a second order for the same day joins the same delivery", async () => {
    await baker.rpc("mark_order_ready", { p_id: cupcakeOrder })
    expect((await statusOf(cupcakeOrder)).transfer_id).toBe(transferId)
    const { data: lines } = await serviceClient()
      .from("transfer_lines")
      .select("item_id, qty")
      .eq("transfer_id", transferId)
    expect(lines).toHaveLength(2)
  })

  it("cancelling a made order needs a manager and takes it off the delivery", async () => {
    const byStaff = await westhamStaff.rpc("cancel_customer_order", { p_id: cupcakeOrder })
    expect(byStaff.error?.code).toBe("42501")
    const { error } = await westhamManager.rpc("cancel_customer_order", {
      p_id: cupcakeOrder,
      p_reason: "Customer changed their mind",
    })
    expect(error).toBeNull()
    const { data: lines } = await serviceClient()
      .from("transfer_lines")
      .select("item_id")
      .eq("transfer_id", transferId)
    expect(lines).toEqual([{ item_id: CUSTOM_CAKE }])
  })

  it("a cake that hasn't been made can't be handed over", async () => {
    const { data: id } = await westhamStaff.rpc("save_customer_order", { p_order: order(), p_lines: [customCake] })
    const { error } = await admin.rpc("collect_customer_order", { p_id: id! })
    expect(error?.message).toMatch(/hasn't been made/)
  })

  it("collecting takes the cake out of the pickup store's stock", async () => {
    // Bake it, send it and receive it at the store.
    const { data: bake } = await baker.rpc("log_production", {
      p_location_id: ids.warehouse,
      p_item_id: CUSTOM_CAKE,
      p_qty: 1,
    })
    const { data: line } = await serviceClient()
      .from("transfer_lines")
      .select("id")
      .eq("transfer_id", transferId)
      .single()
    expect(
      (await baker.rpc("dispatch_transfer", {
        p_id: transferId,
        p_picks: [{ line_id: line!.id, batch_id: bake![0].batch_id, qty: 1 }],
      })).error,
    ).toBeNull()
    const { data: sent } = await admin.from("transfer_line_batches").select("id").eq("line_id", line!.id).single()
    expect(
      (await admin.rpc("receive_transfer", { p_id: transferId, p_lines: [{ id: sent!.id, received_qty: 1 }] })).error,
    ).toBeNull()
    expect(await levelOf(store, CUSTOM_CAKE, bake![0].batch_id)).toBe(1)

    const byOther = await riversideManager.rpc("collect_customer_order", { p_id: cakeOrder, p_paid: 350 })
    expect(byOther.error?.code).toBe("42501")

    const { error } = await admin.rpc("collect_customer_order", { p_id: cakeOrder, p_paid: 350 })
    expect(error).toBeNull()
    expect(await levelOf(store, CUSTOM_CAKE, bake![0].batch_id)).toBe(0)
    expect(await statusOf(cakeOrder)).toMatchObject({ status: "collected", paid_on_collection: 350 })

    const again = await admin.rpc("collect_customer_order", { p_id: cakeOrder })
    expect(again.error?.message).toMatch(/collected/)
  })

  it("collections count as sales in the daily summary", async () => {
    const { data } = await admin.rpc("daily_summary", { p_location_id: store, p_date: today })
    expect(Number(data!.find((r) => r.item_id === CUSTOM_CAKE)!.sold)).toBe(1)
  })
})

describe("orders from the store's own shelf", () => {
  it("need no delivery: ready then collected at the store", async () => {
    const { data: id } = await westhamManager.rpc("save_customer_order", {
      p_order: order({ pickup_location_id: ids.westham, fulfil_location_id: ids.westham, pickup_date: today }),
      p_lines: [{ item_id: ids.whiteLoaf, qty: 1 }],
    })
    const { data: code, error } = await westhamStaff.rpc("mark_order_ready", { p_id: id! })
    expect(error).toBeNull()
    expect(code).toBeNull()
    expect((await statusOf(id!)).transfer_id).toBeNull()
    expect((await westhamStaff.rpc("collect_customer_order", { p_id: id!, p_paid: 22 })).error).toBeNull()
  })

  it("only a bakery or the pickup store can make an order", async () => {
    const { error } = await westhamManager.rpc("save_customer_order", {
      p_order: order({ pickup_location_id: ids.westham, fulfil_location_id: ids.riverside }),
      p_lines: [customCake],
    })
    expect(error?.message).toMatch(/bakery/)
  })
})

describe("order photos", () => {
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
    (c) => c.charCodeAt(0),
  )

  it("the bakery can see a reference photo once it's on an order", async () => {
    const name = `orders/test-${run}-${Date.now()}.png`
    const upload = await westhamStaff.storage.from("photos").upload(name, png, { contentType: "image/png" })
    expect(upload.error).toBeNull()
    expect((await baker.storage.from("photos").createSignedUrl(name, 60)).error).not.toBeNull()

    const { error } = await westhamStaff.rpc("save_customer_order", {
      p_order: order(),
      p_lines: [{ ...customCake, photo_path: name }],
    })
    expect(error).toBeNull()
    expect((await baker.storage.from("photos").createSignedUrl(name, 60)).error).toBeNull()
    expect((await riversideManager.storage.from("photos").createSignedUrl(name, 60)).error).not.toBeNull()
  })

  it("drivers can't upload order photos", async () => {
    const { error } = await driver.storage
      .from("photos")
      .upload(`orders/driver-${run}.png`, png, { contentType: "image/png" })
    expect(error).not.toBeNull()
  })
})

describe("ledger after customer orders", () => {
  it("still balances", async () => {
    expect(await ledgerMismatches()).toEqual([])
  })
})
