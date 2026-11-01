import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft, TriangleAlert } from "lucide-react"
import { StockTakeStatusBadge } from "@/components/stock-take-status-badge"
import { TableSkeleton } from "@/components/table-skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format"
import { canManageLocation, canWorkLocation } from "@/lib/permissions"
import { STOCK_TAKE_SCOPE_LABELS } from "@/lib/store-ops"
import { createClient } from "@/lib/supabase/server"
import { CountActions } from "./count-actions"
import { CountSheet } from "./count-sheet"

export async function generateMetadata({ params }: PageProps<"/stock-takes/[id]">): Promise<Metadata> {
  const { id } = await params
  return { title: /^C-\d+$/i.test(id) ? `Count ${id.toUpperCase()}` : "Count" }
}

export default function StockTakePage({ params }: PageProps<"/stock-takes/[id]">) {
  return (
    <>
      <Link href="/stock-takes" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Stock takes
      </Link>
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <StockTakeContent params={params} />
      </Suspense>
    </>
  )
}

type Unit = "each" | "g" | "kg" | "ml" | "l"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function StockTakeContent({ params }: { params: PageProps<"/stock-takes/[id]">["params"] }) {
  const user = await requireUser()
  const { id } = await params
  const value = decodeURIComponent(id).trim()
  const isCode = /^C-\d{1,10}$/i.test(value)
  if (!isCode && !UUID.test(value)) notFound()

  const supabase = await createClient()
  let query = supabase
    .from("stock_takes")
    .select(
      `id, code, status, count_date, scope, blind, note, created_at, submitted_at, approved_at, cancelled_at, cancel_reason,
       locations(id, code, name, type, timezone),
       creator:profiles!stock_takes_created_by_fkey(full_name),
       approver:profiles!stock_takes_approved_by_fkey(full_name),
       submitter:profiles!stock_takes_submitted_by_fkey(full_name)`,
    )
  query = isCode ? query.eq("code", value.toUpperCase()) : query.eq("id", value)
  const { data: take } = await query.maybeSingle()
  if (!take || !take.locations) notFound()

  const location = take.locations
  const today = todayIn(location.timezone)
  const isManager = canManageLocation(user, location.id)
  const canWork = canWorkLocation(user, location.id)
  const counting = take.status === "counting"

  const [{ data: review }, { data: salesDay }, { data: items }] = await Promise.all([
    supabase.rpc("stock_take_review", { p_id: take.id }),
    supabase
      .from("sales_days")
      .select("status")
      .eq("location_id", location.id)
      .eq("business_date", take.count_date)
      .maybeSingle(),
    counting && canWork
      ? supabase.from("items").select("id, sku, name").eq("active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; sku: string; name: string }[] }),
  ])

  const rows = review ?? []
  const showExpected = !take.blind || isManager || take.status === "approved"
  const salesMissing = location.type === "store" && salesDay?.status !== "posted"
  const counted = rows.filter((r) => r.counted_qty !== null)
  const differences = counted.filter((r) => Number(r.variance) !== 0)
  const valueDiff = counted.reduce((sum, r) => sum + Number(r.variance ?? 0) * Number(r.unit_cost ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{take.code}</h1>
            <StockTakeStatusBadge status={take.status} />
            {take.blind && <Badge variant="outline">Blind</Badge>}
          </div>
          <p className="text-lg font-medium">
            {location.name}: closing stock of {relativeDay(take.count_date, today).toLowerCase()}
          </p>
          <p className="text-sm text-muted-foreground">
            {STOCK_TAKE_SCOPE_LABELS[take.scope]} · started by {take.creator?.full_name ?? "someone"},{" "}
            {formatDateTime(take.created_at)}
            {take.submitted_at && ` · handed in by ${take.submitter?.full_name}`}
            {take.approved_at && ` · approved by ${take.approver?.full_name}, ${formatDateTime(take.approved_at)}`}
          </p>
          {take.note && <p className="w-fit rounded-lg bg-muted px-3 py-2 text-sm">{take.note}</p>}
        </div>
        {(isManager || (counting && canWork)) && take.status !== "approved" && take.status !== "cancelled" && (
          <CountActions
            id={take.id}
            status={take.status}
            isManager={isManager}
            canWork={canWork}
            countedLines={counted.length}
            totalLines={rows.length}
            differences={differences.length}
            valueDiff={valueDiff}
            salesWarning={
              salesMissing
                ? `Sales for ${formatDate(take.count_date)} aren't posted yet. Post them first, or the differences will include that day's sales.`
                : null
            }
          />
        )}
      </div>

      {take.status === "cancelled" && (
        <Alert>
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>
            {take.cancel_reason ?? "No reason given."} Nothing in stock was changed.
          </AlertDescription>
        </Alert>
      )}

      {counting && salesMissing && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            Sales for {relativeDay(take.count_date, today).toLowerCase()} aren&apos;t posted yet. You can
            count now; just post the sales before the count is approved.{" "}
            <Link
              href={`/sales?location=${location.id}&date=${take.count_date}`}
              className="font-medium underline"
            >
              Enter sales
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {counting && canWork ? (
        <CountSheet
          stockTakeId={take.id}
          showExpected={showExpected}
          lines={rows.map((r) => ({
            lineId: r.line_id,
            itemId: r.item_id,
            itemName: r.item_name,
            sku: r.sku,
            unit: r.unit as Unit,
            category: r.category_name,
            trackBatches: r.track_batches,
            batchCode: r.batch_code,
            bestBefore: r.best_before,
            counted: r.counted_qty === null ? null : Number(r.counted_qty),
            countedBy: r.counted_by_name,
            expected: showExpected ? Number(r.expected_qty) : null,
            added: r.added_during_count,
          }))}
          items={items ?? []}
        />
      ) : (
        <ReviewTable
          rows={rows}
          showExpected={showExpected}
          approved={take.status === "approved"}
          valueDiff={valueDiff}
        />
      )}
    </div>
  )
}

type ReviewRow = {
  line_id: string
  item_name: string
  sku: string
  unit: string
  batch_code: string | null
  best_before: string | null
  counted_qty: number | null
  counted_by_name: string | null
  expected_qty: number | null
  variance: number | null
  unit_cost: number | null
  added_during_count: boolean
}

function ReviewTable({
  rows,
  showExpected,
  approved,
  valueDiff,
}: {
  rows: ReviewRow[]
  showExpected: boolean
  approved: boolean
  valueDiff: number
}) {
  const counted = rows.filter((r) => r.counted_qty !== null)
  const notCounted = rows.filter((r) => r.counted_qty === null)
  const short = counted.reduce((s, r) => s + Math.min(Number(r.variance ?? 0), 0), 0)
  const over = counted.reduce((s, r) => s + Math.max(Number(r.variance ?? 0), 0), 0)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{approved ? "Result" : "Differences"}</CardTitle>
          {showExpected && (
            <CardDescription>
              {approved
                ? "These differences were posted to stock."
                : "Expected = what the system has for the end of this day, including sales and deliveries entered so far."}{" "}
              Short {formatQty(-short)}, over {formatQty(over)}, net value {formatMoney(valueDiff)} at cost.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {counted.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing counted.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  {showExpected && <TableHead className="text-right">Expected</TableHead>}
                  <TableHead className="text-right">Counted</TableHead>
                  {showExpected && <TableHead className="text-right">Difference</TableHead>}
                  {showExpected && <TableHead className="hidden text-right sm:table-cell">Value</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {counted.map((r) => {
                  const v = Number(r.variance ?? 0)
                  const unit = r.unit as Unit
                  return (
                    <TableRow key={r.line_id}>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{r.item_name}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{r.batch_code ?? "No batch"}</span>
                          {r.best_before && ` · best before ${formatDate(r.best_before)}`}
                          {r.counted_by_name && ` · ${r.counted_by_name}`}
                          {r.added_during_count && " · found while counting"}
                        </div>
                      </TableCell>
                      {showExpected && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatQty(Number(r.expected_qty ?? 0), unit)}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatQty(Number(r.counted_qty), unit)}
                      </TableCell>
                      {showExpected && (
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${v < 0 ? "text-destructive" : v > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}
                        >
                          {v > 0 ? "+" : ""}
                          {formatQty(v, unit)}
                        </TableCell>
                      )}
                      {showExpected && (
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {v === 0 ? "—" : formatMoney(v * Number(r.unit_cost ?? 0))}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {notCounted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Not counted ({notCounted.length})</CardTitle>
            <CardDescription>These lines are left as they are.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {notCounted.map((r) => (
                <li key={r.line_id}>
                  {r.item_name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">{r.batch_code ?? ""}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
