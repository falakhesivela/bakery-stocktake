# Bakery Stock App — Plan & Feature List

## Progress

| Phase | Status |
|---|---|
| 1. Foundations | Done (1 Nov 2026) |
| 2. Production (finished goods) + transfers | Done (1 Nov 2026) |
| 3. Store daily ops | Done (1 Nov 2026) |
| 4. Recipes & ingredients | Done (1 Nov 2026) |
| 5. Customer orders | Done (1 Nov 2026) |
| 6. Reports & alerts | Done (4 Nov 2026) |

Decisions made while building Phase 2 (differences from the plan below):
- **No separate "Closed" status.** A transfer ends at *Received*. If anything
  arrived short, damaged or extra, it is flagged "Differences", the reason is
  shown on the transfer, and it appears on both sides' lists.
- **How shortages hit stock:** receiving books the full amount sent
  (`transfer_in`), then a `transfer_loss` line for the difference with its
  reason, at the receiving location. Sent and received always cancel out per
  transfer; losses are their own lines for reporting.
- **Drafts are deleted, not cancelled**, when abandoned (nothing happened yet).
- **Standing orders** create tomorrow's transfer every hour (pg_cron) as a
  *request* waiting for the warehouse's approval. One per route per day; a
  cancelled one is not recreated.
- **Bakes can be undone** (with a reason) only while none of the batch has
  moved; after that, use waste or a stock take (Phase 3).
- **"To bake" list** = open outgoing transfers due by a date minus stock that
  will still be in date. Customer orders join it in Phase 5.
- Drivers can see transfers at their location but can't change anything yet;
  a driver view (mark collected/delivered) stays on the "later" list.

Decisions made while building Phase 3:
- **Business day on every movement.** Counts compare against everything dated
  on or before the count's day, so sales typed in after counting aren't taken
  off twice. Morning counts are dated the previous day.
- **Store staff can enter and post sales** (not only managers, as the role table
  below says): whoever closes the store usually does it. Only managers can
  reopen posted sales or approve counts.
- **Sales take in-date stock first**; expired batches are only used after that,
  so stock that should have been thrown away stays visible as expired.
  Selling more than the system has goes negative "without a batch" until a
  count fixes it.
- **Waste without a batch takes the oldest stock first** (expired first).
- **Uncounted lines are left alone** on approval; "set uncounted to 0" is an
  explicit button.
- **Blind counts hide the expected quantities in the app**; staff can still see
  stock levels elsewhere, so it prevents bias rather than being a security
  control.
- Counts must be approved in date order per location.
- Photos are shrunk on the phone (max 1600 px JPEG) before upload.

Decisions made while building Phase 4:
- **One recipe per product**, as quantities per "round" with a yield (e.g. a
  tray of 12). No recipe versions yet: changing a recipe affects future bakes
  only; past bakes keep what they used.
- **Ingredients come out at the bake's business day**, oldest in-date batch
  first. Shortfalls are allowed (negative stock, flagged) so a bake is never
  blocked by a wrong ingredient count.
- **Actual vs recipe usage** will come from ingredient stock takes: the count
  difference is the over/under use (Reports → Ingredient use).
- **Any staff can receive deliveries; only managers can update cost prices or
  cancel a delivery.** Cancelling doesn't undo a cost-price update.
- **Suppliers are kept by any manager** (not only admins). Purchase orders to
  suppliers stay on the "later" list; "Running low" shows what to order.
- Browser walkthroughs now live in `tests/e2e` (`pnpm test:e2e`).

Decisions made while building Phase 5:
- **Statuses: new → confirmed → ready → collected (or cancelled).** No separate
  "in production" or "sent" status: where the order physically is comes from
  its delivery (on the way / at the store), shown in words on the order.
- **Custom cakes are a "made to order" catalogue item** (Custom cake), so they
  move through bakes, deliveries and stock like everything else; the cake's
  details and photo live on the order line.
- **Only confirmed orders go on the bake list.** "New" orders are enquiries.
- **A bakery-made order can only be handed over once it's ready**; shelf orders
  can be handed over straight away.
- **Cancelling a ready order needs a manager**; if its delivery hasn't left, the
  order comes off it again. Anything already made stays in stock.
- **Customers are matched on the last 9 digits of their phone number**, so
  "082 555 1234" and "+27 82 555 1234" are the same person.
- **Staff at any store or bakery can look up customers** (orders can be taken
  anywhere). Customer details are personal information: keep access in mind
  for POPIA.
- Payments are amounts only (deposit, paid on collection); no payment methods
  or till integration yet. SMS/WhatsApp "ready" messages stay on the later list.

Decisions made while building Phase 6:
- **Reports are for managers and admins**, over the locations they manage,
  and are worked out live from the stock ledger (no separate reporting
  tables). Sales are valued at today's catalogue price; waste at the cost when
  it was wasted; counts and delivery differences at cost.
- **Received, sold & wasted** counts customer orders as sold. Ingredient "actual
  use" = recipe use + waste − count difference.
- **Suggested standing orders** = average sold (shelf sales and customer
  orders) per weekday over the last 4 weeks, rounded up. Waste is already left
  out because only what sold counts. Suggestions only fill the screen;
  nothing changes until the manager saves.
- **In-app notifications only** (bell + Notifications page), checked every
  minute and on each page change. Event notifications go to the people who
  have to act (e.g. new requests to the sending location's managers) and never
  to the person who caused them. Daily alerts run hourly but go out once per
  person per day, from 06:00 local time. Notifications are kept 60 days. Email
  and SMS stay on the later list.
- **Audit log covers settings and catalogue changes** (products, prices,
  barcodes, categories, recipes, suppliers, locations, users, roles, reorder
  levels, standing orders); stock changes are already in the ledger. Saving a
  standing order or recipe now writes only the lines that changed, so the log
  shows real changes. Only admins can read it.

## Context
A bakery with several **stores** and one or more **warehouses** needs one app that tracks stock everywhere: baking at the warehouse, moving goods (warehouse → store, warehouse → warehouse, store → warehouse returns), store sales, waste, stock takes, and customer orders (custom cakes / pre-orders).

**Current state of `westham-stock-take`:** a fresh Create Next App — Next.js **16.4.3**, React 19.3, Tailwind 4, pnpm, TypeScript, `@/*` alias → project root (no `src/`). [next.config.ts](next.config.ts) has `cacheComponents: true`, `partialPrefetching: true`, and Tailwind via the `@tailwindcss/turbopack` loader. Only the starter `app/layout.tsx`, `app/page.tsx`, `app/globals.css` exist. No shadcn/ui, no Supabase yet. Per [AGENTS.md](AGENTS.md), read `node_modules/next/dist/docs/` before writing Next code (APIs differ from older versions).

Decisions already made with the user:
- **Scope v1:** transfers, stock takes & waste, production with recipes (ingredient tracking), end-of-day store sales entry, customer orders.
- **Transfers:** stores can request stock *and* the warehouse can push stock (incl. daily standing orders).
- **Devices:** mobile-friendly web app (installable PWA) with **camera barcode scanning**; online-only.
- **Expiry:** every bake creates a **batch with a best-before date**; oldest stock goes out first (FEFO).
- **Stack:** Next.js 16 + Supabase (same as the user's other projects, e.g. `replai-dashboard`, `certforge-ai-exam-app`), pnpm, Tailwind + shadcn/ui.

---

## 1. Core idea: a stock ledger
Every stock change is written as a row in one append-only table, `stock_movements` (item, batch, location, +/− qty, type, reference, user, time). Nothing edits a quantity directly.
- Stock on hand = sum of movements per location/item/batch, kept in a cached `stock_levels` table updated by a database trigger.
- Movement types: `production_in`, `ingredient_use`, `purchase_in`, `transfer_out`, `transfer_in`, `transfer_loss`, `sale`, `waste`, `count_adjustment`, `order_fulfilled`, `opening_balance`.
- Gives a full audit trail ("where did these 3 cakes go?") and makes every report a query over one table.
- All stock-changing actions run as **Postgres functions (Supabase RPC)** in one transaction (e.g. `dispatch_transfer`, `receive_transfer`, `post_stock_take`), so two people can't dispatch the same transfer twice.
- Negative stock is **allowed but flagged** (reality beats the system, e.g. sales entered before a delivery is received).

## 2. Users & roles
| Role | Can do |
|---|---|
| Owner / Admin | Everything, all locations, settings, prices & costs |
| Warehouse manager | Approve requests, push transfers, production, receiving, stock takes at their warehouse |
| Baker / warehouse staff | Log bakes, pick & dispatch, print labels |
| Store manager | Request stock, receive, sales entry, waste, stock takes, approve counts, customer orders |
| Store staff | Receive, count, log waste, take customer orders |
| Driver (optional) | See assigned deliveries, mark collected/delivered |

Users are linked to one or more locations. Supabase **row-level security** limits each user to their own locations' data.

## 3. Features by area

### A. Setup / catalogue
- Locations: name, type (warehouse/store), address, `can_produce` flag (supports stores that bake on site), business timezone.
- Items: products (cakes, breads, pastries), ingredients (flour, butter…), packaging. SKU, barcode, unit (each/g/kg/ml/L), category, shelf life (days), cost, price, photo, reorder level per location.
- Recipes: product → ingredient lines + yield (e.g. 1 batch = 12 cupcakes).
- Suppliers (for ingredient deliveries).
- CSV import for products, ingredients and opening stock.
- Barcode label printing: product labels and **batch labels** (Code128/QR with batch code + best-before), printed from the browser to a label printer.

### B. Production (warehouse / any `can_produce` location)
- **Bake log:** pick product + quantity → creates a batch (code, bake date, best-before = date + shelf life) → adds finished stock → deducts ingredients from the recipe → print batch labels.
- **Daily production list:** what needs baking for a date = approved store requests + standing orders + customer orders due.
- Ingredient deliveries (goods received from suppliers), with optional ingredient batch/expiry.
- Low ingredient stock alerts based on reorder levels.

### C. Transfers (the core feature)
Status flow:
```
Draft → Requested → Approved → Picking → In transit → Received → Closed
                 ↘ Rejected / Cancelled
```
- **Store request:** store manager builds a list (or "repeat last order"), sets a needed-by date → warehouse approves and can change quantities.
- **Warehouse push:** warehouse creates a transfer that starts at Approved (to a store or another warehouse).
- **Standing orders:** default quantities per store per weekday (e.g. "Mon: 10 chocolate cakes") auto-create draft transfers each evening via a scheduled job (Supabase cron).
- **Returns:** store → warehouse (unsold or damaged goods).
- **Picking:** app suggests batches oldest-expiry-first; picker scans batch labels to confirm; short-picks recorded.
- **Dispatch:** stock leaves the sending location and shows as *in transit*; delivery note (printable/PDF) with transfer number and QR.
- **Receiving:** store scans the delivery-note QR, then confirms or scans each line; records shortages/damage with a reason and optional photo. Differences are written as `transfer_loss` so stock never just disappears.
- Live view of everything in transit and overdue deliveries.

### D. Store daily operations
- **End-of-day sales entry:** quick grid of products × quantity sold (or CSV upload from the till). Stock is deducted from the oldest batches automatically.
- **Waste logging:** item, batch (scan), qty, reason (expired, damaged, unsold end-of-day, quality, staff/sample), optional photo. Near-expiry list to prompt discounting or waste.
- **Stock takes:**
  - Full or partial (by category), and a quick **daily closing count** for cakes.
  - **Blind count** option (staff don't see expected quantities).
  - Count by scanning batch labels or typing quantities; multiple people can count.
  - Variance report (expected vs counted, in units and value) → manager approves → `count_adjustment` movements posted.
- **Daily reconciliation per store:** opening + received − sold − waste vs counted closing.

### E. Customer orders (custom cakes / pre-orders)
- Taken at any store: customer name, phone, pickup store, pickup date/time, items from catalogue **or** custom cake details (size, flavour, filling, message on cake, reference photo), price, deposit paid.
- Status: `New → Confirmed → In production → Ready → Sent to pickup store → Collected` (or `Cancelled`).
- Appears automatically on the production list for its date; when ready, it is added to the transfer going to the pickup store.
- Pickup-day list per store; mark collected and record balance paid.
- (Later) SMS/WhatsApp "your cake is ready" message.

### F. Dashboard, reports & alerts
- Dashboard per role: stock by location, items near expiry, low stock, incoming deliveries, pending requests, today's orders.
- Reports: stock on hand (by location/value), movement history per item/batch, waste by store/product/reason (units & cost), stock-take variances, sent vs sold vs wasted per store (sell-through), production totals, ingredient use (actual vs recipe), transfer discrepancies.
- Export to CSV.
- In-app notifications (and optional email): new request, delivery dispatched, discrepancy reported, near expiry, low stock, order due tomorrow.
- Audit log of who changed what.

## 4. Data model (Supabase / Postgres)
- `locations`, `profiles`, `user_locations (user, location, role)`
- `categories`, `items`, `item_barcodes`, `item_location_settings (reorder level, par level)`
- `recipes`, `recipe_lines`
- `batches (item, code, produced_at, best_before, source, location)`
- `stock_movements` (ledger) and `stock_levels` (cache via trigger)
- `production_runs`
- `suppliers`, `goods_receipts`, `goods_receipt_lines`
- `transfers`, `transfer_lines (requested/approved/dispatched/received qty, discrepancy reason)`, `transfer_line_batches`
- `standing_orders (location, item, weekday, qty)`
- `stock_takes`, `stock_take_lines (expected snapshot, counted)`
- `waste_entries`, `daily_sales`
- `customers`, `customer_orders`, `customer_order_lines (item or custom details JSON, image)`
- `notifications`, `audit_log`
- Supabase Storage buckets for photos (waste, damage, cake references, product images).

## 5. Tech setup (building on the existing app)
**Already in place:** Next.js 16.4 App Router, TypeScript, Tailwind 4, pnpm.

**Small cleanup first** (uncommitted changes in `package.json` + untracked `postcss.config.mjs`):
- Remove the stray `install` package (`pnpm remove install`) — added by accident.
- Tailwind is wired twice: the template's `@tailwindcss/turbopack` loader in `next.config.ts` **and** a new PostCSS setup (`@tailwindcss/postcss`, `postcss`, `postcss.config.mjs`). Keep the template's loader, remove the PostCSS pieces, then confirm styles still load in `pnpm dev` and `pnpm build` (if they don't, keep PostCSS and drop the loader rule instead — just not both).

**To add:**
- **shadcn/ui** (`pnpm dlx shadcn@latest init`) for forms, tables, dialogs, sheets; Zod + react-hook-form for validation; lucide icons.
- **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`, Supabase CLI for local dev): Postgres, Auth (email + magic link; optional PIN login on shared store tablets), RLS, Storage, `pg_cron` for standing orders and alerts. Migrations in `supabase/migrations/`, types generated to `lib/supabase/database.types.ts`.
  - **Reuse** the helpers from `../certforge-ai-exam-app`: `lib/supabase/env.ts`, `client.ts`, `server.ts`, `admin.ts`, `middleware.ts` (`updateSession`) and its `proxy.ts` (Next 16 renamed middleware → `proxy.ts`). Drop the mock-mode and CORS parts.
- **Cache Components rules** (because `cacheComponents: true`): reading the session/cookies must happen inside a `<Suspense>` boundary, never at the top of a layout. Use one `getCurrentUser()` in `lib/auth.ts` with `'use cache: private'` (see `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`). Stock screens are live data → render dynamically behind Suspense; re-check the user in every Server Action.
- Mutations via **Server Actions** that call the Postgres stock functions (RPC).
- Barcode scanning: browser `BarcodeDetector` API with `@zxing/browser` as fallback; USB/Bluetooth scanners work as keyboard input.
- Barcode/label generation: `bwip-js` (Code128/QR), printed via a print-only CSS page sized for the label printer.
- **PWA** manifest (`app/manifest.ts`) so staff can install it on phones/tablets. Consider Next's `experimental.useOffline` so actions retry automatically when a store's connection drops briefly (cheap win; full offline stays out of scope).
- Hosting: Vercel + Supabase cloud.

Folder layout (project root, no `src/`):
```
app/(auth)/login
app/(app)/layout.tsx  (nav shell; user loaded inside Suspense)
app/(app)/dashboard | stock | transfers | production | sales | waste
         | stock-takes | orders | catalogue | reports | settings
app/manifest.ts
components/ui (shadcn), components/scanner, components/labels
lib/supabase/*, lib/auth.ts, lib/stock/* (RPC wrappers), lib/barcode/*
proxy.ts
supabase/migrations, supabase/seed.sql
```

## 6. Build order (phases)
1. **Foundations** — dependency cleanup, shadcn/ui, Supabase (local + cloud) with reused certforge helpers and `proxy.ts`, login + roles & RLS, app shell/nav, locations, catalogue, ledger + stock levels, CSV import & opening stock, label printing, camera scanner component, PWA manifest.
2. **Production (finished goods) + Transfers** — bake log creating batches, requests, pushes, standing orders, picking with scans, dispatch, receiving with discrepancies, delivery notes, in-transit view. *First usable version.*
3. **Store daily ops** — end-of-day sales entry/CSV, waste logging, stock takes with blind count & approval, daily reconciliation.
4. **Recipes & ingredients** — recipes, automatic ingredient deduction, supplier deliveries, low-stock alerts.
5. **Customer orders** — order taking, production list integration, transfer to pickup store, pickup list.
6. **Reports, dashboards & alerts** — reports, notifications, CSV export; suggested bake quantities from past sales.

**Later / nice to have:** till/POS integration, offline mode, SMS/WhatsApp notifications, supplier purchase orders, driver route view, multi-currency/tax.

## 7. Things to collect from the bakery before building
- List of stores and warehouses; which ones bake.
- Product list (name, size, price, shelf life) and current barcodes if any.
- A few recipes to model ingredient tracking.
- Label printer model and label size.
- Who should see costs and prices.

## 8. Verification (how we'll know it works)
- **Every phase:** `pnpm lint` and `pnpm build` pass (the build catches Cache Components mistakes, e.g. reading cookies outside Suspense).
- **Database tests** for each stock function (dispatch, receive, post stock take, sales deduction): run against local Supabase (`supabase start`) with Vitest; check ledger totals always match `stock_levels`.
- **RLS tests:** a store user cannot read or change another store's data.
- **End-to-end walkthrough** (Playwright + manual on a phone): bake 40 chocolate cakes → print batch label → Store A requests 10 → warehouse approves, scans batch, dispatches → Store A receives 9 + reports 1 damaged → enters 6 sold → logs 1 waste → counts 2 → variance is 0 and every step appears in the item's movement history.
- Test camera scanning on a real Android and iPhone device.
