import Link from "next/link"
import { Printer } from "lucide-react"
import { CakeDetailsView } from "@/components/cake-details"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { relativeDay } from "@/lib/dates"
import type { CakeDetails } from "@/lib/orders"
import { createClient } from "@/lib/supabase/server"
import { MarkReadyButton } from "../orders/mark-ready-button"

/** Confirmed customer orders the bakery has to make, due by `due`. */
export async function CustomerOrdersCard({
  locationId,
  due,
  today,
  canWork,
}: {
  locationId: string
  due: string
  today: string
  canWork: boolean
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("customer_orders")
    .select(
      `id, code, pickup_date, pickup_time, notes, customers(name),
       pickup:locations!customer_orders_pickup_location_id_fkey(name),
       customer_order_lines(id, position, qty, details, photo_path, items(name))`,
    )
    .eq("fulfil_location_id", locationId)
    .eq("status", "confirmed")
    .lte("pickup_date", due)
    .order("pickup_date")
    .order("pickup_time", { nullsFirst: false })

  const orders = data ?? []
  const paths = orders.flatMap((o) => o.customer_order_lines.map((l) => l.photo_path)).filter((p): p is string => Boolean(p))
  const signed = paths.length ? ((await supabase.storage.from("photos").createSignedUrls(paths, 3600)).data ?? []) : []
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer orders to make</CardTitle>
        <CardDescription>
          Confirmed orders collected by {relativeDay(due, today).toLowerCase()}. They&apos;re included in the
          bake list above. Mark each one ready when it&apos;s boxed: it then goes on the delivery to its store.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No customer orders to make.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/orders/${o.code}`} className="font-medium hover:underline">
                      {o.customers?.name}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">{o.code}</span>
                    <span className={`text-sm ${o.pickup_date < today ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {relativeDay(o.pickup_date, today)}
                      {o.pickup_time && ` ${o.pickup_time.slice(0, 5)}`} at {o.pickup?.name}
                    </span>
                  </div>
                  {[...o.customer_order_lines]
                    .sort((a, b) => a.position - b.position)
                    .map((l) => {
                      const url = l.photo_path ? urlFor.get(l.photo_path) : null
                      return (
                        <div key={l.id} className="flex gap-2">
                          {url && (
                            <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                              <img src={url} alt="Reference" className="size-14 rounded object-cover" />
                            </a>
                          )}
                          <div className="text-sm">
                            <div className="font-medium">
                              {Number(l.qty) !== 1 && `${Number(l.qty)} × `}
                              {l.items?.name}
                            </div>
                            <CakeDetailsView details={l.details as CakeDetails | null} compact />
                          </div>
                        </div>
                      )
                    })}
                  {o.notes && <p className="text-xs text-muted-foreground">{o.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/orders/${o.code}/ticket?size=label`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                    aria-label={`Print box label for ${o.code}`}
                  >
                    <Printer />
                    <span className="hidden sm:inline">Label</span>
                  </Link>
                  {canWork && <MarkReadyButton id={o.id} code={o.code} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
