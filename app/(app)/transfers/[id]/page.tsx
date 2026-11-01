import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft, ArrowRight, TriangleAlert } from "lucide-react"
import { TableSkeleton } from "@/components/table-skeleton"
import { TransferStatusBadge } from "@/components/transfer-status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { formatDate, formatDateTime, formatQty } from "@/lib/format"
import { loadTransfer, type TransferDetail } from "@/lib/transfer-data"
import {
  EVENT_LABELS,
  originLabel,
  REASON_LABELS,
  transferPermissions,
} from "@/lib/transfers"
import { TransferActions } from "./transfer-actions"

export async function generateMetadata({
  params,
}: PageProps<"/transfers/[id]">): Promise<Metadata> {
  const { id } = await params
  return { title: /^T-\d+$/i.test(id) ? id.toUpperCase() : "Transfer" }
}

export default function TransferPage({ params }: PageProps<"/transfers/[id]">) {
  return (
    <>
      <Link href="/transfers" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        All transfers
      </Link>
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <TransferContent params={params} />
      </Suspense>
    </>
  )
}

async function TransferContent({ params }: { params: PageProps<"/transfers/[id]">["params"] }) {
  const user = await requireUser()
  const { id } = await params
  const transfer = await loadTransfer(id)
  if (!transfer) notFound()

  const perms = transferPermissions(user, {
    fromLocationId: transfer.from.id,
    toLocationId: transfer.to.id,
    origin: transfer.origin,
    status: transfer.status,
  })
  const today = todayIn(transfer.to.timezone)
  const dispatched = transfer.status === "in_transit" || transfer.status === "received"
  const received = transfer.status === "received"
  const showRequested = transfer.lines.some((l) => l.requestedQty !== null)
  const closingEvent = [...transfer.events]
    .reverse()
    .find((e) => e.action === "rejected" || e.action === "cancelled")
  const overdue =
    transfer.neededOn !== null &&
    transfer.neededOn < today &&
    ["requested", "approved", "picking", "in_transit"].includes(transfer.status)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{transfer.code}</h1>
            <TransferStatusBadge status={transfer.status} />
            {overdue && <Badge variant="destructive">Overdue</Badge>}
            {transfer.hasDiscrepancy && <Badge variant="destructive">Differences</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-lg">
            <span className="font-medium">{transfer.from.name}</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="font-medium">{transfer.to.name}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {originLabel(transfer.origin, transfer.from.type, transfer.to.type)}
            {" · "}Needed {relativeDay(transfer.neededOn, today).toLowerCase()}
            {transfer.createdBy && ` · Created by ${transfer.createdBy}`}
          </p>
          {transfer.note && (
            <p className="max-w-prose rounded-lg bg-muted px-3 py-2 text-sm">{transfer.note}</p>
          )}
        </div>
        <TransferActions
          id={transfer.id}
          code={transfer.code}
          status={transfer.status}
          origin={transfer.origin}
          perms={perms}
        />
      </div>

      {closingEvent && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            {closingEvent.action === "rejected" ? "Rejected" : "Cancelled"}
            {closingEvent.by && ` by ${closingEvent.by}`}
          </AlertTitle>
          {closingEvent.note && <AlertDescription>{closingEvent.note}</AlertDescription>}
        </Alert>
      )}

      {transfer.hasDiscrepancy && <DiscrepancySummary transfer={transfer} />}

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                {showRequested && <TableHead className="text-right">Asked for</TableHead>}
                <TableHead className="text-right">
                  {transfer.status === "draft" || transfer.status === "requested" ? "Quantity" : "Approved"}
                </TableHead>
                {dispatched && <TableHead className="text-right">Sent</TableHead>}
                {received && <TableHead className="text-right">Received</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.lines.map((line) => {
                const short = dispatched && (line.dispatchedQty ?? 0) < line.qty
                return (
                  <TableRow key={line.id} className="align-top">
                    <TableCell>
                      <div className="font-medium">{line.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{line.sku}</div>
                      {line.batches.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {line.batches.map((b) => (
                            <li key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono">{b.batchCode ?? "No batch"}</span>
                              {b.bestBefore && (
                                <span className="text-muted-foreground">
                                  best before {formatDate(b.bestBefore)}
                                </span>
                              )}
                              <span className="tabular-nums">× {formatQty(b.dispatchedQty, line.unit)}</span>
                              {b.reason && (
                                <Badge variant="destructive">
                                  {REASON_LABELS[b.reason]}: received {formatQty(b.receivedQty ?? 0, line.unit)}
                                  {b.reasonNote && ` (${b.reasonNote})`}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    {showRequested && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {line.requestedQty === null ? "—" : formatQty(line.requestedQty, line.unit)}
                      </TableCell>
                    )}
                    <TableCell
                      className={`text-right tabular-nums ${line.requestedQty !== null && line.qty !== line.requestedQty ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}
                    >
                      {formatQty(line.qty, line.unit)}
                    </TableCell>
                    {dispatched && (
                      <TableCell
                        className={`text-right tabular-nums ${short ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}
                      >
                        {formatQty(line.dispatchedQty ?? 0, line.unit)}
                      </TableCell>
                    )}
                    {received && (
                      <TableCell
                        className={`text-right tabular-nums ${line.receivedQty !== line.dispatchedQty ? "font-semibold text-destructive" : ""}`}
                      >
                        {line.receivedQty === null ? "—" : formatQty(line.receivedQty, line.unit)}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-3 border-l pl-5">
            {transfer.events.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border bg-background" />
                <div className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{EVENT_LABELS[event.action] ?? event.action}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                    {event.by ? ` · ${event.by}` : " · automatic"}
                  </span>
                </div>
                {event.note && <div className="text-muted-foreground">{event.note}</div>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

function DiscrepancySummary({ transfer }: { transfer: TransferDetail }) {
  const rows = transfer.lines.flatMap((line) =>
    line.batches
      .filter((b) => b.reason)
      .map((b) => ({
        key: b.id,
        text: `${line.name}${b.batchCode ? ` (${b.batchCode})` : ""}: sent ${formatQty(b.dispatchedQty, line.unit)}, received ${formatQty(b.receivedQty ?? 0, line.unit)} — ${REASON_LABELS[b.reason!]}${b.reasonNote ? `, ${b.reasonNote}` : ""}`,
      })),
  )
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Received with differences</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {rows.map((r) => (
            <li key={r.key}>{r.text}</li>
          ))}
        </ul>
        <p className="mt-1">
          The difference was written off at {transfer.to.code} so stock stays correct.
        </p>
      </AlertDescription>
    </Alert>
  )
}
