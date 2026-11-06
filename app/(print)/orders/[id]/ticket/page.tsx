import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { CakeDetailsView } from "@/components/cake-details"
import { PageStyle } from "@/components/page-style"
import { PrintToolbar } from "@/components/print-toolbar"
import { requireUser } from "@/lib/auth"
import { barcodeSvg } from "@/lib/barcode/svg"
import { formatDate, formatMoney } from "@/lib/format"
import { loadOrder } from "@/lib/order-data"
import { orderMoney, orderSummary } from "@/lib/orders"

export const metadata: Metadata = { title: "Order ticket" }

export default function OrderTicketPage({ params, searchParams }: PageProps<"/orders/[id]/ticket">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Preparing…</p>}>
      <Ticket params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Ticket({
  params,
  searchParams,
}: {
  params: PageProps<"/orders/[id]/ticket">["params"]
  searchParams: PageProps<"/orders/[id]/ticket">["searchParams"]
}) {
  await requireUser()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const order = await loadOrder(id)
  if (!order) notFound()

  const size = sp.size === "label" ? "label" : "sheet"
  const barcode = barcodeSvg(order.code, { height: size === "label" ? 8 : 10 })
  const when = `${formatDate(order.pickupDate)}${order.pickupTime ? ` ${order.pickupTime}` : ""}`
  const toolbar = <PrintToolbar backHref={`/orders/${order.code}`} backLabel={`Back to ${order.code}`} />

  if (size === "label") {
    return (
      <>
        <PageStyle css="@page { size: 58mm 40mm; margin: 0 }" />
        {toolbar}
        <div className="flex justify-center p-4 print:block print:p-0">
          <div className="flex h-[40mm] w-[58mm] flex-col justify-between overflow-hidden bg-white p-[2.5mm] text-black outline outline-1 outline-neutral-300 print:outline-none">
            <div>
              <div className="truncate text-[11pt] leading-tight font-bold">{order.customer.name}</div>
              <div className="text-[8pt] leading-tight">
                {order.pickup.name} · {when}
              </div>
              <div className="line-clamp-2 text-[7pt] leading-tight">
                {orderSummary(order.lines.map((l) => ({ qty: l.qty, name: l.name })))}
              </div>
            </div>
            <div>
              <div
                className="[&_svg]:h-auto [&_svg]:max-h-[11mm] [&_svg]:w-full"
                // SVG generated on the server by bwip-js from our own data.
                dangerouslySetInnerHTML={{ __html: barcode }}
              />
              <div className="text-center font-mono text-[8pt]">{order.code}</div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const money = orderMoney(order.lines, order.deposit, order.paidOnCollection)
  return (
    <>
      <PageStyle css="@page { size: A5; margin: 10mm }" />
      {toolbar}
      <article className="mx-auto flex max-w-[128mm] flex-col gap-4 p-6 text-[10pt] print:p-0">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[8pt] uppercase tracking-wide text-neutral-500">Customer order</div>
            <h1 className="font-mono text-[18pt] font-bold">{order.code}</h1>
            <div className="text-[12pt] font-semibold">{order.customer.name}</div>
            <div>{order.customer.phone}</div>
          </div>
          <div className="w-[42mm] text-center">
            <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: barcode }} />
          </div>
        </header>

        <section className="rounded border border-neutral-400 p-3">
          <div className="text-[13pt] font-bold">
            Collect {when}
          </div>
          <div>
            at {order.pickup.name}
            {order.fulfil.id !== order.pickup.id && ` · made at ${order.fulfil.name}`}
          </div>
        </section>

        {order.lines.map((line) => (
          <section key={line.id} className="flex gap-3 border-b border-neutral-300 pb-3">
            {line.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img src={line.photoUrl} alt="Reference" className="size-[30mm] shrink-0 rounded object-cover" />
            )}
            <div className="flex-1 space-y-1">
              <div className="text-[12pt] font-semibold">
                {line.qty !== 1 && `${line.qty} × `}
                {line.name}
              </div>
              <CakeDetailsView details={line.details} />
            </div>
          </section>
        ))}

        {order.notes && <p className="rounded bg-neutral-100 p-2">{order.notes}</p>}

        <footer className="flex justify-between text-[9pt] text-neutral-600">
          <span>
            Total {formatMoney(money.total)} · deposit {formatMoney(order.deposit)}
          </span>
          <span className="font-semibold text-black">To pay {formatMoney(money.balance)}</span>
        </footer>
      </article>
    </>
  )
}
