import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
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
import { todayIn } from "@/lib/dates"
import { formatDate, formatDateTime, formatQty } from "@/lib/format"
import { MOVEMENT_LABELS, type MovementType } from "@/lib/movements"
import { createClient } from "@/lib/supabase/server"
import { HistoryFilters } from "./history-filters"

export const metadata: Metadata = { title: "Stock history" }

export default function StockHistoryPage({ searchParams }: PageProps<"/stock/history">) {
  return (
    <>
      <Link href="/stock" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Stock on hand
      </Link>
      <PageHeader
        title="Stock history"
        description="Every change to stock, newest first: bakes, deliveries sent and received, differences and opening stock."
      />
      <Suspense fallback={<TableSkeleton />}>
        <HistoryContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function HistoryContent({
  searchParams,
}: {
  searchParams: PageProps<"/stock/history">["searchParams"]
}) {
  const user = await requireUser()
  const sp = await searchParams
  const locationIds = new Set(user.locations.map((l) => l.id))
  const location = locationIds.has(param(sp.location)) ? param(sp.location) : ""
  const type = Object.hasOwn(MOVEMENT_LABELS, param(sp.type)) ? (param(sp.type) as MovementType) : ""
  const itemParam = UUID.test(param(sp.item)) ? param(sp.item) : ""
  const q = param(sp.q)

  const supabase = await createClient()

  let match: { item_id: string; batch_id: string | null } | null = itemParam
    ? { item_id: itemParam, batch_id: null }
    : null
  if (!match && q) {
    const { data } = await supabase.rpc("find_by_code", { p_code: q })
    match = data?.[0] ?? null
  }
  const search = match ? "" : q.replace(/[,()%*\\]/g, " ").trim()

  let query = supabase
    .from("stock_movements")
    .select(
      "id, qty, type, note, reference_type, reference_id, created_at, business_date, location_id, items!inner(id, name, sku, unit), locations(code, timezone), batches(code), profiles(full_name)",
    )
    .order("id", { ascending: false })
    .limit(200)
  if (location) query = query.eq("location_id", location)
  if (type) query = query.eq("type", type)
  if (match?.batch_id) query = query.eq("batch_id", match.batch_id)
  else if (match) query = query.eq("item_id", match.item_id)
  if (search) query = query.ilike("items.name", `%${search}%`)

  const { data: rows, error } = await query

  const idsOf = (type: string) => [
    ...new Set(
      (rows ?? [])
        .filter((r) => r.reference_type === type && r.reference_id)
        .map((r) => r.reference_id!),
    ),
  ]
  const transferIds = idsOf("transfer")
  const countIds = idsOf("stock_take")
  const receiptIds = idsOf("goods_receipt")
  const [{ data: transfers }, { data: counts }, { data: receipts }] = await Promise.all([
    transferIds.length
      ? supabase.from("transfers").select("id, code").in("id", transferIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
    countIds.length
      ? supabase.from("stock_takes").select("id, code").in("id", countIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
    receiptIds.length
      ? supabase.from("goods_receipts").select("id, code").in("id", receiptIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
  ])
  const codeById = new Map(
    [...(transfers ?? []), ...(counts ?? []), ...(receipts ?? [])].map((t) => [t.id, t.code]),
  )

  /** Where a movement came from, as a link (or null). */
  function source(row: NonNullable<typeof rows>[number]) {
    const ref = row.reference_id ?? ""
    switch (row.reference_type) {
      case "transfer":
      case "stock_take":
      case "goods_receipt": {
        const code = codeById.get(ref)
        if (!code) return null
        const base =
          row.reference_type === "transfer"
            ? "/transfers"
            : row.reference_type === "stock_take"
              ? "/stock-takes"
              : "/deliveries"
        return { href: `${base}/${code}`, label: code }
      }
      case "customer_order":
        return row.note ? { href: `/orders/${row.note}`, label: row.note } : null
      case "sales_day":
        return { href: `/sales?location=${row.location_id}&date=${row.business_date}`, label: "Sales" }
      case "waste_entry":
        return { href: `/waste?location=${row.location_id}`, label: "Waste log" }
      case "production_run":
        return { href: `/production?location=${row.location_id}&day=${row.business_date}`, label: "Bake log" }
      default:
        return null
    }
  }

  const itemName = match && rows?.[0]?.items?.id === match.item_id ? rows[0].items.name : null

  return (
    <div className="flex flex-col gap-4">
      <HistoryFilters
        locations={user.locations}
        current={{ location, type, q: itemParam ? "" : q }}
        itemFilter={itemParam ? (itemName ?? "Selected item") : null}
      />
      {error ? (
        <p className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          Couldn&apos;t load history: {error.message}
        </p>
      ) : (rows ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No stock changes match.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell">When</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead>What</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="hidden lg:table-cell">By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((row) => {
              const qty = Number(row.qty)
              const link = source(row)
              const enteredOn = row.locations?.timezone
                ? todayIn(row.locations.timezone, new Date(row.created_at))
                : row.business_date
              const backdated = row.business_date !== enteredOn
              return (
                <TableRow key={row.id}>
                  <TableCell className="hidden whitespace-nowrap text-sm sm:table-cell">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{row.items?.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {row.batches?.code ?? row.items?.sku}
                    </div>
                    <div className="text-xs text-muted-foreground md:hidden">
                      <span className="sm:hidden">{formatDateTime(row.created_at)} · </span>
                      {row.locations?.code}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{row.locations?.code}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div>
                      {MOVEMENT_LABELS[row.type]}
                      {backdated && (
                        <span className="text-xs text-muted-foreground"> for {formatDate(row.business_date)}</span>
                      )}
                    </div>
                    {link && (
                      <Link href={link.href} className="font-mono text-xs hover:underline">
                        {link.label}
                      </Link>
                    )}
                    {row.note && <div className="text-xs text-muted-foreground">{row.note}</div>}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${qty < 0 ? "text-destructive" : "text-green-700 dark:text-green-400"}`}
                  >
                    {qty > 0 ? "+" : ""}
                    {formatQty(qty, row.items?.unit ?? "each")}
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {row.profiles?.full_name ?? "System"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      {(rows ?? []).length === 200 && (
        <p className="text-sm text-muted-foreground">
          Showing the latest 200 changes. Filter to see older ones.
        </p>
      )}
    </div>
  )
}
