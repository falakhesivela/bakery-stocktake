import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CalendarSync, PackagePlus, Send } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { TransferStatusBadge } from "@/components/transfer-status-badge"
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
import { relativeDay, todayIn } from "@/lib/dates"
import { formatQty } from "@/lib/format"
import { managedLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import {
  DONE_STATUSES,
  nextAction,
  OPEN_STATUSES,
  originLabel,
  transferPermissions,
  type TransferStatus,
} from "@/lib/transfers"
import { FindTransferButton } from "./find-transfer-button"
import { TransferFilters, type TransferTab } from "./transfer-filters"

export const metadata: Metadata = { title: "Transfers" }

export default function TransfersPage({ searchParams }: PageProps<"/transfers">) {
  return (
    <>
      <PageHeader
        title="Transfers"
        description="Stock moving between the warehouse and stores: requests, deliveries and returns."
        actions={
          <Suspense>
            <TransferHeaderActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <TransfersContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function TransferHeaderActions() {
  const user = await requireUser()
  const managed = managedLocations(user)
  return (
    <>
      <FindTransferButton />
      {managed.length > 0 && (
        <>
          <Link href="/transfers/standing" className={buttonVariants({ variant: "outline" })}>
            <CalendarSync />
            Standing orders
          </Link>
          <Link href="/transfers/new?type=send" className={buttonVariants({ variant: "outline" })}>
            <Send />
            Send stock
          </Link>
          <Link href="/transfers/new?type=request" className={buttonVariants()}>
            <PackagePlus />
            Request stock
          </Link>
        </>
      )}
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

const TABS: TransferTab[] = ["needs", "open", "transit", "done"]

async function TransfersContent({
  searchParams,
}: {
  searchParams: PageProps<"/transfers">["searchParams"]
}) {
  const user = await requireUser()
  const sp = await searchParams
  const tab = (TABS as string[]).includes(param(sp.tab)) ? (param(sp.tab) as TransferTab) : "open"
  const locationIds = new Set(user.locations.map((l) => l.id))
  const location = locationIds.has(param(sp.location)) ? param(sp.location) : ""
  const today = todayIn(user.locations[0]?.timezone ?? "Africa/Johannesburg")

  const supabase = await createClient()
  const columns =
    "id, code, status, origin, needed_on, has_discrepancy, overdue, from_location_id, from_code, from_name, from_type, to_location_id, to_code, to_name, to_type, line_count, total_qty, updated_at"

  let openQuery = supabase
    .from("transfer_list")
    .select(columns)
    .in("status", OPEN_STATUSES)
    .order("needed_on", { ascending: true, nullsFirst: false })
    .order("code")
    .limit(300)
  let doneQuery = supabase
    .from("transfer_list")
    .select(columns)
    .in("status", DONE_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(100)
  if (location) {
    const filter = `from_location_id.eq.${location},to_location_id.eq.${location}`
    openQuery = openQuery.or(filter)
    doneQuery = doneQuery.or(filter)
  }

  const [{ data: open, error }, done] = await Promise.all([
    openQuery,
    tab === "done" ? doneQuery : Promise.resolve({ data: null }),
  ])

  const withPerms = (open ?? []).map((row) => {
    const perms = transferPermissions(user, {
      fromLocationId: row.from_location_id!,
      toLocationId: row.to_location_id!,
      origin: row.origin!,
      status: row.status!,
    })
    return { row, action: nextAction(perms, row.status!) }
  })

  const counts = {
    needs: withPerms.filter((r) => r.action).length,
    open: withPerms.length,
    transit: withPerms.filter((r) => r.row.status === "in_transit").length,
  }

  const rows =
    tab === "done"
      ? (done.data ?? []).map((row) => ({ row, action: null }))
      : tab === "needs"
        ? withPerms.filter((r) => r.action)
        : tab === "transit"
          ? withPerms.filter((r) => r.row.status === "in_transit")
          : withPerms

  return (
    <div className="flex flex-col gap-4">
      <TransferFilters
        tab={tab}
        location={location}
        locations={user.locations}
        counts={counts}
      />

      {error ? (
        <p className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          Couldn&apos;t load transfers: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {tab === "needs"
            ? "Nothing is waiting for you."
            : tab === "transit"
              ? "Nothing is on the way."
              : tab === "done"
                ? "No finished transfers yet."
                : "No open transfers."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transfer</TableHead>
              <TableHead>From → To</TableHead>
              <TableHead className="hidden sm:table-cell">Due</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Items</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ row, action }) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/transfers/${row.code}`} className="font-mono font-medium hover:underline">
                    {row.code}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {originLabel(row.origin!, row.from_type, row.to_type)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                    <TransferStatusBadge status={row.status as TransferStatus} />
                    {row.has_discrepancy && <Badge variant="destructive">Differences</Badge>}
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {relativeDay(row.needed_on, today)}
                    </span>
                    {row.overdue && (
                      <Badge variant="destructive" className="sm:hidden">
                        Overdue
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{row.from_code}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="font-medium">{row.to_code}</span>
                  <div className="hidden text-xs text-muted-foreground lg:block">
                    {row.from_name} to {row.to_name}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div>{relativeDay(row.needed_on, today)}</div>
                  {row.overdue && <Badge variant="destructive">Overdue</Badge>}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  <div>{formatQty(Number(row.total_qty ?? 0))}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.line_count} line{row.line_count === 1 ? "" : "s"}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    <TransferStatusBadge status={row.status as TransferStatus} />
                    {row.has_discrepancy && <Badge variant="destructive">Differences</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/transfers/${row.code}`}
                    className={buttonVariants({ size: "sm", variant: action ? "default" : "ghost" })}
                  >
                    {action ?? "Open"}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
