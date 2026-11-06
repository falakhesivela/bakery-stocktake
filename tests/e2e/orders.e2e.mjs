// Customer orders: take a custom cake order (returning customer, photo) →
// the bakery sees it, bakes it and marks it ready (it goes on a delivery) →
// dispatch and receive → the store hands it over and takes payment →
// a manager cancels another order. Needs fresh demo data.
import { BASE, seeInTable, seeText, TINY_PNG, walkthrough } from "./helpers.mjs"

export default function ordersWalkthrough() {
  return walkthrough("Customer orders", async ({ as, log, problems }) => {
    const staff = await as("staff@bakery.test", { width: 390, height: 844 })
    await staff.goto(`${BASE}/orders/new`)
    await staff.waitForLoadState("networkidle")
    // The page must be hydrated, not rebuilt in the browser (ids made by the
    // server start with _R_). Rebuilding on phones loses early typing.
    const phoneId = await staff.getByLabel("Phone").getAttribute("id")
    if (!phoneId?.includes("_R_")) problems.push(`order form was re-rendered in the browser on a phone (id ${phoneId})`)
    await staff.getByLabel("Phone").fill("082 555 1234")
    await staff.getByLabel("Phone").blur()
    await seeText(staff, "Returning customer: Priya Naidoo")
    if ((await staff.getByLabel("Name", { exact: true }).inputValue()) !== "Priya Naidoo") {
      problems.push("returning customer's name wasn't filled in")
    }
    await staff.getByLabel("Time").fill("14:00")
    await staff.getByLabel("Size / shape").fill("20 cm square")
    await staff.getByLabel("Flavour").fill("Lemon")
    await staff.getByLabel("Writing on the cake").fill("Congrats Sam!")
    await staff.locator('input[type="file"]').first().setInputFiles({ name: "idea.png", mimeType: "image/png", buffer: TINY_PNG })
    await staff.locator("form").getByRole("img", { name: "Reference photo" }).waitFor()
    await staff.getByLabel("Price each").fill("450")
    await staff.getByLabel("Deposit paid").fill("200")
    await seeText(staff, "250.00")
    await staff.getByRole("button", { name: "Save and confirm" }).click()
    await staff.waitForURL(/\/orders\/O-\d+$/)
    const code = (await staff.locator("h1:visible").first().textContent()).trim()
    await seeText(staff, "To be made at Central Warehouse & Bakery")
    log(`Staff took ${code} for a returning customer: custom cake with photo, 200 deposit`)

    const baker = await as("baker@bakery.test")
    await baker.goto(`${BASE}/production`)
    const card = baker.locator("li").filter({ hasText: code })
    await card.getByText("Congrats Sam!").waitFor()
    await card.locator('img[src*="token="]').waitFor()
    await baker.getByRole("combobox", { name: "Product" }).selectOption({ label: "Custom cake (CAKE-CUSTOM)" })
    await baker.getByRole("spinbutton", { name: /How many/ }).fill("1")
    await baker.getByRole("button", { name: "Log bake" }).click()
    await seeText(baker, "Logged 1 Custom cake")
    await card.getByRole("button", { name: "Mark ready" }).click()
    await seeText(baker, `${code} is ready and on delivery`)
    log("The bakery saw the wording and photo, baked the cake and marked it ready")

    await staff.goto(`${BASE}/orders/${code}`)
    const transfer = (await staff.getByRole("link", { name: /^T-\d+$/ }).first().textContent()).trim()
    await seeText(staff, `going to Westham Store on ${transfer}`)
    log(`The order is on delivery ${transfer} to Westham`)

    await baker.goto(`${BASE}/transfers/${transfer}`)
    await seeText(baker, "Customer orders on this delivery")
    await baker.getByRole("button", { name: "Start picking" }).click()
    await baker.waitForURL(/\/pick$/)
    await seeText(baker, "1 of 1")
    await baker.getByRole("button", { name: "Dispatch", exact: true }).click()
    await baker.getByRole("button", { name: "Dispatch now" }).click()
    await baker.waitForURL(new RegExp(`/transfers/${transfer}$`))
    await baker.getByRole("link", { name: "Delivery note" }).click()
    await seeText(baker, "keep these boxes for collection")
    log("The baker dispatched it; the delivery note lists the customer order")

    await staff.goto(`${BASE}/transfers/${transfer}/receive`)
    await staff.getByRole("button", { name: "Everything arrived" }).click()
    await staff.waitForURL(new RegExp(`/transfers/${transfer}$`))
    await staff.goto(`${BASE}/orders/${code}`)
    await seeText(staff, "At Westham Store, ready to collect")
    log("Westham received it; the order shows it's at the store")

    await staff.getByRole("button", { name: "Customer collected" }).click()
    const paid = staff.getByRole("dialog").getByLabel("Paid now")
    if ((await paid.inputValue()) !== "250") problems.push(`balance prefilled as ${await paid.inputValue()}, expected 250`)
    await staff.getByRole("dialog").getByRole("button", { name: "Collected" }).click()
    await seeText(staff, `${code} collected`)
    await seeText(staff, "Paid on collection")
    await staff.goto(`${BASE}/stock/history?q=CAKE-CUSTOM`)
    await seeInTable(staff, code)
    log("Staff handed it over and took the 250 balance; it left Westham's stock")

    const manager = await as("westham@bakery.test")
    await manager.goto(`${BASE}/orders/O-00003`)
    await manager.getByRole("button", { name: "Cancel order" }).click()
    await manager.getByRole("dialog").getByLabel("Reason (optional)").fill("Customer called to cancel")
    await manager.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click()
    await seeText(manager, "Customer called to cancel")
    log("The manager cancelled a set-aside order")
  })
}
