import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { CakeDetailsView } from "@/components/cake-details"
import { OrderStatusBadge } from "@/components/order-status-badge"
import { TableSkeleton } from "@/components/table-skeleton"
import { TransferStatusBadge } from "@/components/transfer-status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth"
import { relativeDay, todayIn } from "@/lib/dates"
import { formatDateTime, formatMoney, formatQty } from "@/lib/format"
import { loadOrder } from "@/lib/order-data"
import { orderMoney, orderPermissions, orderProgress } from "@/lib/orders"
import { OrderActions } from "./order-actions"

export async function generateMetadata({ params }: PageProps<"/orders/[id]">): Promise<Metadata> {
  const { id } = await params
  return { title: /^O-\d+$/i.test(id) ? `Order ${id.toUpperCase()}` : "Order" }
}

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <>
      <Link href="/orders" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Customer orders
      </Link>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <OrderContent params={params} />
      </Suspense>
    </>
  )
}

async function OrderContent({ params }: { params: PageProps<"/orders/[id]">["params"] }) {
  const user = await requireUser()
  const { id } = await params
  const order = await loadOrder(id)
  if (!order) notFound()

  const perms = orderPermissions(user, {
    status: order.status,
    takenAtLocationId: order.takenAt.id,
    pickupLocationId: order.pickup.id,
    fulfilLocationId: order.fulfil.id,
  })
  const today = todayIn(order.pickup.timezone)
  const money = orderMoney(order.lines, order.deposit, order.paidOnCollection)
  const progress = orderProgress({
    status: order.status,
    fulfilLocationId: order.fulfil.id,
    pickupLocationId: order.pickup.id,
    fulfilName: order.fulfil.name,
    pickupName: order.pickup.name,
    transferCode: order.transfer?.code ?? null,
    transferStatus: order.transfer?.status ?? null,
  })
  const overdue =
    (order.status === "confirmed" || order.status === "ready") && order.pickupDate < today

  const timeline = [
    { label: "Taken", at: order.createdAt, by: order.createdBy },
    { label: "Confirmed", at: order.confirmedAt, by: null },
    { label: "Ready", at: order.readyAt, by: order.readyBy },
    { label: "Collected", at: order.collectedAt, by: order.collectedBy },
    { label: "Cancelled", at: order.cancelledAt, by: null },
  ].filter((e) => e.at)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.code}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-lg font-medium">{order.customer.name}</p>
          <p className="text-sm text-muted-foreground">
            {order.customer.phone && (
              <a href={`tel:${order.customer.phone}`} className="hover:underline">
                {order.customer.phone}
              </a>
            )}
            {order.customer.phone && order.customer.email && " · "}
            {order.customer.email}
          </p>
          <p className="font-medium">{progress}</p>
        </div>
        <OrderActions
          id={order.id}
          code={order.code}
          status={order.status}
          perms={perms}
          balance={money.balance}
          fromShelf={order.fulfil.id === order.pickup.id}
          pickupName={order.pickup.name}
        />
      </div>

      {overdue && (
        <Alert variant="destructive">
          <AlertTitle>Not collected</AlertTitle>
          <AlertDescription>
            This was due {relativeDay(order.pickupDate, today).toLowerCase()}. Call the customer, or
            cancel the order.
          </AlertDescription>
        </Alert>
      )}
      {order.status === "cancelled" && order.cancelReason && (
        <Alert>
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>{order.cancelReason}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>What they ordered</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {order.lines.map((line) => (
              <div key={line.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                {line.photoUrl && (
                  <a href={line.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img src={line.photoUrl} alt="Reference" className="size-20 rounded-md object-cover" />
                  </a>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {line.qty !== 1 && `${formatQty(line.qty, line.unit)} × `}
                      {line.name}
                    </span>
                    <span className="tabular-nums">{formatMoney(line.qty * line.unitPrice)}</span>
                  </div>
                  <CakeDetailsView details={line.details} />
                </div>
              </div>
            ))}
            {order.notes && <p className="pt-3 text-sm">{order.notes}</p>}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Pickup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-base font-medium">
                {relativeDay(order.pickupDate, today)}
                {order.pickupTime && ` at ${order.pickupTime}`}
              </p>
              <p>Collect from {order.pickup.name}</p>
              <p className="text-muted-foreground">
                {order.fulfil.id === order.pickup.id
                  ? "From the store's shelf"
                  : `Made at ${order.fulfil.name}`}
                {order.takenAt.id !== order.pickup.id && ` · taken at ${order.takenAt.name}`}
              </p>
              {order.transfer && (
                <p className="flex flex-wrap items-center gap-1.5 pt-1">
                  Delivery{" "}
                  <Link href={`/transfers/${order.transfer.code}`} className="font-mono hover:underline">
                    {order.transfer.code}
                  </Link>
                  <TransferStatusBadge status={order.transfer.status} />
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm tabular-nums">
              <div className="flex justify-between">
                <span>Total</span>
                <span className="font-medium">{formatMoney(money.total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Deposit</span>
                <span>{formatMoney(order.deposit)}</span>
              </div>
              {order.paidOnCollection !== null && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid on collection</span>
                  <span>{formatMoney(order.paidOnCollection)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>{order.status === "collected" ? "Unpaid" : "Still to pay"}</span>
                <span className={money.balance > 0 && order.status === "collected" ? "text-destructive" : ""}>
                  {formatMoney(money.balance)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {timeline.map((e) => (
                  <li key={e.label} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{e.label}</span>
                    <span className="text-muted-foreground">
                      {formatDateTime(e.at)}
                      {e.by && ` · ${e.by}`}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
