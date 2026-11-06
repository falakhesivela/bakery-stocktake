import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { requireUser } from "@/lib/auth"
import { qrSvg } from "@/lib/barcode/svg"
import { formatDate, formatDateTime, formatQty } from "@/lib/format"
import { loadTransfer, loadTransferOrders, type TransferLocation } from "@/lib/transfer-data"
import { originLabel, STATUS_LABELS } from "@/lib/transfers"
import { PageStyle } from "@/components/page-style"
import { PrintToolbar } from "@/components/print-toolbar"

export const metadata: Metadata = { title: "Delivery note" }

export default function DeliveryNotePage({ params }: PageProps<"/transfers/[id]/note">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Preparing delivery note…</p>}>
      <DeliveryNote params={params} />
    </Suspense>
  )
}

async function DeliveryNote({ params }: { params: PageProps<"/transfers/[id]/note">["params"] }) {
  await requireUser()
  const { id } = await params
  const transfer = await loadTransfer(id)
  if (!transfer) notFound()
  const orders = await loadTransferOrders(transfer.id)

  // The QR code opens the receive screen for this transfer on any phone.
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const receiveUrl = `${proto}://${host}/transfers/${transfer.code}/receive`
  const qr = qrSvg(receiveUrl)

  const dispatched = transfer.status === "in_transit" || transfer.status === "received"
  const pickList = transfer.status === "approved" || transfer.status === "picking"
  const title = dispatched ? "Delivery note" : pickList ? "Pick list" : `Order (${STATUS_LABELS[transfer.status].toLowerCase()})`
  const lines = transfer.lines.filter((l) => l.qty > 0 || (l.dispatchedQty ?? 0) > 0)

  return (
    <>
      <PageStyle css="@page { size: A4; margin: 14mm }" />
      <PrintToolbar
        backHref={`/transfers/${transfer.code}`}
        backLabel={`Back to ${transfer.code}`}
      />
      <article className="mx-auto flex max-w-[180mm] flex-col gap-6 p-6 text-[10pt] print:p-0">
        <header className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[9pt] uppercase tracking-wide text-neutral-500">Bakery Stock</div>
            <h1 className="text-[20pt] font-bold leading-tight">{title}</h1>
            <div className="font-mono text-[16pt] font-semibold">{transfer.code}</div>
            <div className="mt-1 text-neutral-600">
              {originLabel(transfer.origin, transfer.from.type, transfer.to.type)}
              {transfer.neededOn && ` · needed ${formatDate(transfer.neededOn)}`}
              {transfer.dispatchedAt && ` · dispatched ${formatDateTime(transfer.dispatchedAt)}`}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className="size-[30mm] [&_svg]:size-full"
              // SVG is generated on the server by bwip-js from our own data.
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <div className="text-[7pt] text-neutral-500">Scan to receive</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4">
          <Address label="From" location={transfer.from} />
          <Address label="To" location={transfer.to} />
        </section>

        {orders.length > 0 && (
          <section className="rounded border-2 border-black p-3">
            <div className="font-semibold">Customer orders in this delivery: keep these boxes for collection</div>
            <ul className="mt-1 space-y-0.5">
              {orders.map((o) => (
                <li key={o.id}>
                  <span className="font-mono">{o.code}</span> {o.customerName}: {o.items} · collect{" "}
                  {formatDate(o.pickupDate)}
                  {o.pickupTime && ` ${o.pickupTime}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {transfer.note && (
          <p className="rounded border border-neutral-300 px-3 py-2">
            <span className="font-semibold">Note: </span>
            {transfer.note}
          </p>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1.5 pr-2">Item</th>
              <th className="py-1.5 pr-2">Batch</th>
              <th className="py-1.5 pr-2">Best before</th>
              <th className="py-1.5 pr-2 text-right">{dispatched ? "Sent" : "Qty"}</th>
              <th className="w-[22mm] py-1.5 text-center">{dispatched ? "Received" : "Picked"}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const batches = dispatched && line.batches.length > 0 ? line.batches : null
              const short = dispatched && (line.dispatchedQty ?? 0) < line.qty
              if (!batches) {
                return (
                  <tr key={line.id} className="border-b border-neutral-300 align-top">
                    <td className="py-1.5 pr-2">
                      <div className="font-medium">{line.name}</div>
                      <div className="font-mono text-[8pt] text-neutral-500">{line.sku}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-neutral-500">
                      {dispatched ? "Not sent" : line.trackBatches ? "" : "—"}
                    </td>
                    <td className="py-1.5 pr-2" />
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatQty(dispatched ? 0 : line.qty, line.unit)}
                      {short && (
                        <div className="text-[8pt] text-neutral-500">
                          of {formatQty(line.qty, line.unit)}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5">
                      <div className="mx-auto h-[6mm] w-[16mm] border border-neutral-400" />
                    </td>
                  </tr>
                )
              }
              return batches.map((b, index) => (
                <tr key={b.id} className="border-b border-neutral-300 align-top">
                  <td className="py-1.5 pr-2">
                    {index === 0 && (
                      <>
                        <div className="font-medium">{line.name}</div>
                        <div className="font-mono text-[8pt] text-neutral-500">{line.sku}</div>
                        {short && (
                          <div className="text-[8pt] text-neutral-600">
                            Short: {formatQty(line.dispatchedQty ?? 0, line.unit)} of{" "}
                            {formatQty(line.qty, line.unit)} approved
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-[9pt]">{b.batchCode ?? "—"}</td>
                  <td className="py-1.5 pr-2">{formatDate(b.bestBefore)}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                    {formatQty(b.dispatchedQty, line.unit)}
                  </td>
                  <td className="py-1.5">
                    <div className="mx-auto h-[6mm] w-[16mm] border border-neutral-400 text-center leading-[6mm]">
                      {b.receivedQty !== null ? formatQty(b.receivedQty, line.unit) : ""}
                    </div>
                  </td>
                </tr>
              ))
            })}
          </tbody>
        </table>

        <section className="mt-4 grid grid-cols-3 gap-6 text-[9pt]">
          {[pickList ? "Picked by" : "Dispatched by", "Driver", "Received by"].map((label) => (
            <div key={label} className="flex flex-col gap-5">
              <div className="font-semibold">{label}</div>
              <div className="border-b border-neutral-400 pb-0.5 text-neutral-500">Name</div>
              <div className="border-b border-neutral-400 pb-0.5 text-neutral-500">Signature</div>
              <div className="border-b border-neutral-400 pb-0.5 text-neutral-500">Date & time</div>
            </div>
          ))}
        </section>

        <footer className="text-[8pt] text-neutral-500">
          Check every line on arrival. Record anything missing or damaged in the app
          when you receive the delivery, so stock stays correct.
        </footer>
      </article>
    </>
  )
}

function Address({ label, location }: { label: string; location: TransferLocation }) {
  return (
    <div className="rounded border border-neutral-300 p-3">
      <div className="text-[8pt] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="font-semibold">
        {location.name} ({location.code})
      </div>
      {location.address && <div>{location.address}</div>}
      {location.phone && <div>{location.phone}</div>}
    </div>
  )
}
