import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Gauge, PackageOpen } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireUser } from "@/lib/auth"
import { relativeDay, todayIn } from "@/lib/dates"
import { formatMoney, formatQty } from "@/lib/format"
import { managedLocations, workLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Deliveries" }

export default function DeliveriesPage() {
  return (
    <>
      <PageHeader
        title="Supplier deliveries"
        description="Record what suppliers deliver: flour, butter, boxes and so on. Items with best-before dates get their own batch."
        actions={
          <Suspense>
            <HeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <DeliveriesContent />
      </Suspense>
    </>
  )
}

async function HeaderActions() {
  const user = await requireUser()
  return (
    <>
      {managedLocations(user).length > 0 && (
        <Link href="/stock/levels" className={buttonVariants({ variant: "outline" })}>
          <Gauge />
          Reorder levels
        </Link>
      )}
      {workLocations(user).length > 0 && (
        <Link href="/deliveries/new" className={buttonVariants()}>
          <PackageOpen />
          Receive delivery
        </Link>
      )}
    </>
  )
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function DeliveriesContent() {
  const user = await requireUser()
  const today = todayIn(user.locations[0]?.timezone ?? "Africa/Johannesburg")

  const supabase = await createClient()
  const [{ data: low }, { data: receipts }] = await Promise.all([
    supabase
      .from("low_stock")
      .select("location_id, location_code, item_id, item_name, sku, unit, qty, reorder_level, par_level")
      .order("location_code")
      .order("item_name"),
    supabase
      .from("goods_receipts")
      .select(
        "id, code, received_on, reference, voided_at, locations(code), suppliers(name), creator:profiles!goods_receipts_created_by_fkey(full_name), goods_receipt_lines(qty, unit_cost)",
      )
      .order("received_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Running low</CardTitle>
          <CardDescription>
            At or below the reorder level. &ldquo;Order&rdquo; brings it back up to the par level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(low ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing is below its reorder level.{" "}
              <Link href="/stock/levels" className="underline">
                Set reorder levels
              </Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden sm:table-cell">Location</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Reorder at</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(low ?? []).map((r) => {
                  const unit = (r.unit ?? "each") as Unit
                  const qty = Number(r.qty)
                  const order = r.par_level !== null ? Math.max(Number(r.par_level) - qty, 0) : null
                  return (
                    <TableRow key={`${r.location_id}-${r.item_id}`}>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{r.item_name}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{r.sku}</span>
                          <span className="sm:hidden"> · {r.location_code}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{r.location_code}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${qty <= 0 ? "font-semibold text-destructive" : ""}`}
                      >
                        {formatQty(qty, unit)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                        {formatQty(Number(r.reorder_level), unit)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {order === null ? <span className="text-muted-foreground">—</span> : formatQty(order, unit)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          {(receipts ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No deliveries recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="hidden sm:table-cell">Received</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(receipts ?? []).map((r) => {
                  const value = r.goods_receipt_lines.reduce(
                    (sum, l) => sum + Number(l.qty) * Number(l.unit_cost ?? 0),
                    0,
                  )
                  return (
                    <TableRow key={r.id} className={r.voided_at ? "text-muted-foreground" : ""}>
                      <TableCell className="whitespace-normal">
                        <Link href={`/deliveries/${r.code}`} className="font-mono font-medium hover:underline">
                          {r.code}
                        </Link>
                        {r.voided_at && (
                          <Badge variant="outline" className="ml-1.5">
                            Cancelled
                          </Badge>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {r.locations?.code}
                          {r.reference && ` · ${r.reference}`}
                          <span className="sm:hidden"> · {relativeDay(r.received_on, today)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {r.suppliers?.name ?? <span className="text-muted-foreground">No supplier</span>}
                        <div className="text-xs text-muted-foreground">
                          {r.goods_receipt_lines.length} item{r.goods_receipt_lines.length === 1 ? "" : "s"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {relativeDay(r.received_on, today)}
                        <div className="text-xs text-muted-foreground">{r.creator?.full_name}</div>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${r.voided_at ? "line-through" : ""}`}>
                        {formatMoney(value)}
                      </TableCell>
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
