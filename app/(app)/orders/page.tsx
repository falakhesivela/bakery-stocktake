import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { OrderStatusBadge } from "@/components/order-status-badge"
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
import { relativeDay, todayIn } from "@/lib/dates"
import { formatMoney } from "@/lib/format"
import { orderMoney, orderPermissions, orderProgress, orderSummary, type OrderStatus } from "@/lib/orders"
import { canWorkLocation, workLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { OrderTabs, type OrderTab } from "./order-tabs"

export const metadata: Metadata = { title: "Customer orders" }

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <>
      <PageHeader
        title="Customer orders"
        description="Custom cakes and pre-orders: what to make, what's on its way, and what customers collect today."
        actions={
          <Link href="/orders/new" className={buttonVariants()}>
            <Plus />
            New order
          </Link>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <OrdersContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

const TABS: OrderTab[] = ["collect", "make", "open", "done"]

async function OrdersContent({ searchParams }: { searchParams: PageProps<"/orders">["searchParams"] }) {
  const user = await requireUser()
  const sp = await searchParams
  const work = workLocations(user)
  const hasBakery = work.some((l) => l.canProduce)
  const hasStore = work.some((l) => l.type === "store")
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab
  const tab: OrderTab = (TABS as string[]).includes(tabParam ?? "")
    ? (tabParam as OrderTab)
    : hasBakery && !hasStore
      ? "make"
      : "collect"
  const today = todayIn(user.locations[0]?.timezone ?? "Africa/Johannesburg")

  const supabase = await createClient()
  const select = `id, code, status, pickup_date, pickup_time, deposit, paid_on_collection,
    taken_at_location_id, pickup_location_id, fulfil_location_id,
    customers(name, phone), pickup:locations!customer_orders_pickup_location_id_fkey(code, name),
    fulfil:locations!customer_orders_fulfil_location_id_fkey(name),
    transfers(code, status), customer_order_lines(qty, unit_price, items(name))`

  const query =
    tab === "done"
      ? supabase
          .from("customer_orders")
          .select(select)
          .in("status", ["collected", "cancelled"])
          .order("updated_at", { ascending: false })
          .limit(100)
      : supabase
          .from("customer_orders")
          .select(select)
          .in("status", ["new", "confirmed", "ready"])
          .order("pickup_date")
          .order("pickup_time", { nullsFirst: false })
          .limit(300)

  const { data, error } = await query
  const rows = (data ?? []).filter((o) => {
    if (tab === "collect") return canWorkLocation(user, o.pickup_location_id)
    if (tab === "make") return o.status !== "ready" && o.fulfil_location_id !== o.pickup_location_id && canWorkLocation(user, o.fulfil_location_id)
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <OrderTabs tab={tab} />
      {error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load orders: {error.message}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {tab === "collect"
            ? "No open orders to collect at your stores."
            : tab === "make"
              ? "Nothing to make for customers right now."
              : "No orders here."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Pickup</TableHead>
              <TableHead className="hidden md:table-cell">Items</TableHead>
              <TableHead className="hidden text-right sm:table-cell">To pay</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => {
              const lines = o.customer_order_lines.map((l) => ({
                qty: Number(l.qty),
                unitPrice: Number(l.unit_price),
                name: l.items?.name ?? "",
              }))
              const money = orderMoney(lines, Number(o.deposit), o.paid_on_collection === null ? null : Number(o.paid_on_collection))
              const overdue = (o.status === "confirmed" || o.status === "ready") && o.pickup_date < today
              const perms = orderPermissions(user, {
                status: o.status as OrderStatus,
                takenAtLocationId: o.taken_at_location_id,
                pickupLocationId: o.pickup_location_id,
                fulfilLocationId: o.fulfil_location_id,
              })
              const action = perms.collect && o.pickup_date <= today
                ? "Hand over"
                : perms.ready
                  ? "Mark ready"
                  : perms.confirm
                    ? "Confirm"
                    : null
              return (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-normal">
                    <Link href={`/orders/${o.code}`} className="font-medium hover:underline">
                      {o.customers?.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">{o.code}</span>
                      <OrderStatusBadge status={o.status as OrderStatus} />
                    </div>
                    <div className="text-xs text-muted-foreground md:hidden">{orderSummary(lines)}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div>
                      {relativeDay(o.pickup_date, today)}
                      {o.pickup_time && `, ${o.pickup_time.slice(0, 5)}`}
                      {overdue && (
                        <Badge variant="destructive" className="ml-1.5">
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.pickup?.code}
                      {" · "}
                      {orderProgress({
                        status: o.status as OrderStatus,
                        fulfilLocationId: o.fulfil_location_id,
                        pickupLocationId: o.pickup_location_id,
                        fulfilName: o.fulfil?.name ?? "",
                        pickupName: o.pickup?.name ?? "",
                        transferCode: o.transfers?.code ?? null,
                        transferStatus: o.transfers?.status ?? null,
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal text-sm md:table-cell">{orderSummary(lines)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {o.status === "cancelled" ? "—" : formatMoney(money.balance)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/orders/${o.code}`}
                      className={buttonVariants({ size: "sm", variant: action ? "default" : "ghost" })}
                    >
                      {action ?? "Open"}
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
