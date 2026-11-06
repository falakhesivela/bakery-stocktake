import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Printer } from "lucide-react"
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
import { addDays, isIsoDate, relativeDay, todayIn } from "@/lib/dates"
import { formatDate, formatQty, formatTime } from "@/lib/format"
import { canManageLocation, productionLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { CustomerOrdersCard } from "./customer-orders-card"
import { ProductionFilters } from "./production-filters"
import { ProductionWorkspace } from "./production-workspace"
import { UndoBakeButton } from "./undo-bake-button"

export const metadata: Metadata = { title: "Production" }

export default function ProductionPage({ searchParams }: PageProps<"/production">) {
  return (
    <>
      <PageHeader
        title="Production"
        description="Log what you bake. Each bake becomes a batch with its own best-before date and labels."
      />
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <ProductionContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

async function ProductionContent({
  searchParams,
}: {
  searchParams: PageProps<"/production">["searchParams"]
}) {
  const user = await requireUser()
  const locations = productionLocations(user)

  if (locations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No bakery locations</CardTitle>
          <CardDescription>
            You don&apos;t work at a location that bakes. An admin can turn on
            &ldquo;Bakes on site&rdquo; for a location under Settings → Locations.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const sp = await searchParams
  const location = locations.find((l) => l.id === param(sp.location)) ?? locations[0]
  const today = todayIn(location.timezone)
  const day = isIsoDate(param(sp.day)) && param(sp.day) <= today ? param(sp.day) : today
  const due = isIsoDate(param(sp.due)) ? param(sp.due) : addDays(today, 1)

  const supabase = await createClient()
  const [
    { data: items },
    { data: plan },
    { data: runs },
    { data: recipes },
    { data: ingredientStock },
    { data: needs },
  ] = await Promise.all([
    supabase
      .from("items")
      .select("id, sku, name, unit, track_batches, shelf_life_days, item_barcodes(barcode)")
      .eq("active", true)
      .eq("kind", "product")
      .order("name"),
    supabase.rpc("production_plan", { p_location_id: location.id, p_date: due }),
    supabase
      .from("production_runs")
      .select(
        "id, qty, produced_on, note, created_at, created_by, voided_at, void_reason, items(name, sku, unit), batches(id, code, best_before), creator:profiles!production_runs_created_by_fkey(full_name)",
      )
      .eq("location_id", location.id)
      .eq("produced_on", day)
      .order("created_at", { ascending: false }),
    supabase
      .from("recipes")
      .select("product_item_id, yield_qty, recipe_lines(qty, items(id, name, unit))"),
    supabase.from("stock_by_item").select("item_id, qty").eq("location_id", location.id),
    supabase.rpc("production_ingredient_needs", { p_location_id: location.id, p_date: due }),
  ])

  const stockByItem = new Map((ingredientStock ?? []).map((s) => [s.item_id!, Number(s.qty)]))

  const isManager = canManageLocation(user, location.id)
  const activeRuns = (runs ?? []).filter((r) => !r.voided_at)
  const totalsByItem = new Map<string, { name: string; unit: string; qty: number }>()
  for (const run of activeRuns) {
    const key = run.items?.sku ?? ""
    const current = totalsByItem.get(key) ?? {
      name: run.items?.name ?? "",
      unit: run.items?.unit ?? "each",
      qty: 0,
    }
    current.qty += Number(run.qty)
    totalsByItem.set(key, current)
  }

  return (
    <div className="flex flex-col gap-6">
      <ProductionFilters
        locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name }))}
        current={{ location: location.id, day, due }}
        today={today}
      />

      <ProductionWorkspace
        locationId={location.id}
        today={today}
        dueLabel={relativeDay(due, today)}
        items={(items ?? []).map((i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          unit: i.unit,
          trackBatches: i.track_batches,
          shelfLifeDays: i.shelf_life_days,
          barcodes: i.item_barcodes.map((b) => b.barcode),
        }))}
        recipes={Object.fromEntries(
          (recipes ?? []).map((r) => [
            r.product_item_id,
            {
              yieldQty: Number(r.yield_qty),
              lines: r.recipe_lines.map((l) => ({
                itemId: l.items?.id ?? "",
                name: l.items?.name ?? "",
                unit: (l.items?.unit ?? "each") as "each",
                qty: Number(l.qty),
                inStock: stockByItem.get(l.items?.id ?? "") ?? 0,
              })),
            },
          ]),
        )}
        ingredientNeeds={(needs ?? []).map((n) => ({
          itemId: n.item_id,
          name: n.item_name,
          unit: n.unit as "each",
          needed: Number(n.needed),
          inStock: Number(n.in_stock),
          short: Number(n.short),
        }))}
        plan={(plan ?? []).map((p) => ({
          itemId: p.item_id,
          sku: p.sku,
          name: p.item_name,
          unit: p.unit,
          needed: Number(p.needed),
          usableStock: Number(p.usable_stock),
          toMake: Number(p.to_make),
        }))}
      />

      <CustomerOrdersCard locationId={location.id} due={due} today={today} canWork />

      <Card>
        <CardHeader>
          <CardTitle>Bakes {day === today ? "today" : `on ${formatDate(day)}`}</CardTitle>
          <CardDescription>
            {activeRuns.length === 0
              ? "Nothing logged yet."
              : [...totalsByItem.values()]
                  .map((t) => `${formatQty(t.qty, t.unit as "each")} ${t.name}`)
                  .join(" · ")}
          </CardDescription>
        </CardHeader>
        {(runs ?? []).length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">Time</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell">Batch</TableHead>
                  <TableHead className="hidden md:table-cell">Best before</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden lg:table-cell">By</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs ?? []).map((run) => {
                  const voided = Boolean(run.voided_at)
                  const canUndo =
                    !voided && (isManager || run.created_by === user.id)
                  return (
                    <TableRow key={run.id} className={voided ? "text-muted-foreground" : ""}>
                      <TableCell className="hidden tabular-nums sm:table-cell">
                        {formatTime(run.created_at, location.timezone)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className={voided ? "line-through" : "font-medium"}>
                          {run.items?.name}
                        </div>
                        <div className="text-xs text-muted-foreground md:hidden">
                          <span className="sm:hidden">
                            {formatTime(run.created_at, location.timezone)} ·{" "}
                          </span>
                          <span className="font-mono">{run.batches?.code}</span>
                          {run.batches?.best_before && ` · best before ${formatDate(run.batches.best_before)}`}
                        </div>
                        {voided && (
                          <Badge variant="outline">Undone: {run.void_reason}</Badge>
                        )}
                        {!voided && run.note && (
                          <div className="text-xs text-muted-foreground">{run.note}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">
                        {run.batches?.code ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {formatDate(run.batches?.best_before)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(Number(run.qty), run.items?.unit ?? "each")}
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        {run.creator?.full_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {!voided && run.batches && (
                            <Link
                              href={`/labels/print?type=batch&id=${run.batches.id}&copies=${Math.min(200, Math.ceil(Number(run.qty)))}&back=/production`}
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                              aria-label={`Print labels for ${run.batches.code}`}
                            >
                              <Printer />
                              <span className="hidden sm:inline">Labels</span>
                            </Link>
                          )}
                          {canUndo && (
                            <UndoBakeButton
                              runId={run.id}
                              label={`${formatQty(Number(run.qty), run.items?.unit ?? "each")} ${run.items?.name ?? ""}${run.batches ? ` (batch ${run.batches.code}, logged ${formatTime(run.created_at, location.timezone)})` : ""}`}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
