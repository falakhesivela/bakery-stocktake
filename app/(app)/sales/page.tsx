import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { LocationDateFilter } from "@/components/location-date-filter"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireUser } from "@/lib/auth"
import { isIsoDate, relativeDay, todayIn } from "@/lib/dates"
import { formatDateTime, formatMoney, formatQty } from "@/lib/format"
import { canManageLocation, workLocations } from "@/lib/permissions"
import { defaultStoreLocation } from "@/lib/store-ops"
import { createClient } from "@/lib/supabase/server"
import { ReopenSalesButton } from "./reopen-sales-button"
import { SalesForm } from "./sales-form"

export const metadata: Metadata = { title: "Sales" }

export default function SalesPage({ searchParams }: PageProps<"/sales">) {
  return (
    <>
      <PageHeader
        title="End-of-day sales"
        description="Enter what each store sold today, from the till's end-of-day report. Posting takes the stock out, oldest in-date batches first."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <SalesContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function SalesContent({ searchParams }: { searchParams: PageProps<"/sales">["searchParams"] }) {
  const user = await requireUser()
  const locations = workLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">You don&apos;t work at a location that sells.</p>
  }

  const sp = await searchParams
  const location = locations.find((l) => l.id === param(sp.location)) ?? defaultStoreLocation(locations)
  const today = todayIn(location.timezone)
  const date = isIsoDate(param(sp.date)) && param(sp.date) <= today ? param(sp.date) : today

  const supabase = await createClient()
  const [{ data: products }, { data: stock }, { data: day }, { data: recent }] = await Promise.all([
    supabase
      .from("items")
      .select("id, sku, name, unit, price, item_barcodes(barcode)")
      .eq("active", true)
      .eq("kind", "product")
      .order("name"),
    supabase.from("stock_by_item").select("item_id, qty").eq("location_id", location.id),
    supabase
      .from("sales_days")
      .select(
        "id, status, note, posted_at, updated_at, poster:profiles!sales_days_posted_by_fkey(full_name), sales_lines(item_id, qty, unit_price, items(sku, name, unit))",
      )
      .eq("location_id", location.id)
      .eq("business_date", date)
      .maybeSingle(),
    supabase
      .from("sales_days")
      .select("id, business_date, status, sales_lines(qty, unit_price)")
      .eq("location_id", location.id)
      .order("business_date", { ascending: false })
      .limit(14),
  ])

  const onHand = new Map((stock ?? []).map((s) => [s.item_id!, Number(s.qty)]))
  const lines = day?.sales_lines ?? []
  const isManager = canManageLocation(user, location.id)

  // Items sold earlier that are no longer active products still show.
  const items = (products ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit as Unit,
    price: p.price === null ? null : Number(p.price),
    barcodes: p.item_barcodes.map((b) => b.barcode),
    onHand: onHand.get(p.id) ?? 0,
  }))
  for (const line of lines) {
    if (!items.some((i) => i.id === line.item_id) && line.items) {
      items.push({
        id: line.item_id,
        sku: line.items.sku,
        name: line.items.name,
        unit: line.items.unit as Unit,
        price: line.unit_price === null ? null : Number(line.unit_price),
        barcodes: [],
        onHand: onHand.get(line.item_id) ?? 0,
      })
    }
  }

  const posted = day?.status === "posted"
  const total = lines.reduce(
    (sum, l) => ({ units: sum.units + Number(l.qty), value: sum.value + Number(l.qty) * Number(l.unit_price ?? 0) }),
    { units: 0, value: 0 },
  )

  return (
    <div className="flex flex-col gap-6">
      <LocationDateFilter
        locations={locations}
        location={location.id}
        date={date}
        today={today}
        dateLabel="Sales for"
      />

      {posted ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Sales for {relativeDay(date, today).toLowerCase()} at {location.name}
              <Badge className="bg-green-500/15 text-green-700 dark:text-green-300">Posted</Badge>
            </CardTitle>
            <CardDescription>
              Posted {formatDateTime(day.posted_at)}
              {day.poster?.full_name && ` by ${day.poster.full_name}`}.{" "}
              {formatQty(total.units)} items, {formatMoney(total.value)} at list prices.
              {day.note && ` Note: ${day.note}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Posted with no sales (closed or nothing sold).</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...lines]
                    .sort((a, b) => (a.items?.name ?? "").localeCompare(b.items?.name ?? ""))
                    .map((l) => (
                      <TableRow key={l.item_id}>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium">{l.items?.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{l.items?.sku}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQty(Number(l.qty), (l.items?.unit ?? "each") as Unit)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                          {formatMoney(l.unit_price === null ? null : Number(l.unit_price))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(Number(l.qty) * Number(l.unit_price ?? 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(total.units)}</TableCell>
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="text-right tabular-nums">{formatMoney(total.value)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
            {isManager ? (
              <ReopenSalesButton id={day.id} date={relativeDay(date, today).toLowerCase()} />
            ) : (
              <p className="text-sm text-muted-foreground">
                To correct posted sales, ask a manager to reopen them.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <SalesForm
          key={`${location.id}|${date}|${day?.updated_at ?? "new"}`}
          locationId={location.id}
          locationName={location.name}
          date={date}
          dateLabel={relativeDay(date, today).toLowerCase()}
          items={items}
          initial={Object.fromEntries(lines.map((l) => [l.item_id, String(Number(l.qty))]))}
          initialNote={day?.note ?? ""}
          hasDraft={Boolean(day)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent days at {location.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {(recent ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales entered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recent ?? []).map((r) => {
                  const units = r.sales_lines.reduce((s, l) => s + Number(l.qty), 0)
                  const value = r.sales_lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price ?? 0), 0)
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          href={`/sales?location=${location.id}&date=${r.business_date}`}
                          className="font-medium hover:underline"
                        >
                          {relativeDay(r.business_date, today)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {r.status === "posted" ? (
                          <Badge className="bg-green-500/15 text-green-700 dark:text-green-300">Posted</Badge>
                        ) : (
                          <Badge variant="outline">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(units)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(value)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
