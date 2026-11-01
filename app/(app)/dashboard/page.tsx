import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import {
  CircleCheck,
  CircleDashed,
  PackageMinus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { ExpiryBadge } from "@/components/expiry-badge"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TransferStatusBadge } from "@/components/transfer-status-badge"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { relativeDay, todayIn } from "@/lib/dates"
import { formatQty } from "@/lib/format"
import { canManageLocation, workLocations, type CurrentUser } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { nextAction, OPEN_STATUSES, transferPermissions } from "@/lib/transfers"

export const metadata: Metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs attention across your locations today."
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  )
}

async function DashboardContent() {
  const user = await requireUser()

  if (!user.isAdmin && user.locations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You haven&apos;t been added to a location yet</CardTitle>
          <CardDescription>
            Ask an admin to give you access to your store or warehouse.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const supabase = await createClient()
  const [expiringRes, negativeRes, lowRes, byItemRes] = await Promise.all([
    supabase
      .from("stock_on_hand")
      .select(
        "id, location_code, item_name, sku, unit, batch_code, best_before, days_to_expiry, qty",
      )
      .gt("qty", 0)
      .lte("days_to_expiry", 1)
      .order("days_to_expiry")
      .order("item_name")
      .limit(50),
    supabase
      .from("stock_by_item")
      .select("location_id, location_code, item_id, item_name, sku, unit, qty")
      .lt("qty", 0)
      .limit(50),
    supabase
      .from("low_stock")
      .select("location_id, location_code, item_id, item_name, sku, unit, qty, reorder_level, par_level")
      .order("location_code")
      .limit(50),
    supabase.from("stock_by_item").select("location_id, kind, qty"),
  ])

  const expiring = expiringRes.data ?? []
  const negative = negativeRes.data ?? []
  const low = lowRes.data ?? []
  const byItem = byItemRes.data ?? []

  const expiredCount = expiring.filter((r) => (r.days_to_expiry ?? 0) < 0).length
  const soonCount = expiring.length - expiredCount

  return (
    <div className="flex flex-col gap-6">
      {user.isAdmin && (
        <Suspense>
          <SetupChecklist />
        </Suspense>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Past best-before"
          value={expiredCount}
          hint="Batches to remove from sale"
          tone={expiredCount > 0 ? "bad" : "good"}
          icon={TriangleAlert}
        />
        <StatCard
          label="Expiring today or tomorrow"
          value={soonCount}
          hint="Sell first or discount"
          tone={soonCount > 0 ? "warn" : "good"}
          icon={TriangleAlert}
        />
        <StatCard
          label="Below reorder level"
          value={low.length}
          hint="Items to request or bake"
          tone={low.length > 0 ? "warn" : "good"}
          icon={PackageMinus}
        />
        <StatCard
          label="Negative stock"
          value={negative.length}
          hint="Usually a delivery not yet received"
          tone={negative.length > 0 ? "bad" : "good"}
          icon={PackageMinus}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <TransfersCard user={user} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-40" />}>
          <StoreDayCard user={user} />
        </Suspense>
      </div>

      <LocationCards user={user} byItem={byItem} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Use or remove soon</CardTitle>
            <CardDescription>
              Batches past or within a day of their best-before date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expiring.length === 0 ? (
              <EmptyNote>Nothing is close to expiry.</EmptyNote>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Best before</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiring.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.item_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.batch_code}
                        </div>
                      </TableCell>
                      <TableCell>{row.location_code}</TableCell>
                      <TableCell>
                        <ExpiryBadge
                          bestBefore={row.best_before}
                          daysToExpiry={row.days_to_expiry}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(Number(row.qty), row.unit ?? "each")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low stock</CardTitle>
            <CardDescription>
              At or below the reorder level set for the location.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {low.length === 0 ? (
              <EmptyNote>No items are below their reorder level.</EmptyNote>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reorder at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {low.map((row) => (
                    <TableRow key={`${row.location_id}-${row.item_id}`}>
                      <TableCell className="font-medium">{row.item_name}</TableCell>
                      <TableCell>{row.location_code}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(Number(row.qty), row.unit ?? "each")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatQty(Number(row.reorder_level), row.unit ?? "each")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {negative.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Negative stock</CardTitle>
            <CardDescription>
              More was recorded going out than coming in. Check for missing
              deliveries or count the item.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {negative.map((row) => (
                  <TableRow key={`${row.location_id}-${row.item_id}`}>
                    <TableCell className="font-medium">{row.item_name}</TableCell>
                    <TableCell>{row.location_code}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {formatQty(Number(row.qty), row.unit ?? "each")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

async function TransfersCard({ user }: { user: CurrentUser }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("transfer_list")
    .select(
      "id, code, status, origin, needed_on, overdue, from_location_id, from_code, to_location_id, to_code, total_qty",
    )
    .in("status", OPEN_STATUSES)
    .order("needed_on", { ascending: true, nullsFirst: false })
    .limit(300)

  const rows = (data ?? []).map((row) => ({
    row,
    action: nextAction(
      transferPermissions(user, {
        fromLocationId: row.from_location_id!,
        toLocationId: row.to_location_id!,
        origin: row.origin!,
        status: row.status!,
      }),
      row.status!,
    ),
  }))
  const needsMe = rows.filter((r) => r.action)
  const myLocations = new Set(user.locations.map((l) => l.id))
  const incoming = rows.filter(
    (r) => r.row.status === "in_transit" && myLocations.has(r.row.to_location_id!),
  ).length
  const overdue = rows.filter((r) => r.row.overdue).length
  const today = todayIn(user.locations[0]?.timezone ?? "Africa/Johannesburg")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfers</CardTitle>
        <CardDescription>
          {needsMe.length === 0
            ? "Nothing is waiting for you."
            : `${needsMe.length} waiting for you`}
          {incoming > 0 && ` · ${incoming} on the way to you`}
          {overdue > 0 && ` · ${overdue} overdue`}
        </CardDescription>
      </CardHeader>
      {needsMe.length > 0 && (
        <CardContent>
          <Table>
            <TableBody>
              {needsMe.slice(0, 6).map(({ row, action }) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/transfers/${row.code}`} className="font-mono font-medium hover:underline">
                      {row.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.from_code} → {row.to_code}
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {relativeDay(row.needed_on, today)}
                    {row.overdue && (
                      <Badge variant="destructive" className="ml-1">
                        Overdue
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <TransferStatusBadge status={row.status!} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/transfers/${row.code}`} className={buttonVariants({ size: "sm" })}>
                      {action}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {needsMe.length > 6 && (
            <Link href="/transfers?tab=needs" className="mt-2 inline-block text-sm hover:underline">
              See all {needsMe.length}
            </Link>
          )}
        </CardContent>
      )}
    </Card>
  )
}

async function StoreDayCard({ user }: { user: CurrentUser }) {
  const stores = workLocations(user).filter((l) => l.type === "store")
  if (stores.length === 0) return null

  const todayOf = new Map(stores.map((l) => [l.id, todayIn(l.timezone)]))
  const earliest = [...todayOf.values()].sort()[0]
  const ids = stores.map((l) => l.id)

  const supabase = await createClient()
  const [{ data: sales }, { data: waste }, { data: counts }] = await Promise.all([
    supabase
      .from("sales_days")
      .select("location_id, business_date, status")
      .in("location_id", ids)
      .gte("business_date", earliest),
    supabase
      .from("waste_entries")
      .select("location_id, business_date")
      .in("location_id", ids)
      .gte("business_date", earliest)
      .is("voided_at", null),
    supabase
      .from("stock_takes")
      .select("location_id, code, count_date, status")
      .in("location_id", ids)
      .in("status", ["counting", "submitted", "approved"])
      .gte("count_date", earliest),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today at your stores</CardTitle>
        <CardDescription>Sales, waste and the closing count for each store.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {stores.map((store) => {
              const today = todayOf.get(store.id)!
              const day = (sales ?? []).find((d) => d.location_id === store.id && d.business_date === today)
              const wasted = (waste ?? []).filter(
                (w) => w.location_id === store.id && w.business_date === today,
              ).length
              const count = (counts ?? []).find((c) => c.location_id === store.id && c.count_date === today)
              const needsApproval = count?.status === "submitted" && canManageLocation(user, store.id)
              return (
                <TableRow key={store.id}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{store.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Sales {day?.status === "posted" ? "posted" : day ? "draft" : "not entered"} · waste{" "}
                      {wasted} · count{" "}
                      {count
                        ? count.status === "approved"
                          ? "approved"
                          : count.status === "submitted"
                            ? "waiting for approval"
                            : "in progress"
                        : "not started"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={needsApproval ? `/stock-takes/${count!.code}` : `/end-of-day?location=${store.id}`}
                      className={buttonVariants({ size: "sm", variant: needsApproval ? "default" : "outline" })}
                    >
                      {needsApproval ? "Approve count" : "End of day"}
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function LocationCards({
  user,
  byItem,
}: {
  user: CurrentUser
  byItem: { location_id: string | null; kind: string | null; qty: number | null }[]
}) {
  if (user.locations.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {user.locations.map((location) => {
        const rows = byItem.filter(
          (r) => r.location_id === location.id && Number(r.qty) > 0,
        )
        const products = rows.filter((r) => r.kind === "product").length
        const other = rows.length - products

        return (
          <Link
            key={location.id}
            href={`/stock?location=${location.id}`}
            className="rounded-xl ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2 p-4">
              <div>
                <div className="font-medium">{location.name}</div>
                <div className="text-xs text-muted-foreground">
                  {location.code} · {location.type === "warehouse" ? "Warehouse" : "Store"}
                </div>
              </div>
              <Badge variant="secondary">{location.type}</Badge>
            </div>
            <div className="flex gap-6 px-4 pb-4 text-sm">
              <div>
                <div className="text-xl font-semibold tabular-nums">{products}</div>
                <div className="text-muted-foreground">products in stock</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular-nums">{other}</div>
                <div className="text-muted-foreground">ingredients & packaging</div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

async function SetupChecklist() {
  const supabase = await createClient()
  const [locations, items, staff, stock] = await Promise.all([
    supabase.from("locations").select("id", { count: "exact", head: true }),
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("user_locations").select("user_id", { count: "exact", head: true }),
    supabase.from("stock_levels").select("id", { count: "exact", head: true }),
  ])

  const steps = [
    { done: (locations.count ?? 0) > 0, label: "Add your stores and warehouses", href: "/settings/locations" },
    { done: (items.count ?? 0) > 0, label: "Add products and ingredients (or import a CSV)", href: "/catalogue" },
    { done: (staff.count ?? 0) > 0, label: "Create staff accounts and give them a location", href: "/settings/users" },
    { done: (stock.count ?? 0) > 0, label: "Enter opening stock for each location", href: "/stock/opening" },
  ]

  if (steps.every((s) => s.done)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>Finish these steps to start tracking stock.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {steps.map((step) => (
          <Link
            key={step.href}
            href={step.href}
            className="flex items-center gap-2 text-sm hover:underline"
          >
            {step.done ? (
              <CircleCheck className="size-4 text-green-600" />
            ) : (
              <CircleDashed className="size-4 text-muted-foreground" />
            )}
            <span className={step.done ? "text-muted-foreground line-through" : ""}>
              {step.label}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string
  value: number
  hint: string
  tone: "good" | "warn" | "bad"
  icon: LucideIcon
}) {
  const toneClass =
    tone === "bad"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground"

  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
        <Icon className={`size-5 ${toneClass}`} />
      </CardContent>
    </Card>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
