import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ClipboardPlus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StockTakeStatusBadge } from "@/components/stock-take-status-badge"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { formatDateTime } from "@/lib/format"
import { canManageLocation, workLocations } from "@/lib/permissions"
import { STOCK_TAKE_SCOPE_LABELS } from "@/lib/store-ops"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Stock takes" }

export default function StockTakesPage() {
  return (
    <>
      <PageHeader
        title="Stock takes"
        description="Count what's on the shelves. A manager checks the differences and approves them, which corrects the stock."
        actions={
          <Link href="/stock-takes/new" className={buttonVariants()}>
            <ClipboardPlus />
            New count
          </Link>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <StockTakesContent />
      </Suspense>
    </>
  )
}

async function StockTakesContent() {
  const user = await requireUser()
  const locations = workLocations(user)
  if (locations.length === 0 && !user.isAdmin) {
    return <p className="text-sm text-muted-foreground">You don&apos;t work at a location that holds stock.</p>
  }
  const today = todayIn(user.locations[0]?.timezone ?? "Africa/Johannesburg")

  const supabase = await createClient()
  const { data: takes } = await supabase
    .from("stock_takes")
    .select(
      "id, code, location_id, count_date, scope, blind, status, created_at, updated_at, locations(code, name), creator:profiles!stock_takes_created_by_fkey(full_name), stock_take_lines(counted_qty)",
    )
    .order("created_at", { ascending: false })
    .limit(100)

  const open = (takes ?? []).filter((t) => t.status === "counting" || t.status === "submitted")
  const done = (takes ?? []).filter((t) => t.status === "approved" || t.status === "cancelled")

  const table = (rows: typeof open, emptyText: string) =>
    rows.length === 0 ? (
      <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Count</TableHead>
            <TableHead className="hidden sm:table-cell">Location</TableHead>
            <TableHead>Day</TableHead>
            <TableHead className="hidden md:table-cell">Counted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const counted = t.stock_take_lines.filter((l) => l.counted_qty !== null).length
            const needsMe = t.status === "submitted" && canManageLocation(user, t.location_id)
            return (
              <TableRow key={t.id}>
                <TableCell className="whitespace-normal">
                  <Link href={`/stock-takes/${t.code}`} className="font-mono font-medium hover:underline">
                    {t.code}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {STOCK_TAKE_SCOPE_LABELS[t.scope]}
                    {t.blind && " · blind"}
                    <span className="sm:hidden"> · {t.locations?.code}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="font-medium">{t.locations?.code}</div>
                  <div className="text-xs text-muted-foreground">{t.locations?.name}</div>
                </TableCell>
                <TableCell>{relativeDay(t.count_date, today)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="tabular-nums">
                    {counted} of {t.stock_take_lines.length} lines
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.creator?.full_name} · {formatDateTime(t.updated_at)}
                  </div>
                </TableCell>
                <TableCell>
                  <StockTakeStatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/stock-takes/${t.code}`}
                    className={buttonVariants({
                      size: "sm",
                      variant: needsMe || t.status === "counting" ? "default" : "ghost",
                    })}
                  >
                    {needsMe ? "Review" : t.status === "counting" ? "Count" : "Open"}
                  </Link>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            In progress
            {open.length > 0 && <Badge variant="secondary">{open.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>{table(open, "No counts in progress.")}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Finished</CardTitle>
        </CardHeader>
        <CardContent>{table(done, "No finished counts yet.")}</CardContent>
      </Card>
    </div>
  )
}
