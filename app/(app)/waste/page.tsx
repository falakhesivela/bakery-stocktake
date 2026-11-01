import type { Metadata } from "next"
import { Suspense } from "react"
import { LocationDateFilter } from "@/components/location-date-filter"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
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
import { addDays, relativeDay, todayIn } from "@/lib/dates"
import { formatMoney, formatQty, formatTime } from "@/lib/format"
import { canManageLocation, workLocations } from "@/lib/permissions"
import { defaultStoreLocation, WASTE_REASON_LABELS } from "@/lib/store-ops"
import { createClient } from "@/lib/supabase/server"
import { UndoWasteButton } from "./undo-waste-button"
import { WasteForm } from "./waste-form"

export const metadata: Metadata = { title: "Waste" }

export default function WastePage({ searchParams }: PageProps<"/waste">) {
  return (
    <>
      <PageHeader
        title="Waste"
        description="Record anything thrown away, eaten or given away: expired, damaged or unsold at the end of the day."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <WasteContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function WasteContent({ searchParams }: { searchParams: PageProps<"/waste">["searchParams"] }) {
  const user = await requireUser()
  const locations = workLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">You don&apos;t work at a location that holds stock.</p>
  }

  const sp = await searchParams
  const location = locations.find((l) => l.id === param(sp.location)) ?? defaultStoreLocation(locations)
  const today = todayIn(location.timezone)

  const supabase = await createClient()
  const [{ data: items }, { data: stock }, { data: recent }] = await Promise.all([
    supabase
      .from("items")
      .select("id, sku, name, kind, unit, track_batches, item_barcodes(barcode)")
      .eq("active", true)
      .order("kind")
      .order("name"),
    supabase
      .from("stock_on_hand")
      .select("item_id, item_name, unit, batch_id, batch_code, best_before, days_to_expiry, qty")
      .eq("location_id", location.id)
      .gt("qty", 0)
      .order("best_before", { ascending: true, nullsFirst: false }),
    supabase
      .from("waste_entries")
      .select(
        "id, qty, reason, note, photo_path, business_date, unit_cost, created_at, created_by, voided_at, void_reason, items(name, sku, unit), batches(code), creator:profiles!waste_entries_created_by_fkey(full_name)",
      )
      .eq("location_id", location.id)
      .gte("business_date", addDays(today, -6))
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  // Short-lived links for photos (the bucket is private).
  const paths = (recent ?? []).map((r) => r.photo_path).filter((p): p is string => Boolean(p))
  const signed = paths.length
    ? (await supabase.storage.from("photos").createSignedUrls(paths, 3600)).data ?? []
    : []
  const photoUrl = new Map(signed.map((s) => [s.path, s.signedUrl]))

  const nearExpiry = (stock ?? [])
    .filter((s) => s.batch_id && s.days_to_expiry !== null && s.days_to_expiry <= 0)
    .map((s) => ({
      itemId: s.item_id!,
      itemName: s.item_name ?? "",
      unit: (s.unit ?? "each") as Unit,
      batchId: s.batch_id!,
      batchCode: s.batch_code ?? "",
      bestBefore: s.best_before,
      daysToExpiry: s.days_to_expiry!,
      qty: Number(s.qty),
    }))

  const isManager = canManageLocation(user, location.id)
  const active = (recent ?? []).filter((r) => !r.voided_at)
  const todaysValue = active
    .filter((r) => r.business_date === today)
    .reduce((sum, r) => sum + Number(r.qty) * Number(r.unit_cost ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <LocationDateFilter locations={locations} location={location.id} today={today} showDate={false} />

      <WasteForm
        key={location.id}
        locationId={location.id}
        today={today}
        items={(items ?? []).map((i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          kind: i.kind,
          unit: i.unit as Unit,
          trackBatches: i.track_batches,
          barcodes: i.item_barcodes.map((b) => b.barcode),
        }))}
        batches={(stock ?? [])
          .filter((s) => s.batch_id)
          .map((s) => ({
            itemId: s.item_id!,
            batchId: s.batch_id!,
            batchCode: s.batch_code ?? "",
            bestBefore: s.best_before,
            daysToExpiry: s.days_to_expiry,
            qty: Number(s.qty),
          }))}
        nearExpiry={nearExpiry}
      />

      <Card>
        <CardHeader>
          <CardTitle>Waste in the last 7 days</CardTitle>
          <CardDescription>
            Today: {formatMoney(todaysValue)} at cost.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(recent ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No waste logged this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden sm:table-cell">Reason</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Cost</TableHead>
                  <TableHead className="hidden lg:table-cell">By</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recent ?? []).map((r) => {
                  const voided = Boolean(r.voided_at)
                  const url = r.photo_path ? photoUrl.get(r.photo_path) : null
                  return (
                    <TableRow key={r.id} className={voided ? "text-muted-foreground" : ""}>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-start gap-2">
                          {url && (
                            <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                              <img src={url} alt="Photo" className="size-10 rounded object-cover" />
                            </a>
                          )}
                          <div>
                            <div className={voided ? "line-through" : "font-medium"}>{r.items?.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {relativeDay(r.business_date, today)}, {formatTime(r.created_at, location.timezone)}
                              {r.batches?.code && (
                                <>
                                  {" · "}
                                  <span className="font-mono">{r.batches.code}</span>
                                </>
                              )}
                              <span className="sm:hidden"> · {WASTE_REASON_LABELS[r.reason]}</span>
                            </div>
                            {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                            {voided && <Badge variant="outline">Undone: {r.void_reason}</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{WASTE_REASON_LABELS[r.reason]}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(Number(r.qty), (r.items?.unit ?? "each") as Unit)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {formatMoney(r.unit_cost === null ? null : Number(r.qty) * Number(r.unit_cost))}
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{r.creator?.full_name}</TableCell>
                      <TableCell className="text-right">
                        {!voided && (isManager || r.created_by === user.id) && (
                          <UndoWasteButton
                            id={r.id}
                            label={`${formatQty(Number(r.qty), (r.items?.unit ?? "each") as Unit)} ${r.items?.name ?? ""}`}
                          />
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
