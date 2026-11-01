// Shared helpers for the browser walkthroughs in tests/e2e.
//
// They drive a real (headless) Chromium against a running app:
//   BASE=http://localhost:3000 pnpm test:e2e
// Start from fresh demo data (`pnpm db:reset`): some steps expect the seed.
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"

export const BASE = process.env.BASE ?? "http://localhost:3000"

/** Newest cached Playwright headless shell, unless E2E_CHROMIUM points elsewhere. */
function chromiumPath() {
  if (process.env.E2E_CHROMIUM) return process.env.E2E_CHROMIUM
  const cache = join(homedir(), ".cache", "ms-playwright")
  if (!existsSync(cache)) return undefined
  const shells = readdirSync(cache)
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
  for (const dir of shells) {
    const path = join(cache, dir, "chrome-headless-shell-linux64", "chrome-headless-shell")
    if (existsSync(path)) return path
  }
  return undefined
}

/** One browser session per walkthrough, collecting problems instead of throwing. */
export async function walkthrough(name, steps) {
  const browser = await chromium.launch({ executablePath: chromiumPath() })
  const problems = []
  const pages = []
  let step = 0
  const log = (msg) => console.log(`  ${String(++step).padStart(2)}. ${msg}`)

  async function as(email, viewport = { width: 1280, height: 900 }) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    pages.push([email, page])
    page.setDefaultTimeout(30_000)
    page.on("pageerror", (err) => problems.push(`[${email}] page error: ${err.message}`))
    page.on("console", (msg) => {
      // React's dev-only performance tracks can log a harmless timing error.
      if (msg.type() === "error" && !/DevTools|favicon|performance|measure/.test(msg.text())) {
        const text = msg.text()
        // Hydration warnings carry a diff that's only useful in full.
        const where = new URL(page.url()).pathname
        problems.push(`[${email} on ${where}] console: ${text.slice(0, /hydrat/i.test(text) ? 4000 : 300)}`)
      }
    })
    await page.goto(`${BASE}/login`)
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill("password123")
    await page.getByRole("button", { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/)
    return page
  }

  console.log(`\n${name}`)
  try {
    await steps({ as, log, problems })
  } catch (err) {
    problems.push(`stopped at step ${step + 1}: ${err.message.split("\n").slice(0, 4).join(" | ")}`)
    for (const [email, page] of pages) {
      const file = `e2e-failure-${email.split("@")[0]}.png`
      await page.screenshot({ path: file, fullPage: true }).catch(() => {})
    }
  } finally {
    await browser.close()
  }

  if (problems.length) {
    console.log("  Problems:")
    for (const p of problems) console.log(`   - ${p}`)
  } else {
    console.log("  Passed with no browser errors.")
  }
  return problems.length === 0
}

/** Waits for visible text. Next keeps recent pages hidden in the DOM, so skip those. */
export const seeText = (page, text) =>
  page.getByText(text, { exact: false }).locator("visible=true").first().waitFor()

export const seeInTable = (page, text) =>
  page.locator("table").getByText(text, { exact: false }).first().waitFor()

/** A tiny valid PNG, standing in for a phone photo. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
)

/** Types a code into the scanner dialog's manual entry box. */
export async function scan(page, buttonName, code) {
  await page.getByRole("button", { name: buttonName }).click()
  await page.getByPlaceholder("Type barcode, SKU or batch code").fill(code)
  await page.getByRole("button", { name: "Use code" }).click()
}
