import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireUser } from "@/lib/auth"
import { addDays, isIsoDate, todayIn } from "@/lib/dates"
import { managedLocations } from "@/lib/permissions"
import { ReportFilters } from "./report-filters"
import { isReportType, type ReportType } from "./report-types"
import {
  CountReport,
  DeliveryReport,
  IngredientReport,
  OverviewReport,
  ProductionReport,
  SalesReport,
  SellThroughReport,
  StockValueReport,
  WasteReport,
  type Scope,
} from "./sections"

export const metadata: Metadata = { title: "Reports" }

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Sales, waste, counts and deliveries for the locations you manage. Every table downloads as CSV for Excel or Google Sheets."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <ReportsContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

const MAX_DAYS = 366

async function ReportsContent({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  const user = await requireUser()
  const locations = managedLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">Reports are for managers and admins.</p>
  }

  const sp = await searchParams
  const reportParam = param(sp.report)
  const report: ReportType = isReportType(reportParam) ? reportParam : "overview"
  const location = locations.find((l) => l.id === param(sp.location)) ?? null
  const today = todayIn((location ?? locations[0]).timezone)

  const toParam = param(sp.to)
  const to = isIsoDate(toParam) && toParam <= today ? toParam : today
  const fromParam = param(sp.from)
  let from = isIsoDate(fromParam) && fromParam <= to ? fromParam : addDays(to, -27)
  if (from < addDays(to, -MAX_DAYS)) from = addDays(to, -MAX_DAYS)

  const covered = location ? [location] : locations
  const place = covered.length === 1 ? covered[0].code : "all"
  const scope: Scope = {
    from,
    to,
    today,
    locationId: location?.id ?? null,
    ids: new Set(covered.map((l) => l.id)),
    codes: new Set(covered.map((l) => l.code)),
    multi: covered.length > 1,
    bakes: covered.some((l) => l.canProduce),
    place,
    fileSuffix: `${place}-${from}-to-${to}`,
  }

  return (
    <div className="flex flex-col gap-6">
      <ReportFilters
        report={report}
        locations={locations}
        location={location?.id ?? ""}
        from={from}
        to={to}
        today={today}
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Report report={report} scope={scope} />
      </Suspense>
    </div>
  )
}

function Report({ report, scope }: { report: ReportType; scope: Scope }) {
  switch (report) {
    case "overview":
      return <OverviewReport scope={scope} />
    case "sales":
      return <SalesReport scope={scope} />
    case "waste":
      return <WasteReport scope={scope} />
    case "sell-through":
      return <SellThroughReport scope={scope} />
    case "stock-value":
      return <StockValueReport scope={scope} />
    case "production":
      return <ProductionReport scope={scope} />
    case "ingredients":
      return <IngredientReport scope={scope} />
    case "counts":
      return <CountReport scope={scope} />
    case "deliveries":
      return <DeliveryReport scope={scope} />
  }
}
