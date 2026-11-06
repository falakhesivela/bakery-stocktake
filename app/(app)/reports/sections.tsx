import Link from "next/link"
import { Banknote, CakeSlice, ClipboardList, PackageX, ShoppingBag, Truck, type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate, formatMoney, formatQty } from "@/lib/format"
import { WASTE_REASON_LABELS } from "@/lib/store-ops"
import { createClient } from "@/lib/supabase/server"
import { REASON_LABELS } from "@/lib/transfers"
import { ReportTable, type Column } from "./report-table"

/** What a report covers: the date range and the locations the user manages. */
export type Scope = {
  from: string
  to: string
  today: string
  /** One location, or null for all the user's managed locations. */
  locationId: string | null
  ids: Set<string>
  codes: Set<string>
  /** Several locations: show a Location column. */
  multi: boolean
  /** A location in the report bakes. */
  bakes: boolean
  /** "ST-01", or "all" for all locations; used in CSV file names. */
  place: string
  /** Added to CSV file names, e.g. "ST-01-2026-10-08-to-2026-11-04". */
  fileSuffix: string
}

const n = (value: number | string | null | undefined) => Number(value ?? 0)
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const pctText = (value: number | null) => (value === null ? "—" : `${value}%`)
const sum = <T,>(rows: T[], f: (row: T) => number) => rows.reduce((s, r) => s + f(r), 0)

function rpcArgs(scope: Scope) {
  return { p_from: scope.from, p_to: scope.to, p_location_id: scope.locationId ?? undefined }
}

function locationColumn<T extends { location_code: string }>(scope: Scope): Column<T>[] {
  return scope.multi ? [{ header: "Location", value: (r) => r.location_code }] : []
}

function itemColumn<T extends { item_name: string; sku: string }>(): Column<T> {
  return {
    header: "Item",
    value: (r) => r.item_name,
    cell: (r) => (
      <>
        <div className="font-medium">{r.item_name}</div>
        <div className="text-xs text-muted-foreground">{r.sku}</div>
      </>
    ),
  }
}

function qtyColumn<T extends { unit: Unit }>(header: string, get: (r: T) => number, total?: number): Column<T> {
  return { header, numeric: true, value: get, cell: (r) => formatQty(get(r), r.unit), total }
}

function moneyColumn<T>(header: string, get: (r: T) => number, total?: number): Column<T> {
  return {
    header,
    numeric: true,
    value: (r) => Math.round(get(r) * 100) / 100,
    cell: (r) => formatMoney(get(r)),
    total: total === undefined ? undefined : formatMoney(total),
  }
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function loadMovements(scope: Scope) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("report_movements", rpcArgs(scope))
  return (data ?? []).filter((r) => scope.ids.has(r.location_id))
}

async function loadWaste(scope: Scope) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("report_waste", rpcArgs(scope))
  return (data ?? []).filter((r) => scope.ids.has(r.location_id))
}

async function loadCounts(scope: Scope) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("report_count_differences", rpcArgs(scope))
  return (data ?? []).filter((r) => scope.codes.has(r.location_code))
}

async function loadDeliveries(scope: Scope) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("report_transfer_differences", rpcArgs(scope))
  return (data ?? []).filter((r) => scope.codes.has(r.from_code) || scope.codes.has(r.to_code))
}

async function loadProduction(scope: Scope) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("report_production", rpcArgs(scope))
  return (data ?? []).filter((r) => scope.ids.has(r.location_id))
}

async function loadCollectedOrders(scope: Scope) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("report_collected_orders", rpcArgs(scope))
  return (data ?? []).filter((r) => scope.ids.has(r.location_id))
}

// ---------------------------------------------------------------------------

export async function OverviewReport({ scope }: { scope: Scope }) {
  const [movements, waste, counts, deliveries, production, orders] = await Promise.all([
    loadMovements(scope),
    loadWaste(scope),
    loadCounts(scope),
    loadDeliveries(scope),
    loadProduction(scope),
    loadCollectedOrders(scope),
  ])

  const salesValue = sum(movements, (r) => n(r.sold) * n(r.unit_price))
  const orderValue = sum(orders, (r) => n(r.value))
  const orderCount = sum(orders, (r) => n(r.orders))
  const wasteValue = sum(waste, (r) => n(r.cost_value))
  const countValue = sum(counts, (r) => n(r.value))
  const deliveryValue = sum(deliveries, (r) => n(r.value))
  const baked = sum(production, (r) => (r.unit === "each" ? n(r.qty) : 0))

  const locations = [...new Set(movements.map((r) => r.location_code))]
    .sort()
    .map((code) => {
      const at = <T extends { location_code: string }>(rows: T[]) => rows.filter((r) => r.location_code === code)
      const sales = sum(at(movements), (r) => n(r.sold) * n(r.unit_price))
      const wasted = sum(at(waste), (r) => n(r.cost_value))
      return {
        location_code: code,
        sales,
        orders: sum(at(orders), (r) => n(r.value)),
        wasted,
        wastePct: pct(wasted, sales),
        counts: sum(at(counts), (r) => n(r.value)),
        deliveries: sum(
          deliveries.filter((r) => r.to_code === code),
          (r) => n(r.value),
        ),
      }
    })

  const mostWasted = [
    ...waste
      .reduce((map, r) => {
        const key = `${r.location_code}|${r.item_id}`
        const prev = map.get(key)
        map.set(key, {
          location_code: r.location_code,
          item_name: r.item_name,
          sku: r.sku,
          unit: r.unit,
          qty: (prev?.qty ?? 0) + n(r.qty),
          cost: (prev?.cost ?? 0) + n(r.cost_value),
        })
        return map
      }, new Map<string, { location_code: string; item_name: string; sku: string; unit: Unit; qty: number; cost: number }>())
      .values(),
  ]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Shelf sales" value={formatMoney(salesValue)} hint="Units sold × catalogue price" icon={Banknote} />
        <Kpi
          label="Customer orders collected"
          value={formatMoney(orderValue)}
          hint={`${orderCount} ${orderCount === 1 ? "order" : "orders"}`}
          icon={ShoppingBag}
        />
        <Kpi
          label="Waste at cost"
          value={formatMoney(wasteValue)}
          hint={salesValue > 0 ? `${pctText(pct(wasteValue, salesValue))} of shelf sales` : "No sales in this period"}
          icon={PackageX}
          tone={wasteValue > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Count differences"
          value={formatMoney(countValue)}
          hint={countValue < 0 ? "Stock missing at counts" : "Found by approved counts"}
          icon={ClipboardList}
          tone={countValue < 0 ? "bad" : undefined}
        />
        <Kpi
          label="Delivery differences"
          value={formatMoney(deliveryValue)}
          hint={`${deliveries.length} ${deliveries.length === 1 ? "line" : "lines"} short, damaged or extra`}
          icon={Truck}
          tone={deliveryValue < 0 ? "bad" : undefined}
        />
        {scope.bakes ? (
          <Kpi
            label="Baked"
            value={formatQty(baked)}
            hint={`Cost ${formatMoney(sum(production, (r) => n(r.cost_value)))}`}
            icon={CakeSlice}
          />
        ) : (
          <Kpi
            label="Units sold"
            value={formatQty(sum(movements, (r) => (r.unit === "each" ? n(r.sold) + n(r.ordered) : 0)))}
            hint="Shelf sales and customer orders"
            icon={CakeSlice}
          />
        )}
      </div>

      <ReportTable
        title="By location"
        description="Sales at catalogue price; waste, counts and deliveries at cost."
        filename={`overview-${scope.fileSuffix}.csv`}
        rows={locations}
        columns={[
          { header: "Location", value: (r) => r.location_code },
          moneyColumn<(typeof locations)[number]>("Shelf sales", (r) => r.sales, sum(locations, (r) => r.sales)),
          moneyColumn<(typeof locations)[number]>("Orders collected", (r) => r.orders, sum(locations, (r) => r.orders)),
          moneyColumn<(typeof locations)[number]>("Waste", (r) => r.wasted, sum(locations, (r) => r.wasted)),
          { header: "Waste % of sales", numeric: true, value: (r) => r.wastePct, cell: (r) => pctText(r.wastePct) },
          moneyColumn<(typeof locations)[number]>("Count differences", (r) => r.counts, sum(locations, (r) => r.counts)),
          moneyColumn<(typeof locations)[number]>("Delivery differences", (r) => r.deliveries, sum(locations, (r) => r.deliveries)),
        ]}
      />

      <ReportTable
        title="Most wasted"
        description="Items with the highest waste cost in this period."
        filename={`most-wasted-${scope.fileSuffix}.csv`}
        rows={mostWasted}
        empty="Nothing was wasted in this period."
        columns={[
          ...locationColumn<(typeof mostWasted)[number]>(scope),
          itemColumn<(typeof mostWasted)[number]>(),
          qtyColumn<(typeof mostWasted)[number]>("Wasted", (r) => r.qty),
          moneyColumn<(typeof mostWasted)[number]>("Cost", (r) => r.cost),
        ]}
      />
    </div>
  )
}

export async function SalesReport({ scope }: { scope: Scope }) {
  const [movements, orders] = await Promise.all([loadMovements(scope), loadCollectedOrders(scope)])
  const rows = movements
    .filter((r) => n(r.sold) > 0 || n(r.ordered) > 0)
    .map((r) => ({ ...r, value: n(r.sold) * n(r.unit_price) }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="flex flex-col gap-6">
      <ReportTable
        title="Shelf sales"
        description="From the end-of-day sales entry, valued at the catalogue price. Items handed over on customer orders are shown separately."
        filename={`sales-${scope.fileSuffix}.csv`}
        rows={rows}
        columns={[
          ...locationColumn<(typeof rows)[number]>(scope),
          itemColumn<(typeof rows)[number]>(),
          { header: "Category", value: (r) => r.category_name ?? "", className: "hidden md:table-cell" },
          qtyColumn<(typeof rows)[number]>("Sold", (r) => n(r.sold)),
          qtyColumn<(typeof rows)[number]>("On customer orders", (r) => n(r.ordered)),
          moneyColumn<(typeof rows)[number]>("Price", (r) => n(r.unit_price)),
          moneyColumn<(typeof rows)[number]>("Sales value", (r) => r.value, sum(rows, (r) => r.value)),
        ]}
      />
      <ReportTable
        title="Customer orders collected"
        description="Valued at the price on each order."
        filename={`orders-collected-${scope.fileSuffix}.csv`}
        rows={orders}
        empty="No customer orders were collected in this period."
        columns={[
          { header: "Pickup store", value: (r) => r.location_code },
          { header: "Orders", numeric: true, value: (r) => n(r.orders), total: sum(orders, (r) => n(r.orders)) },
          moneyColumn<(typeof orders)[number]>("Value", (r) => n(r.value), sum(orders, (r) => n(r.value))),
        ]}
      />
    </div>
  )
}

export async function WasteReport({ scope }: { scope: Scope }) {
  const rows = await loadWaste(scope)
  const byReason = Object.entries(WASTE_REASON_LABELS)
    .map(([reason, label]) => {
      const of = rows.filter((r) => r.reason === reason)
      return { reason: label, entries: sum(of, (r) => n(r.entries)), cost: sum(of, (r) => n(r.cost_value)) }
    })
    .filter((r) => r.entries > 0)
    .sort((a, b) => b.cost - a.cost)

  return (
    <div className="flex flex-col gap-6">
      <ReportTable
        title="Waste by reason"
        filename={`waste-by-reason-${scope.fileSuffix}.csv`}
        rows={byReason}
        empty="Nothing was wasted in this period."
        columns={[
          { header: "Reason", value: (r) => r.reason },
          { header: "Entries", numeric: true, value: (r) => r.entries, total: sum(byReason, (r) => r.entries) },
          moneyColumn<(typeof byReason)[number]>("Cost", (r) => r.cost, sum(byReason, (r) => r.cost)),
        ]}
      />
      <ReportTable
        title="Waste by item"
        description="Valued at the item's cost when it was wasted."
        filename={`waste-${scope.fileSuffix}.csv`}
        rows={rows}
        empty="Nothing was wasted in this period."
        columns={[
          ...locationColumn<(typeof rows)[number]>(scope),
          itemColumn<(typeof rows)[number]>(),
          { header: "Reason", value: (r) => WASTE_REASON_LABELS[r.reason] },
          { header: "Entries", numeric: true, value: (r) => n(r.entries), className: "hidden sm:table-cell" },
          qtyColumn<(typeof rows)[number]>("Qty", (r) => n(r.qty)),
          moneyColumn<(typeof rows)[number]>("Cost", (r) => n(r.cost_value), sum(rows, (r) => n(r.cost_value))),
        ]}
      />
    </div>
  )
}

export async function SellThroughReport({ scope }: { scope: Scope }) {
  const rows = (await loadMovements(scope))
    .filter((r) => r.location_type === "store" && r.kind === "product")
    .map((r) => {
      const received = n(r.received)
      const sold = n(r.sold) + n(r.ordered)
      const wasted = n(r.wasted)
      return {
        ...r,
        receivedQty: received,
        soldQty: sold,
        wastedQty: wasted,
        soldPct: pct(sold, received),
        wastePct: pct(wasted, received),
      }
    })
    .filter((r) => r.receivedQty > 0 || r.soldQty > 0 || r.wastedQty > 0)
    .sort((a, b) => (b.wastePct ?? 0) - (a.wastePct ?? 0))

  return (
    <ReportTable
      title="Received, sold & wasted"
      description="For each product at your stores: what arrived, what sold (including customer orders) and what was thrown away. High waste means the store gets more than it sells; consider lowering its standing order."
      filename={`sell-through-${scope.fileSuffix}.csv`}
      rows={rows}
      empty="No store activity in this period."
      columns={[
        ...locationColumn<(typeof rows)[number]>(scope),
        itemColumn<(typeof rows)[number]>(),
        qtyColumn<(typeof rows)[number]>("Received", (r) => r.receivedQty),
        qtyColumn<(typeof rows)[number]>("Sold", (r) => r.soldQty),
        qtyColumn<(typeof rows)[number]>("Wasted", (r) => r.wastedQty),
        qtyColumn<(typeof rows)[number]>("Count difference", (r) => n(r.count_difference)),
        { header: "Sold %", numeric: true, value: (r) => r.soldPct, cell: (r) => pctText(r.soldPct) },
        {
          header: "Waste %",
          numeric: true,
          value: (r) => r.wastePct,
          cell: (r) => (
            <span className={(r.wastePct ?? 0) >= 15 ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>
              {pctText(r.wastePct)}
            </span>
          ),
        },
      ]}
    />
  )
}

export async function StockValueReport({ scope }: { scope: Scope }) {
  const supabase = await createClient()
  let query = supabase
    .from("stock_by_item")
    .select("location_id, location_code, item_id, item_name, sku, kind, unit, category_name, qty")
    .gt("qty", 0)
    .order("location_code")
    .order("kind")
    .order("item_name")
  if (scope.locationId) query = query.eq("location_id", scope.locationId)
  const [{ data: stock }, { data: items }] = await Promise.all([
    query,
    supabase.from("items").select("id, cost, price"),
  ])
  const prices = new Map((items ?? []).map((i) => [i.id, i]))
  const rows = (stock ?? [])
    .filter((r) => scope.ids.has(r.location_id))
    .map((r) => {
      const cost = n(prices.get(r.item_id)?.cost)
      return { ...r, qty: n(r.qty), cost, value: n(r.qty) * cost }
    })

  const KIND_LABELS = { product: "Products", ingredient: "Ingredients", packaging: "Packaging" } as const
  const byKind = (Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((kind) => ({
    kind,
    value: sum(rows.filter((r) => r.kind === kind), (r) => r.value),
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {byKind.map((k) => (
          <Kpi key={k.kind} label={KIND_LABELS[k.kind]} value={formatMoney(k.value)} hint="On hand now, at cost" icon={Banknote} />
        ))}
      </div>
      <ReportTable
        title="Stock on hand, at cost"
        description="What's on the shelves right now. Items with no stock or negative stock are left out."
        filename={`stock-value-${scope.place}-${scope.today}.csv`}
        rows={rows}
        empty="No stock on hand."
        columns={[
          ...locationColumn<(typeof rows)[number]>(scope),
          itemColumn<(typeof rows)[number]>(),
          { header: "Kind", value: (r) => r.kind, className: "hidden md:table-cell capitalize" },
          qtyColumn<(typeof rows)[number]>("On hand", (r) => r.qty),
          moneyColumn<(typeof rows)[number]>("Unit cost", (r) => r.cost),
          moneyColumn<(typeof rows)[number]>("Value", (r) => r.value, sum(rows, (r) => r.value)),
        ]}
      />
    </div>
  )
}

export async function ProductionReport({ scope }: { scope: Scope }) {
  const rows = await loadProduction(scope)
  return (
    <ReportTable
      title="Production"
      description="Bakes logged (voided bakes are left out), valued at the product's cost."
      filename={`production-${scope.fileSuffix}.csv`}
      rows={rows}
      empty="Nothing was baked in this period."
      columns={[
        ...locationColumn<(typeof rows)[number]>(scope),
        itemColumn<(typeof rows)[number]>(),
        { header: "Bakes", numeric: true, value: (r) => n(r.bakes), total: sum(rows, (r) => n(r.bakes)) },
        qtyColumn<(typeof rows)[number]>("Made", (r) => n(r.qty)),
        moneyColumn<(typeof rows)[number]>("Cost", (r) => n(r.cost_value), sum(rows, (r) => n(r.cost_value))),
      ]}
    />
  )
}

export async function IngredientReport({ scope }: { scope: Scope }) {
  const rows = (await loadMovements(scope))
    .filter((r) => r.kind !== "product")
    .filter((r) => n(r.used) > 0 || n(r.count_difference) !== 0 || n(r.wasted) > 0)
    .map((r) => {
      const used = n(r.used)
      const diff = n(r.count_difference)
      return {
        ...r,
        usedQty: used,
        wastedQty: n(r.wasted),
        diff,
        // A count that comes up short (-) means more went than the recipes say.
        actual: used + n(r.wasted) - diff,
        diffPct: pct(-diff, used),
        diffValue: diff * n(r.unit_cost),
      }
    })
    .sort((a, b) => a.diffValue - b.diffValue)

  return (
    <ReportTable
      title="Ingredient use: recipes vs counts"
      description="Recipe use is what the recipes say bakes took. Counts show what really went: when a count comes up short, more was used (or lost) than the recipes say. Over-use % compares that shortfall to recipe use."
      filename={`ingredient-use-${scope.fileSuffix}.csv`}
      rows={rows}
      empty="No ingredients were used or counted in this period."
      columns={[
        ...locationColumn<(typeof rows)[number]>(scope),
        itemColumn<(typeof rows)[number]>(),
        qtyColumn<(typeof rows)[number]>("Recipe use", (r) => r.usedQty),
        qtyColumn<(typeof rows)[number]>("Wasted", (r) => r.wastedQty),
        qtyColumn<(typeof rows)[number]>("Count difference", (r) => r.diff),
        qtyColumn<(typeof rows)[number]>("Actual use", (r) => r.actual),
        {
          header: "Over-use %",
          numeric: true,
          value: (r) => r.diffPct,
          cell: (r) => (
            <span className={(r.diffPct ?? 0) >= 5 ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>
              {pctText(r.diffPct)}
            </span>
          ),
        },
        moneyColumn<(typeof rows)[number]>("Difference value", (r) => r.diffValue, sum(rows, (r) => r.diffValue)),
      ]}
    />
  )
}

export async function CountReport({ scope }: { scope: Scope }) {
  const rows = await loadCounts(scope)
  return (
    <ReportTable
      title="Count differences"
      description="Lines where an approved stock take found more (+) or less (−) than expected, at cost."
      filename={`count-differences-${scope.fileSuffix}.csv`}
      rows={rows}
      empty="Approved counts in this period matched the system."
      columns={[
        { header: "Date", value: (r) => r.count_date, cell: (r) => formatDate(r.count_date) },
        {
          header: "Count",
          value: (r) => r.code,
          cell: (r) => (
            <Link href={`/stock-takes/${r.code}`} className="font-mono hover:underline">
              {r.code}
            </Link>
          ),
        },
        ...locationColumn<(typeof rows)[number]>(scope),
        itemColumn<(typeof rows)[number]>(),
        { header: "Batch", value: (r) => r.batch_code ?? "", className: "hidden md:table-cell font-mono text-xs" },
        qtyColumn<(typeof rows)[number]>("Expected", (r) => n(r.expected)),
        qtyColumn<(typeof rows)[number]>("Counted", (r) => n(r.counted)),
        qtyColumn<(typeof rows)[number]>("Difference", (r) => n(r.difference)),
        moneyColumn<(typeof rows)[number]>("Value", (r) => n(r.value), sum(rows, (r) => n(r.value))),
      ]}
    />
  )
}

export async function DeliveryReport({ scope }: { scope: Scope }) {
  const rows = await loadDeliveries(scope)
  return (
    <ReportTable
      title="Delivery differences"
      description="Deliveries that arrived short, damaged or with extra, at cost. Shown for both the sending and the receiving location."
      filename={`delivery-differences-${scope.fileSuffix}.csv`}
      rows={rows}
      empty="Every delivery in this period arrived as sent."
      columns={[
        { header: "Received", value: (r) => r.received_on, cell: (r) => formatDate(r.received_on) },
        {
          header: "Transfer",
          value: (r) => r.code,
          cell: (r) => (
            <Link href={`/transfers/${r.code}`} className="font-mono hover:underline">
              {r.code}
            </Link>
          ),
        },
        { header: "Route", value: (r) => `${r.from_code} → ${r.to_code}` },
        itemColumn<(typeof rows)[number]>(),
        qtyColumn<(typeof rows)[number]>("Sent", (r) => n(r.sent)),
        qtyColumn<(typeof rows)[number]>("Received", (r) => n(r.received)),
        qtyColumn<(typeof rows)[number]>("Difference", (r) => n(r.difference)),
        { header: "Reason", value: (r) => (r.reason ? REASON_LABELS[r.reason] : "") },
        { header: "Note", value: (r) => r.note ?? "", className: "hidden lg:table-cell max-w-48 truncate" },
        moneyColumn<(typeof rows)[number]>("Value", (r) => n(r.value), sum(rows, (r) => n(r.value))),
      ]}
    />
  )
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: LucideIcon
  tone?: "warn" | "bad"
}) {
  const toneClass =
    tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
        <Icon className={`size-5 shrink-0 ${toneClass}`} />
      </CardContent>
    </Card>
  )
}
