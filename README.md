# Bakery Stock

Stock control for a bakery with several stores and warehouses: what's in stock
where, batches with best-before dates, moving stock between locations, stock
takes, waste, sales and customer orders.

Built with Next.js 16 (App Router, Cache Components), Supabase (Postgres, Auth,
row-level security), Tailwind 4 and shadcn/ui (Base UI).

## What works today

**Phase 1: foundations**

- Sign in; roles per location (warehouse manager, baker, store manager, store staff, driver) plus admins
- Locations (stores and warehouses) and staff accounts (admin only)
- Catalogue of products, ingredients and packaging, with barcodes, shelf life and CSV import
- Opening stock per location (typed, scanned or from CSV); each line creates a dated batch
- Stock on hand by batch or by item, with expiry warnings and search by name, SKU, barcode or batch code
- Dashboard: expired / expiring stock, low stock, negative stock, setup checklist
- Batch and product labels (Code 128 / EAN-13) for label printers or A4 sheets
- Camera barcode scanning on phones; USB/Bluetooth scanners work as keyboards
- Installable on phones (web app manifest)

**Phase 2: production and transfers**

- Production: log bakes at locations that bake; each bake becomes a batch with
  best-before date and a "print labels" button. A "to bake" list shows what open
  orders need, minus stock that will still be fresh. Mistaken bakes can be
  undone while none of the batch has moved.
- Transfers between any two locations:
  - **Request:** a store asks the warehouse; the warehouse approves (and can
    change quantities) or rejects with a reason.
  - **Send:** a manager sends stock straight away (deliveries, moves between
    warehouses, returns from a store).
  - **Standing orders:** usual quantities per store and weekday. Every hour the
    database creates tomorrow's order as a request (pg_cron).
- Picking suggests the oldest in-date batches first; scanning a batch label
  ticks it off, or swaps it in for a suggested one.
- Dispatch takes stock out of the sender; it shows as "on the way" until received.
- Delivery note / pick list to print, with a QR code that opens the receive screen.
- Receiving: confirm everything in one tap, or record missing / damaged / extra
  items with a reason. Differences are written off at the receiving store so
  stock stays correct and the warehouse sees what happened.
- Each transfer has a full history (who requested, approved, picked, dispatched, received).
- Stock history page: every stock change, with links to its transfer.
- Dashboard: transfers waiting for you, deliveries on the way, overdue transfers.

**Phase 3: store daily operations**

- End-of-day sales: one entry per store per day, typed from the till report,
  scanned, or loaded from a till CSV. Save as a draft, then post: stock comes
  out oldest in-date batch first. A manager can reopen posted sales to fix
  mistakes (the stock goes back exactly where it came from).
- Waste: several lines at once, each with batch, reason and an optional photo
  (stored privately, visible only to that location's staff). A "use or
  remove" list offers one-tap waste for anything at or past its best-before.
  Mistakes can be undone.
- Stock takes: a quick closing count of products, everything, or chosen
  categories. Several people can count at once on their phones (counts save
  as you go; scanning a batch label adds one). Optional blind counting. A
  manager reviews the differences (units and value) and approves them, which
  corrects the stock.
- End of day page per store: checklist (sales posted, waste logged, count
  approved) and where every item went that day: start + in − sold − wasted =
  expected, against what was counted.
- Dashboard: today's sales / waste / count status for each store.

**Phase 4: recipes and ingredients**

- Recipes: what goes into each product, per round of the recipe (e.g. 12
  cupcakes = 0.25 kg flour, 4 eggs…), in each ingredient's own unit.
  Admins and managers of a bakery can edit them; everyone can read them.
- Logging a bake takes the ingredients out of stock automatically (oldest
  in-date batch first). The bake form shows what it will use and warns when
  the system has too little; it can be switched off for a single bake.
  Undoing a bake puts the ingredients back too.
- Cost to make: each recipe's cost from the ingredients' cost prices, against
  the selling price (margin). Admins can copy it into the product's cost price.
- Supplier deliveries: record what arrived (supplier, delivery note number,
  quantities, costs, best-before and supplier lot number). Items with
  best-before dates get a batch you can label. Managers can update cost prices
  from the delivery, and cancel a delivery entered by mistake.
- Suppliers list, kept by managers.
- Reorder levels per location (reorder at / order up to). "Running low" on
  Deliveries and the dashboard shows what to order and how much.
- The production page lists the ingredients needed for the bake plan and any
  shortfall.

Coming next: customer orders (Phase 5), then reports and alerts. The full plan
is in [docs/plan.md](docs/plan.md).

## How stock is stored

Every stock change is a row in `stock_movements` (the ledger). It is
append-only: mistakes are fixed with a correcting movement, never by editing.
`stock_levels` holds the current total per location / item / batch and is kept
in sync by a database trigger. The app never writes stock tables directly; it
calls Postgres functions (e.g. `post_opening_stock`, `dispatch_transfer`) that
check permissions and run in a single transaction.

A transfer moves stock in two steps. Dispatch writes `transfer_out` at the
sender. Receiving writes `transfer_in` at the receiver for everything that was
sent, then a `transfer_loss` line for any difference (with the reason). So the
sent and received entries of every transfer always cancel out, and shortages
show up as their own lines instead of disappearing.

Every movement also has a **business day**: normally the day it was recorded,
but sales use the day they were made, bakes the bake date, and count
corrections the day that was counted. A closing count for a day is compared
with everything belonging to that day and before, so it doesn't matter whether
the day's sales were typed in before or after counting. (A count done before
opening in the morning should be dated the previous day.)

## Local setup

Requirements: Node 20+, pnpm, Docker.

```bash
pnpm install
pnpm db:start          # local Supabase (skips optional services to save memory)
pnpm exec supabase status   # copy the API URL, publishable key and secret key
cp .env.example .env.local  # paste the values in
pnpm db:reset          # applies migrations and loads seed data
pnpm dev
```

Open http://localhost:3000 and sign in with one of the seeded accounts
(password `password123` for all):

| Email | Access |
|---|---|
| admin@bakery.test | Admin (everything) |
| warehouse@bakery.test | Warehouse manager, WH-01 |
| westham@bakery.test | Store manager, ST-01 Westham |
| staff@bakery.test | Store staff, ST-01 Westham |
| riverside@bakery.test | Store manager, ST-02 Riverside |
| baker@bakery.test | Baker / warehouse staff, WH-01 (bakes, picks, dispatches) |
| driver@bakery.test | Driver, WH-01 (can see transfers, can't change stock) |

The seed data includes a delivery on its way to Westham (T-00001), a party
request from Riverside waiting for approval, tomorrow's standing orders, a
morning bake of croissants, and a closed-off yesterday at Westham (sales,
waste and an approved count with one cupcake missing), so every screen has
something to show.

Who can do what with transfers:

| | Request / send stock | Approve transfers | Pick, dispatch, receive | Sales, waste, counting | Reopen sales, approve counts |
|---|---|---|---|---|---|
| Manager | ✓ | ✓ (as sender) | ✓ | ✓ | ✓ |
| Baker / staff | | | ✓ | ✓ | |
| Driver | | | | | |

Everything applies to the person's own locations only; admins can do it all.
### Browser walkthroughs

`pnpm test:e2e` drives a headless Chromium through real flows (baking,
transfers, a store's day, recipes and deliveries) and checks what each role
can see. It uses the newest Playwright headless shell in
`~/.cache/ms-playwright`; if there is none, run
`pnpm exec playwright-core install chromium-headless-shell` once, or point
`E2E_CHROMIUM` at a Chromium binary.

### Testing the camera scanner on a phone

Browsers only allow the camera on `https://` or `localhost`. To test from a
phone on the same Wi-Fi, run `pnpm dev --experimental-https` and open the
https address it prints (accept the certificate warning).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app |
| `pnpm build` | Production build (also checks Cache Components rules) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm test` | Database tests against **local** Supabase (permissions, ledger, bakes, transfers, sales, waste, counts, recipes, deliveries) |
| `pnpm test:e2e` | Browser walkthroughs and page/permission checks against the running app (run `pnpm db:reset` first; `BASE=` to point elsewhere) |
| `pnpm db:reset` | Rebuild the local database from migrations + seed |
| `pnpm db:types` | Regenerate `lib/supabase/database.types.ts` after changing SQL |

## Going live (Supabase cloud)

1. Create a Supabase project and link it: `pnpm exec supabase link`.
2. Push the schema: `pnpm exec supabase db push` (do **not** load `seed.sql`).
   This also turns on `pg_cron` (hourly standing-order job) and creates the
   private `photos` storage bucket with its access rules.
3. In the dashboard, turn off public sign-ups (Authentication → Sign In / Providers).
4. Create the first account in Authentication → Users. The first account becomes admin automatically.
5. Set the three environment variables on your host (e.g. Vercel). Keep `SUPABASE_SECRET_KEY` server-side only.

## Project layout

```
app/(auth)/login          sign in
app/(app)/...             signed-in pages (dashboard, stock, transfers, production, catalogue, labels, settings)
app/(print)/...           bare print layouts (labels, delivery notes)
components/               shared UI (sidebar, scanner, shadcn/ui in components/ui)
lib/                      auth, permissions, Supabase clients, formatting, schemas
proxy.ts                  refreshes the session and sends signed-out visitors to /login
supabase/migrations       database schema, RLS and stock functions
supabase/seed.sql         local test data
tests/db                  database tests (Vitest)
tests/e2e                 browser walkthroughs (Playwright, headless Chromium)
```
