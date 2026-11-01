import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { History, PackagePlus } from "lucide-react"
import { ExpiryBadge } from "@/components/expiry-badge"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireUser } from "@/lib/auth"
import { formatQty } from "@/lib/format"
import { managedLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { StockFilters } from "./stock-filters"

export const metadata: Metadata = { title: "Stock on hand" }

const KINDS = ["product", "ingredient", "packaging"] as const
type Kind = (typeof KINDS)[number]

export default function StockPage({ searchParams }: PageProps<"/stock">) {
  return (
    <>
      <PageHeader
        title="Stock on hand"
        description="Live stock at your locations. Oldest best-before dates are listed first."
        actions={
          <Suspense>
            <StockActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <StockContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function StockActions() {
  const user = await requireUser()
  return (
    <>
      <Link href="/stock/history" className={buttonVariants({ variant: "outline" })}>
        <History />
        History
      </Link>
      {managedLocations(user).length > 0 && (
        <Link href="/stock/opening" className={buttonVariants({ variant: "outline" })}>
          <PackagePlus />
          Opening stock
        </Link>
      )}
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

/** Strip characters that would break a PostgREST or() filter. */
function cleanSearch(value: string) {
  return value.replace(/[,()%*\\]/g, " ").trim()
}

async function StockContent({
  searchParams,
}: {
  searchParams: PageProps<"/stock">["searchParams"]
}) {
  const user = await requireUser()
  const sp = await searchParams
  const locationIds = new Set(user.locations.map((l) => l.id))

  const location = locationIds.has(param(sp.location)) ? param(sp.location) : ""
  const kindParam = param(sp.kind)
  const kind: Kind | "" = (KINDS as readonly string[]).includes(kindParam)
    ? (kindParam as Kind)
    : ""
  const q = param(sp.q)
  const view = param(sp.view) === "item" ? "item" : "batch"

  const supabase = await createClient()

  // A scanned or typed code (barcode, SKU, batch) jumps straight to that item.
  let codeMatch: { item_id: string; batch_id: string | null } | null = null
  if (q) {
    const { data } = await supabase.rpc("find_by_code", { p_code: q })
    codeMatch = data?.[0] ?? null
  }
  const search = codeMatch ? "" : cleanSearch(q)

  const filters = (
    <StockFilters
      locations={user.locations}
      current={{ location, kind, q, view }}
    />
  )

  if (view === "item") {
    let query = supabase
      .from("stock_by_item")
      .select(
        "location_id, location_code, item_id, sku, item_name, kind, unit, category_name, qty, batch_count, earliest_best_before, days_to_earliest_expiry",
      )
      .order("item_name")
      .order("location_code")
      .limit(500)
    if (location) query = query.eq("location_id", location)
    if (kind) query = query.eq("kind", kind)
    if (codeMatch) query = query.eq("item_id", codeMatch.item_id)
    if (search) query = query.or(`item_name.ilike.%${search}%,sku.ilike.%${search}%`)

    const { data, error } = await query
    const rows = data ?? []

    return (
      <div className="flex flex-col gap-4">
        {filters}
        {error ? (
          <ErrorNote message={error.message} />
        ) : rows.length === 0 ? (
          <EmptyState q={q} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Batches</TableHead>
                <TableHead>Earliest best-before</TableHead>
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.location_id}-${row.item_id}`}>
                  <TableCell>
                    <ItemCell
                      name={row.item_name}
                      sku={row.sku}
                      category={row.category_name}
                      href={`/stock/history?item=${row.item_id}&location=${row.location_id}`}
                    />
                  </TableCell>
                  <TableCell>{row.location_code}</TableCell>
                  <TableCell className="tabular-nums">{row.batch_count}</TableCell>
                  <TableCell>
                    <ExpiryBadge
                      bestBefore={row.earliest_best_before}
                      daysToExpiry={row.days_to_earliest_expiry}
                    />
                  </TableCell>
                  <QtyCell qty={Number(row.qty)} unit={row.unit} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    )
  }

  let query = supabase
    .from("stock_on_hand")
    .select(
      "id, location_id, location_code, item_id, sku, item_name, kind, unit, category_name, batch_id, batch_code, produced_on, best_before, days_to_expiry, qty",
    )
    .order("item_name")
    .order("location_code")
    .order("best_before", { nullsFirst: false })
    .limit(500)
  if (location) query = query.eq("location_id", location)
  if (kind) query = query.eq("kind", kind)
  if (codeMatch) {
    query = codeMatch.batch_id
      ? query.eq("batch_id", codeMatch.batch_id)
      : query.eq("item_id", codeMatch.item_id)
  }
  if (search) query = query.or(`item_name.ilike.%${search}%,sku.ilike.%${search}%`)

  const { data, error } = await query
  const rows = data ?? []

  return (
    <div className="flex flex-col gap-4">
      {filters}
      {error ? (
        <ErrorNote message={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState q={q} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Best before</TableHead>
              <TableHead className="text-right">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <ItemCell
                      name={row.item_name}
                      sku={row.sku}
                      category={row.category_name}
                      href={`/stock/history?item=${row.item_id}&location=${row.location_id}`}
                    />
                </TableCell>
                <TableCell>{row.location_code}</TableCell>
                <TableCell className="font-mono text-xs">
                  {row.batch_code ?? <span className="text-muted-foreground">No batch</span>}
                </TableCell>
                <TableCell>
                  <ExpiryBadge bestBefore={row.best_before} daysToExpiry={row.days_to_expiry} />
                </TableCell>
                <QtyCell qty={Number(row.qty)} unit={row.unit} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows.length === 500 && (
        <p className="text-sm text-muted-foreground">
          Showing the first 500 lines. Filter by location or search to narrow it down.
        </p>
      )}
    </div>
  )
}

function ItemCell({
  name,
  sku,
  category,
  href,
}: {
  name: string | null
  sku: string | null
  category: string | null
  href: string
}) {
  return (
    <div>
      <Link href={href} className="font-medium hover:underline" title="See history">
        {name}
      </Link>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{sku}</span>
        {category && <Badge variant="outline">{category}</Badge>}
      </div>
    </div>
  )
}

function QtyCell({
  qty,
  unit,
}: {
  qty: number
  unit: "each" | "g" | "kg" | "ml" | "l" | null
}) {
  return (
    <TableCell
      className={`text-right font-medium tabular-nums ${qty < 0 ? "text-destructive" : ""}`}
    >
      {formatQty(qty, unit ?? "each")}
    </TableCell>
  )
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {q ? `Nothing in stock matches “${q}”.` : "No stock recorded for this selection yet."}
    </div>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
      Couldn&apos;t load stock: {message}
    </div>
  )
}
