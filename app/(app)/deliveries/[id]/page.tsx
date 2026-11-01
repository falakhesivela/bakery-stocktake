import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft, Printer } from "lucide-react"
import { TableSkeleton } from "@/components/table-skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireUser } from "@/lib/auth"
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format"
import { canManageLocation, canPrintLabels } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { CancelDeliveryButton } from "./cancel-delivery-button"

export async function generateMetadata({ params }: PageProps<"/deliveries/[id]">): Promise<Metadata> {
  const { id } = await params
  return { title: /^R-\d+$/i.test(id) ? `Delivery ${id.toUpperCase()}` : "Delivery" }
}

export default function DeliveryPage({ params }: PageProps<"/deliveries/[id]">) {
  return (
    <>
      <Link href="/deliveries" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Deliveries
      </Link>
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <DeliveryContent params={params} />
      </Suspense>
    </>
  )
}

type Unit = "each" | "g" | "kg" | "ml" | "l"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function DeliveryContent({ params }: { params: PageProps<"/deliveries/[id]">["params"] }) {
  const user = await requireUser()
  const { id } = await params
  const value = decodeURIComponent(id).trim()
  const isCode = /^R-\d{1,10}$/i.test(value)
  if (!isCode && !UUID.test(value)) notFound()

  const supabase = await createClient()
  let query = supabase
    .from("goods_receipts")
    .select(
      `id, code, location_id, received_on, reference, note, created_at, voided_at, void_reason,
       locations(code, name), suppliers(name, phone, email),
       creator:profiles!goods_receipts_created_by_fkey(full_name),
       goods_receipt_lines(id, qty, unit_cost, best_before, supplier_batch, batch_id, items(name, sku, unit), batches(code))`,
    )
  query = isCode ? query.eq("code", value.toUpperCase()) : query.eq("id", value)
  const { data: receipt } = await query.maybeSingle()
  if (!receipt) notFound()

  const lines = [...receipt.goods_receipt_lines].sort((a, b) =>
    (a.items?.name ?? "").localeCompare(b.items?.name ?? ""),
  )
  const total = lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.unit_cost ?? 0), 0)
  const voided = Boolean(receipt.voided_at)
  const printable = canPrintLabels(user) && !voided

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{receipt.code}</h1>
            {voided && <Badge variant="destructive">Cancelled</Badge>}
          </div>
          <p className="text-lg font-medium">
            {receipt.suppliers?.name ?? "No supplier"} → {receipt.locations?.name}
          </p>
          <p className="text-sm text-muted-foreground">
            Received {formatDate(receipt.received_on)}
            {receipt.reference && ` · ${receipt.reference}`} · entered by {receipt.creator?.full_name},{" "}
            {formatDateTime(receipt.created_at)}
          </p>
          {receipt.note && <p className="w-fit rounded-lg bg-muted px-3 py-2 text-sm">{receipt.note}</p>}
        </div>
        {!voided && canManageLocation(user, receipt.location_id) && (
          <CancelDeliveryButton id={receipt.id} code={receipt.code} />
        )}
      </div>

      {voided && (
        <Alert variant="destructive">
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>
            {receipt.void_reason} The stock from this delivery was taken back out.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Cost</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const unit = (l.items?.unit ?? "each") as Unit
                return (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{l.items?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{l.batches?.code ?? l.items?.sku}</span>
                        {l.best_before && ` · best before ${formatDate(l.best_before)}`}
                        {l.supplier_batch && ` · lot ${l.supplier_batch}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(Number(l.qty), unit)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {formatMoney(l.unit_cost === null ? null : Number(l.unit_cost))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(l.unit_cost === null ? null : Number(l.qty) * Number(l.unit_cost))}
                    </TableCell>
                    <TableCell className="text-right">
                      {printable && l.batch_id && (
                        <Link
                          href={`/labels/print?type=batch&id=${l.batch_id}&copies=1&back=/deliveries/${receipt.code}`}
                          className={buttonVariants({ size: "sm", variant: "outline" })}
                          aria-label={`Print label for ${l.batches?.code}`}
                        >
                          <Printer />
                          <span className="hidden sm:inline">Label</span>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="mt-3 text-right text-sm">
            Total <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
