// A day at Westham: waste with a photo → blind count by staff (typed and
// scanned) → sales entered after the count → reopen and repost → manager
// approves → End of day adds up. Needs fresh demo data.
import { BASE, scan, seeText, TINY_PNG, walkthrough } from "./helpers.mjs"

export default function storeDayWalkthrough() {
  return walkthrough("Store day (sales, waste, count)", async ({ as, log, problems }) => {
    const staff = await as("staff@bakery.test", { width: 390, height: 844 })
    // On a phone the menu is a slide-out panel.
    await staff.getByRole("button", { name: "Toggle Sidebar" }).click()
    await staff.getByRole("dialog").getByRole("link", { name: "Waste" }).click()
    await staff.waitForURL(/\/waste$/)
    await staff.locator("li").filter({ hasText: "Vanilla cupcake" }).getByRole("button", { name: "Waste" }).click()
    await staff.locator('input[type="file"]').first().setInputFiles({
      name: "cupcakes.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    })
    await staff.locator("form").getByRole("img", { name: "Photo" }).waitFor()
    await staff.getByRole("button", { name: "Log waste" }).click()
    await seeText(staff, "Logged 1 waste line")
    await staff.locator("table tbody tr").first().locator('img[src*="token="]').waitFor()
    log("Staff wasted the leftover cupcakes, with a photo from private storage")

    await staff.goto(`${BASE}/stock-takes/new`)
    await staff.getByRole("switch", { name: "Blind count" }).click()
    await staff.getByRole("button", { name: "Start counting" }).click()
    await staff.waitForURL(/\/stock-takes\/C-\d+$/)
    const code = (await staff.locator("h1:visible").first().textContent()).trim()
    if (await staff.getByText(/expected \d/).count()) problems.push("blind count shows expected quantities")
    log(`Staff started blind count ${code}`)

    const cakeRow = staff.locator("div.grid").filter({ hasText: "Chocolate cake (large)" })
    await cakeRow.getByRole("spinbutton").fill("1")
    await cakeRow.getByRole("spinbutton").press("Enter")
    await cakeRow.getByLabel(/Counted/).waitFor()

    const loafRow = staff.locator("div.grid").filter({ hasText: "White loaf" })
    const loafBatch = (await loafRow.locator("span.font-mono").first().textContent()).trim()
    for (let i = 1; i <= 2; i++) {
      await scan(staff, "Scan to count", loafBatch)
      await seeText(staff, `White loaf (${loafBatch}): ${i}`)
    }
    await staff.waitForFunction(
      (batch) =>
        [...document.querySelectorAll("div.grid")].some(
          (el) => el.textContent.includes(batch) && el.querySelector("input")?.value === "2",
        ),
      loafBatch,
    )
    // Seed: 2 loaves on the shelf before today; 1 sold below, so 1 expected.
    // Only an empty crate is found: 0.
    await loafRow.getByRole("spinbutton").fill("0")
    await loafRow.getByRole("spinbutton").blur()
    await staff.waitForTimeout(800)
    await staff.getByRole("button", { name: "Finish counting" }).click()
    await seeText(staff, "Waiting for approval")
    log("Counted 1 cake (typed) and the loaves (scanned twice, corrected to 0); handed in")

    const manager = await as("westham@bakery.test")
    await manager.goto(`${BASE}/sales`)
    const saleRow = (name) => manager.locator('[id^="sale-"]').filter({ hasText: name }).getByRole("spinbutton")
    await saleRow("Chocolate cake (large)").fill("1")
    await saleRow("White loaf").fill("2")
    await manager.getByRole("button", { name: "Post sales" }).click()
    await manager.getByRole("dialog").getByRole("button", { name: "Post sales" }).click()
    await seeText(manager, "Reopen to correct")
    await manager.getByRole("button", { name: "Reopen to correct" }).click()
    await manager.getByRole("dialog").getByLabel("Reason (optional)").fill("White loaf was 1, not 2")
    await manager.getByRole("dialog").getByRole("button", { name: "Reopen" }).click()
    await manager.getByRole("button", { name: "Post sales" }).waitFor()
    await saleRow("White loaf").fill("1")
    await manager.getByRole("button", { name: "Post sales" }).click()
    await manager.getByRole("dialog").getByRole("button", { name: "Post sales" }).click()
    await seeText(manager, "Reopen to correct")
    log("Manager posted sales after the count, reopened them, fixed a line and posted again")

    await manager.goto(`${BASE}/stock-takes/${code}`)
    await seeText(manager, "Differences")
    const loafText = (await manager.locator("tr").filter({ hasText: "White loaf" }).innerText()).replace(/\s+/g, " ")
    if (!/\b1\b.*\b0\b.*-1/.test(loafText)) problems.push(`loaf review row looks wrong: ${loafText}`)
    await manager.getByRole("button", { name: "Approve", exact: true }).click()
    await manager.getByRole("dialog").getByText("1 line will be corrected").waitFor()
    await manager.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click()
    await seeText(manager, "1 line corrected")
    log("Approved: sales typed in after counting weren't taken off twice (1 loaf short)")

    await manager.goto(`${BASE}/end-of-day`)
    await seeText(manager, `${code} approved`)
    await seeText(manager, "Posted: 2 items sold")
    const eodLoaf = (await manager.locator("tr").filter({ hasText: "White loaf" }).innerText()).replace(/\s+/g, " ")
    if (!/-1/.test(eodLoaf)) problems.push(`end of day loaf row missing the -1: ${eodLoaf}`)
    await manager.goto(`${BASE}/stock/history?q=${loafBatch}`)
    await manager.locator("table").getByText(code).first().waitFor()
    await manager.locator("table").getByText("Sales reopened").first().waitFor()
    log("End of day and stock history show it all")
  })
}
