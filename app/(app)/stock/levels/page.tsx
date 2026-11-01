import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { LocationDateFilter } from "@/components/location-date-filter"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { todayIn } from "@/lib/dates"
import { managedLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { LevelsEditor } from "./levels-editor"

export const metadata: Metadata = { title: "Reorder levels" }

export default function LevelsPage({ searchParams }: PageProps<"/stock/levels">) {
  return (
    <>
      <Link href="/stock" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Stock on hand
      </Link>
      <PageHeader
        title="Reorder levels"
        description="When stock falls to the reorder level, it shows as running low on the dashboard and on Deliveries. The par level is what to order back up to; stores also use it to fill up requests."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <LevelsContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function LevelsContent({ searchParams }: { searchParams: PageProps<"/stock/levels">["searchParams"] }) {
  const user = await requireUser()
  const locations = managedLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">Only managers can set reorder levels.</p>
  }
  const sp = await searchParams
  const location = locations.find((l) => l.id === param(sp.location)) ?? locations[0]

  const supabase = await createClient()
  const [{ data: items }, { data: settings }, { data: stock }] = await Promise.all([
    supabase.from("items").select("id, sku, name, kind, unit").eq("active", true).order("kind").order("name"),
    supabase
      .from("item_location_settings")
      .select("item_id, reorder_level, par_level")
      .eq("location_id", location.id),
    supabase.from("stock_by_item").select("item_id, qty").eq("location_id", location.id),
  ])

  const settingFor = new Map((settings ?? []).map((s) => [s.item_id, s]))
  const onHand = new Map((stock ?? []).map((s) => [s.item_id!, Number(s.qty)]))

  return (
    <div className="flex flex-col gap-4">
      <LocationDateFilter
        locations={locations}
        location={location.id}
        today={todayIn(location.timezone)}
        showDate={false}
      />
      <LevelsEditor
        key={location.id}
        locationId={location.id}
        defaultKind={location.type === "warehouse" ? "ingredient" : "product"}
        items={(items ?? []).map((i) => {
          const s = settingFor.get(i.id)
          return {
            id: i.id,
            sku: i.sku,
            name: i.name,
            kind: i.kind,
            unit: i.unit as Unit,
            onHand: onHand.get(i.id) ?? 0,
            reorderLevel: s?.reorder_level == null ? "" : String(Number(s.reorder_level)),
            parLevel: s?.par_level == null ? "" : String(Number(s.par_level)),
          }
        })}
      />
    </div>
  )
}
