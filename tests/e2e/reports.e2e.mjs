// Reports, suggestions, notifications and the audit log:
// a store manager opens reports and downloads a CSV → fills the standing
// order from recent sales and saves it → requests stock, and the warehouse
// manager opens it from the notification bell → the admin sees the standing
// order change in the audit log. Runs after the other walkthroughs.
import { readFile } from "node:fs/promises"
import { BASE, seeText, walkthrough } from "./helpers.mjs"

async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent("download"), button.click()])
  const text = await readFile(await file.path(), "utf8")
  // Downloads start with a byte-order mark so Excel reads them as UTF-8.
  if (!text.startsWith("\uFEFF")) throw new Error(`${file.suggestedFilename()} has no byte-order mark`)
  return { name: file.suggestedFilename(), text: text.slice(1) }
}

export default function reportsWalkthrough() {
  return walkthrough("Reports, suggestions, notifications and audit log", async ({ as, log, problems }) => {
    const manager = await as("westham@bakery.test")
    await manager.goto(`${BASE}/reports`)
    await seeText(manager, "Shelf sales")
    await seeText(manager, "Most wasted")
    await manager.getByRole("combobox", { name: "Report" }).selectOption("waste")
    await seeText(manager, "Waste by reason")
    const csv = await download(manager, manager.getByRole("button", { name: "CSV" }).first())
    if (!csv.name.startsWith("waste-by-reason-ST-01-") || !csv.text.startsWith("Reason,Entries,Cost")) {
      problems.push(`unexpected waste CSV: ${csv.name} ${csv.text.slice(0, 60)}`)
    }
    if (!csv.text.includes("Unsold at end of day")) problems.push("waste CSV is missing the unsold row")
    await manager.getByRole("button", { name: "Last 7 days" }).click()
    await manager.waitForURL(/from=/)
    await seeText(manager, "Waste by item")
    log(`Westham's manager opened reports and downloaded ${csv.name}`)

    await manager.goto(`${BASE}/transfers/standing`)
    await manager.getByRole("button", { name: /Suggest from last 4 weeks/ }).click()
    await seeText(manager, "from average sales")
    const monday = manager.getByRole("spinbutton", { name: "Vanilla cupcake on Monday" })
    const suggested = Number(await monday.inputValue())
    if (!(suggested > 0)) problems.push(`no suggestion for cupcakes on Monday (got "${suggested}")`)
    await seeText(manager, "avg ")
    await manager.getByRole("button", { name: "Save standing order" }).click()
    await seeText(manager, "Saved")
    log(`Filled the standing order from recent sales (${suggested} cupcakes on Mondays) and saved it`)

    // A new request shows up in the warehouse manager's bell.
    await manager.goto(`${BASE}/transfers/new?type=request`)
    await manager.getByRole("combobox", { name: "Item 1", exact: true }).selectOption({ label: "Butter croissant (CROIS-BUT)" })
    await manager.getByRole("spinbutton", { name: "Quantity 1", exact: true }).fill("12")
    await manager.getByRole("button", { name: "Send request" }).click()
    await manager.waitForURL(/\/transfers\/[0-9a-f-]{36}$/)
    const request = (await manager.locator("h1:visible").first().textContent()).trim()

    const warehouse = await as("warehouse@bakery.test")
    const bell = (name) => warehouse.getByRole("button", { name })
    await bell(/Notifications, \d+ unread/).waitFor()
    const before = Number((await bell(/Notifications, \d+ unread/).getAttribute("aria-label")).match(/\d+/)[0])
    await bell(/Notifications, \d+ unread/).click()
    await warehouse.getByRole("menuitem", { name: new RegExp(`New request ${request} from Westham Store`) }).click()
    await warehouse.waitForURL(new RegExp(`/transfers/${request}$`))
    await bell(`Notifications, ${before - 1} unread`).waitFor()
    log(`Westham requested croissants (${request}); the warehouse manager opened it from the bell and it was marked read`)

    await bell(/Notifications/).click()
    await warehouse.getByRole("menuitem", { name: "Mark all as read" }).click()
    await bell("Notifications").waitFor()
    await warehouse.goto(`${BASE}/notifications`)
    await seeText(warehouse, "All read")
    log("Marked everything read; the notifications page agrees")

    const admin = await as("admin@bakery.test")
    await admin.goto(`${BASE}/settings/audit?area=standing`)
    const row = admin.locator("tr").filter({ hasText: "Sam Westham" }).filter({ hasText: "Vanilla cupcake" }).first()
    await row.waitFor()
    if (!(await row.textContent()).includes("WH-01 → ST-01")) problems.push("audit row doesn't name the route")
    log("The admin sees Sam's standing order changes in the audit log")

    await admin.goto(`${BASE}/stock`)
    const stock = await download(admin, admin.getByRole("button", { name: "Download CSV" }))
    if (stock.name !== "stock-by-batch-all.csv" || !stock.text.startsWith("Location,SKU,Item")) {
      problems.push(`unexpected stock CSV: ${stock.name} ${stock.text.slice(0, 60)}`)
    }
    log(`Downloaded stock on hand as ${stock.name}`)
  })
}

if (process.argv[1]?.endsWith("reports.e2e.mjs")) {
  process.exitCode = (await reportsWalkthrough()) ? 0 : 1
}
