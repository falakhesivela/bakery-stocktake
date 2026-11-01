// Runs every browser walkthrough against a running app.
//   pnpm db:reset          (the walkthroughs expect fresh demo data)
//   pnpm dev               (or pnpm build && pnpm start)
//   pnpm test:e2e          (BASE=http://localhost:3000 by default)
import pages from "./pages.e2e.mjs"
import recipes from "./recipes.e2e.mjs"
import storeDay from "./store-day.e2e.mjs"
import transfers from "./transfers.e2e.mjs"

// Order matters: the store day expects Westham as seeded, so it runs first.
const results = []
for (const run of [pages, storeDay, recipes, transfers]) results.push(await run())

const failed = results.filter((ok) => !ok).length
console.log(failed ? `\n${failed} walkthrough(s) had problems.` : "\nAll walkthroughs passed.")
process.exitCode = failed ? 1 : 0
