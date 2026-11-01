import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { canManageLocation, managedLocations } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { loadAllLocations, loadTransferItems } from "@/lib/transfer-data"
import { StandingOrdersEditor } from "./standing-orders-editor"

export const metadata: Metadata = { title: "Standing orders" }

export default function StandingOrdersPage({ searchParams }: PageProps<"/transfers/standing">) {
  return (
    <>
      <Link href="/transfers" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Transfers
      </Link>
      <PageHeader
        title="Standing orders"
        description="The usual quantities each store gets on each day of the week. Every hour the app creates tomorrow's order from these, as a request waiting for the warehouse to approve. Changes apply to orders that haven't been created yet."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <StandingOrdersContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

async function StandingOrdersContent({
  searchParams,
}: {
  searchParams: PageProps<"/transfers/standing">["searchParams"]
}) {
  const user = await requireUser()
  const managed = managedLocations(user)
  if (managed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Only managers can set standing orders.
      </p>
    )
  }

  const sp = await searchParams
  const [allLocations, items] = await Promise.all([loadAllLocations(), loadTransferItems()])
  const isActive = (id: string) => allLocations.some((l) => l.id === id)

  let fromId = isActive(param(sp.from)) ? param(sp.from) : ""
  let toId = isActive(param(sp.to)) ? param(sp.to) : ""
  if (!fromId || !toId || fromId === toId) {
    const store = managed.find((l) => l.type === "store")
    if (store) {
      toId = store.id
      fromId = allLocations.find((l) => l.type === "warehouse")?.id ?? ""
    } else {
      fromId = managed[0].id
      toId = allLocations.find((l) => l.type === "store" && l.id !== fromId)?.id ?? ""
    }
  }

  const canEdit =
    Boolean(fromId && toId) &&
    fromId !== toId &&
    (canManageLocation(user, fromId) || canManageLocation(user, toId))

  const supabase = await createClient()
  const [{ data: rows }, { data: routes }] = await Promise.all([
    supabase
      .from("standing_orders")
      .select("item_id, weekday, qty")
      .eq("from_location_id", fromId)
      .eq("to_location_id", toId),
    supabase.from("standing_orders").select("from_location_id, to_location_id, item_id"),
  ])

  // Routes that already have a standing order, for quick switching.
  const routeMap = new Map<string, { fromId: string; toId: string; items: Set<string> }>()
  for (const r of routes ?? []) {
    const key = `${r.from_location_id}|${r.to_location_id}`
    const route = routeMap.get(key) ?? { fromId: r.from_location_id, toId: r.to_location_id, items: new Set() }
    route.items.add(r.item_id)
    routeMap.set(key, route)
  }
  const codeOf = (id: string) => allLocations.find((l) => l.id === id)?.code ?? "?"

  return (
    <StandingOrdersEditor
      key={`${fromId}|${toId}`}
      fromId={fromId}
      toId={toId}
      locations={allLocations}
      canEdit={canEdit}
      canGenerate={managed.some((l) => l.type === "warehouse") || user.isAdmin}
      routes={[...routeMap.values()].map((r) => ({
        fromId: r.fromId,
        toId: r.toId,
        label: `${codeOf(r.fromId)} → ${codeOf(r.toId)}`,
        itemCount: r.items.size,
      }))}
      items={items}
      initial={(rows ?? []).map((r) => ({ itemId: r.item_id, weekday: r.weekday, qty: Number(r.qty) }))}
    />
  )
}
