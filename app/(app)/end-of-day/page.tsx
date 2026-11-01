import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CircleCheck, CircleDashed, CircleDot, type LucideIcon } from "lucide-react"
import { LocationDateFilter } from "@/components/location-date-filter"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
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
import { isIsoDate, relativeDay, todayIn } from "@/lib/dates"
import { formatMoney, formatQty } from "@/lib/format"
import { workLocations } from "@/lib/permissions"
import { defaultStoreLocation } from "@/lib/store-ops"
import { createClient } from "@/lib/supabase/server"
import { ShowAllToggle } from "./show-all-toggle"

export const metadata: Metadata = { title: "End of day" }

export default function EndOfDayPage({ searchParams }: PageProps<"/end-of-day">) {
  return (
    <>
      <PageHeader
        title="End of day"
        description="Close the day at a store: post the sales, log the waste, count what's left. The summary shows where every item went."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <EndOfDayContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function EndOfDayContent({ searchParams }: { searchParams: PageProps<"/end-of-day">["searchParams"] }) {
  const user = await requireUser()
  const locations = workLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">You don&apos;t work at a location that holds stock.</p>
  }

  const sp = await searchParams
  const location = locations.find((l) => l.id === param(sp.location)) ?? defaultStoreLocation(locations)
  const today = todayIn(location.timezone)
  const date = isIsoDate(param(sp.date)) && param(sp.date) <= today ? param(sp.date) : today
  const showAll = param(sp.all) === "1"
  const isStore = location.type === "store"

  const supabase = await createClient()
  const [{ data: salesDay }, { count: wasteCount }, { data: counts }, { data: summary }] = await Promise.all([
    supabase
      .from("sales_days")
      .select("status, sales_lines(qty)")
      .eq("location_id", location.id)
      .eq("business_date", date)
      .maybeSingle(),
    supabase
      .from("waste_entries")
      .select("id", { count: "exact", head: true })
      .eq("location_id", location.id)
      .eq("business_date", date)
      .is("voided_at", null),
    supabase
      .from("stock_takes")
      .select("id, code, status, scope")
      .eq("location_id", location.id)
      .eq("count_date", date)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false }),
    supabase.rpc("daily_summary", { p_location_id: location.id, p_date: date }),
  ])

  const rows = (summary ?? []).filter((r) => showAll || r.kind === "product")
  const approvedCount = (counts ?? []).find((c) => c.status === "approved")
  const openCount = (counts ?? []).find((c) => c.status === "counting" || c.status === "submitted")
  const soldUnits = (salesDay?.sales_lines ?? []).reduce((s, l) => s + Number(l.qty), 0)
  const dayLabel = relativeDay(date, today).toLowerCase()
  const q = `location=${location.id}&date=${date}`

  const steps: {
    icon: LucideIcon
    tone: "done" | "doing" | "todo"
    title: string
    detail: string
    href: string
    action: string
  }[] = [
    ...(isStore
      ? [
          {
            icon: salesDay?.status === "posted" ? CircleCheck : salesDay ? CircleDot : CircleDashed,
            tone: (salesDay?.status === "posted" ? "done" : salesDay ? "doing" : "todo") as "done" | "doing" | "todo",
            title: "Sales",
            detail:
              salesDay?.status === "posted"
                ? `Posted: ${formatQty(soldUnits)} items sold`
                : salesDay
                  ? "Draft saved, not posted"
                  : "Not entered yet",
            href: `/sales?${q}`,
            action: salesDay?.status === "posted" ? "View" : "Enter sales",
          },
        ]
      : []),
    {
      icon: wasteCount ? CircleCheck : CircleDashed,
      tone: wasteCount ? "done" : "todo",
      title: "Waste",
      detail: wasteCount ? `${wasteCount} line${wasteCount === 1 ? "" : "s"} logged` : "Nothing logged (fine if nothing was thrown away)",
      href: `/waste?location=${location.id}`,
      action: "Log waste",
    },
    {
      icon: approvedCount ? CircleCheck : openCount ? CircleDot : CircleDashed,
      tone: approvedCount ? "done" : openCount ? "doing" : "todo",
      title: "Closing count",
      detail: approvedCount
        ? `${approvedCount.code} approved`
        : openCount
          ? `${openCount.code} ${openCount.status === "submitted" ? "waiting for approval" : "in progress"}`
          : "Not started",
      href: approvedCount
        ? `/stock-takes/${approvedCount.code}`
        : openCount
          ? `/stock-takes/${openCount.code}`
          : `/stock-takes/new?location=${location.id}`,
      action: approvedCount || openCount ? "Open" : "Start count",
    },
  ]

  const totals = rows.reduce(
    (t, r) => ({
      soldValue: t.soldValue + Number(r.sold) * Number(r.unit_price ?? 0),
      wasteValue: t.wasteValue + Number(r.wasted) * Number(r.unit_cost ?? 0),
      diffValue: t.diffValue + Number(r.count_difference) * Number(r.unit_cost ?? 0),
    }),
    { soldValue: 0, wasteValue: 0, diffValue: 0 },
  )

  return (
    <div className="flex flex-col gap-6">
      <LocationDateFilter locations={locations} location={location.id} date={date} today={today} />

      <div className={`grid gap-3 ${isStore ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {steps.map((step) => (
          <Card key={step.title} size="sm">
            <CardContent className="flex items-start gap-3">
              <step.icon
                className={`mt-0.5 size-5 shrink-0 ${step.tone === "done" ? "text-green-600" : step.tone === "doing" ? "text-amber-600" : "text-muted-foreground"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{step.title}</div>
                <div className="text-sm text-muted-foreground">{step.detail}</div>
              </div>
              <Link
                href={step.href}
                className={buttonVariants({ size: "sm", variant: step.tone === "done" ? "ghost" : "outline" })}
              >
                {step.action}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Where it went: {dayLabel}</CardTitle>
            <CardDescription>
              Start of day + baked and delivered − sent, used, sold and wasted = expected at closing.
              {approvedCount
                ? " The count shows what was really there."
                : " Approve a closing count to see the differences."}
            </CardDescription>
            <CardDescription>
              Sold {formatMoney(totals.soldValue)} at list prices · wasted {formatMoney(totals.wasteValue)} at
              cost{approvedCount && ` · count difference ${formatMoney(totals.diffValue)} at cost`}
            </CardDescription>
          </div>
          <ShowAllToggle showAll={showAll} />
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No stock or movements for this day.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Start</TableHead>
                  <TableHead className="hidden text-right md:table-cell">In</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Wasted</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Sent / used / other</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const unit = r.unit as Unit
                  const inQty = Number(r.produced) + Number(r.received)
                  const outOther = -Number(r.sent) + Number(r.other)
                  const diff = Number(r.count_difference)
                  return (
                    <TableRow key={r.item_id}>
                      <TableCell className="whitespace-normal">
                        <Link
                          href={`/stock/history?item=${r.item_id}&location=${location.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.item_name}
                        </Link>
                        <div className="text-xs text-muted-foreground md:hidden">
                          Start {formatQty(Number(r.opening), unit)}
                          {inQty !== 0 && ` · in ${formatQty(inQty, unit)}`}
                          <span className="sm:hidden">
                            {Number(r.wasted) !== 0 && ` · wasted ${formatQty(Number(r.wasted), unit)}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                        {formatQty(Number(r.opening), unit)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {inQty === 0 ? "—" : formatQty(inQty, unit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.sold) === 0 ? "—" : formatQty(Number(r.sold), unit)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {Number(r.wasted) === 0 ? "—" : formatQty(Number(r.wasted), unit)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {outOther === 0 ? "—" : formatQty(outOther, unit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatQty(Number(r.expected_closing), unit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.counted ? (
                          <>
                            <span className="font-medium">{formatQty(Number(r.closing), unit)}</span>
                            {diff !== 0 && (
                              <div
                                className={`text-xs font-semibold ${diff < 0 ? "text-destructive" : "text-green-700 dark:text-green-400"}`}
                              >
                                {diff > 0 ? "+" : ""}
                                {formatQty(diff, unit)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
