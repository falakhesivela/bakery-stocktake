// Recipes and ingredients: edit a recipe and use its cost → receive a
// supplier delivery (updating cost prices) → bake, which uses up the
// ingredients → reorder levels drive the "running low" list → add a
// supplier → cancel the delivery. Needs fresh demo data.
import { BASE, seeInTable, seeText, walkthrough } from "./helpers.mjs"

const WHITE_LOAF = "40000000-0000-0000-0000-000000000006"
const COCOA = "40000000-0000-0000-0000-000000000011"

export default function recipesWalkthrough() {
  return walkthrough("Recipes and ingredients", async ({ as, log, problems }) => {
    const admin = await as("admin@bakery.test")
    await admin.goto(`${BASE}/recipes`)
    await seeText(admin, "Chocolate cake (large)")
    const cakeRow = (await admin.locator("tr").filter({ hasText: "Chocolate cake (large)" }).innerText()).replace(/\s+/g, " ")
    if (!/72\.70/.test(cakeRow)) problems.push(`chocolate cake cost should be 72.70: ${cakeRow}`)
    log("Recipes list shows the cost to make each product (chocolate cake 72.70)")

    await admin.goto(`${BASE}/recipes/${WHITE_LOAF}`)
    // Ingredient 1 of the white loaf is cake flour.
    await admin.getByRole("spinbutton", { name: "Amount 1", exact: true }).fill("5.5")
    await seeText(admin, "Each one")
    await admin.getByRole("button", { name: "Save recipe" }).click()
    await seeText(admin, "Recipe saved")
    await admin.getByRole("button", { name: /as the cost price/ }).click()
    await seeText(admin, "Cost price set to")
    log("Admin changed the white loaf recipe and used its cost as the cost price")

    const warehouse = await as("warehouse@bakery.test")
    await warehouse.goto(`${BASE}/deliveries/new`)
    await warehouse.getByLabel("Supplier").selectOption({ label: "Mills & Co" })
    await warehouse.getByLabel("Delivery note / invoice no.").fill("INV-E2E")
    await warehouse.getByRole("combobox", { name: "Item 1" }).selectOption({ label: "Cocoa powder (kg)" })
    await warehouse.getByRole("spinbutton", { name: "Quantity 1" }).fill("5")
    await warehouse.getByLabel(/Cost per kg/).first().fill("158")
    await warehouse.getByRole("switch", { name: "Update cost prices" }).click()
    await warehouse.getByRole("button", { name: "Receive delivery" }).click()
    await warehouse.waitForURL(/\/deliveries\/R-\d+$/)
    const delivery = (await warehouse.locator("h1:visible").first().textContent()).trim()
    await seeText(warehouse, "790.00")
    log(`Warehouse received ${delivery}: 5 kg cocoa at 158 (cost price updated)`)

    const baker = await as("baker@bakery.test")
    await baker.goto(`${BASE}/production`)
    await baker.getByRole("combobox", { name: "Product" }).selectOption({ label: "Chocolate cake (large) (CAKE-CHOC-L)" })
    await baker.getByRole("spinbutton", { name: /How many/ }).fill("2")
    await seeText(baker, "Take the ingredients out of stock")
    await seeText(baker, "Cocoa powder")
    const preview = await baker.locator("li").filter({ hasText: "Cocoa powder" }).first().innerText()
    if (!/0\.16 kg/.test(preview) || !/of 7 kg/.test(preview)) problems.push(`cocoa preview looks wrong: ${preview}`)
    await baker.getByRole("button", { name: "Log bake" }).click()
    await seeText(baker, "6 ingredients taken out of stock")
    await seeText(baker, "Ingredients for this bake list")
    log("Baker logged 2 chocolate cakes; the 6 recipe ingredients came out of stock")

    await warehouse.goto(`${BASE}/stock/history?item=${COCOA}`)
    await seeInTable(warehouse, "Used in baking")
    await seeInTable(warehouse, delivery)
    log("Cocoa's history shows the delivery and the bake")

    await warehouse.goto(`${BASE}/stock/levels`)
    const cocoaReorder = warehouse.getByRole("spinbutton", { name: "Cocoa powder reorder level" })
    await cocoaReorder.fill("8")
    await warehouse.getByRole("spinbutton", { name: "Cocoa powder par level" }).fill("10")
    await warehouse.getByRole("button", { name: "Save levels" }).click()
    await seeText(warehouse, "Saved 1 level")
    await warehouse.goto(`${BASE}/deliveries`)
    const lowRow = (await warehouse.locator("tr").filter({ hasText: "Cocoa powder" }).first().innerText()).replace(/\s+/g, " ")
    // 2 + 5 − 0.16 = 6.84 on hand; order up to 10 → 3.16
    if (!/6\.84/.test(lowRow) || !/3\.16/.test(lowRow)) problems.push(`running-low row looks wrong: ${lowRow}`)
    log("Raised cocoa's reorder level; Deliveries says to order 3.16 kg")

    await warehouse.goto(`${BASE}/suppliers`)
    await warehouse.getByRole("button", { name: "Add supplier" }).click()
    await warehouse.getByRole("dialog").getByLabel("Name").fill("Sweet Things Ltd")
    await warehouse.getByRole("dialog").getByLabel("Phone").fill("021 555 0404")
    await warehouse.getByRole("dialog").getByRole("button", { name: "Save" }).click()
    await seeInTable(warehouse, "Sweet Things Ltd")
    log("Warehouse manager added a supplier")

    await warehouse.goto(`${BASE}/deliveries/${delivery}`)
    await warehouse.getByRole("button", { name: "Cancel delivery" }).click()
    await warehouse.getByRole("dialog").getByLabel("Reason").fill("Entered on the wrong day")
    await warehouse.getByRole("dialog").getByRole("button", { name: "Cancel delivery" }).click()
    await seeText(warehouse, "taken back out")
    log(`Manager cancelled ${delivery}; its stock was taken back out`)

    const staff = await as("baker@bakery.test")
    await staff.goto(`${BASE}/recipes/${WHITE_LOAF}`)
    await seeText(staff, "Only admins and bakery managers can change recipes")
    if (await staff.getByRole("button", { name: "Save recipe" }).count()) {
      problems.push("baker can see the Save recipe button")
    }
    log("Bakers can read recipes but not change them")
  })
}
