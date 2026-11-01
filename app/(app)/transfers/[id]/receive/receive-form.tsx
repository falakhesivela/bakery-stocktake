"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleCheck, Info } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formatDate, formatQty } from "@/lib/format"
import { REASON_LABELS, type DiscrepancyReason } from "@/lib/transfers"
import { receiveTransfer } from "../../actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Row = {
  id: number
  itemName: string
  sku: string
  unit: Unit
  batchCode: string | null
  bestBefore: string | null
  sentQty: number
}

type Entry = { qty: string; reason: DiscrepancyReason | ""; note: string }

export function ReceiveForm({
  transferId,
  code,
  rows,
  notSent,
}: {
  transferId: string
  code: string
  rows: Row[]
  notSent: { name: string; unit: Unit; approved: number; sent: number }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [entries, setEntries] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, { qty: String(r.sentQty), reason: "", note: "" }])),
  )
  const [checked, setChecked] = useState<Set<number>>(() => new Set())

  function update(id: number, patch: Partial<Entry>) {
    setEntries((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  const differences = rows.filter((r) => {
    const qty = Number(entries[r.id].qty)
    return entries[r.id].qty !== "" && qty !== r.sentQty
  })

  function onScan(scanned: string) {
    const c = scanned.trim().toUpperCase()
    const row =
      rows.find((r) => r.batchCode?.toUpperCase() === c) ??
      rows.find((r) => !r.batchCode && r.sku.toUpperCase() === c)
    if (!row) return void toast.error(`“${scanned}” isn't on this delivery.`)
    setChecked((current) => new Set(current).add(row.id))
    toast.success(`${row.itemName} ✓`)
  }

  function submit() {
    for (const row of rows) {
      const entry = entries[row.id]
      const qty = Number(entry.qty)
      if (entry.qty === "" || Number.isNaN(qty) || qty < 0) {
        return void toast.error(`Enter how many ${row.itemName} arrived (0 if none).`)
      }
      if (qty !== row.sentQty && !entry.reason) {
        return void toast.error(`Choose a reason for the difference on ${row.itemName}.`)
      }
    }
    startTransition(async () => {
      const result = await receiveTransfer({
        id: transferId,
        lines: rows.map((row) => {
          const entry = entries[row.id]
          const qty = Number(entry.qty)
          return {
            id: row.id,
            receivedQty: qty,
            reason: qty !== row.sentQty && entry.reason ? entry.reason : undefined,
            note: qty !== row.sentQty ? entry.note : undefined,
          }
        }),
      })
      if (!result.ok) return void toast.error(result.error)
      toast.success(
        differences.length > 0
          ? `${code} received. The differences were recorded.`
          : `${code} received. Stock added.`,
      )
      router.push(`/transfers/${code}`)
    })
  }

  return (
    <form
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ScanButton label="Scan to check off" onScan={onScan} />
        <span className="text-sm text-muted-foreground">
          {checked.size} of {rows.length} checked
        </span>
      </div>

      {notSent.length > 0 && (
        <Alert>
          <Info />
          <AlertDescription>
            Sent short by the warehouse (nothing to receive for these):{" "}
            {notSent
              .map((n) => `${n.name} — ${formatQty(n.sent, n.unit)} of ${formatQty(n.approved, n.unit)}`)
              .join("; ")}
          </AlertDescription>
        </Alert>
      )}

      {rows.map((row) => {
        const entry = entries[row.id]
        const qty = Number(entry.qty)
        const different = entry.qty !== "" && qty !== row.sentQty
        return (
          <Card key={row.id} size="sm" className={different ? "ring-amber-500/60" : ""}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 font-medium">
                    {checked.has(row.id) && <CircleCheck className="size-4 text-green-600" />}
                    {row.itemName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{row.batchCode ?? row.sku}</span>
                    {row.bestBefore && ` · best before ${formatDate(row.bestBefore)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Sent {formatQty(row.sentQty, row.unit)} · Arrived
                  </span>
                  <Input
                    aria-label={`${row.itemName} arrived`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    className="w-24 text-right"
                    value={entry.qty}
                    onChange={(e) => {
                      const next = e.target.value
                      const n = Number(next)
                      // Suggest a reason that matches the direction of the difference.
                      const reason: Entry["reason"] =
                        next === "" || n === row.sentQty
                          ? ""
                          : entry.reason || (n < row.sentQty ? "missing" : "extra")
                      update(row.id, { qty: next, reason })
                    }}
                  />
                </div>
              </div>
              {different && (
                <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                  <NativeSelect
                    aria-label="Reason"
                    className="w-full"
                    value={entry.reason}
                    onChange={(e) => update(row.id, { reason: e.target.value as Entry["reason"] })}
                  >
                    <NativeSelectOption value="">Reason…</NativeSelectOption>
                    {(Object.keys(REASON_LABELS) as DiscrepancyReason[]).map((r) => (
                      <NativeSelectOption key={r} value={r}>
                        {REASON_LABELS[r]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Input
                    aria-label="Note"
                    placeholder="What happened? (optional)"
                    maxLength={300}
                    value={entry.note}
                    onChange={(e) => update(row.id, { note: e.target.value })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {differences.length === 0
            ? "Everything arrived as sent."
            : `${differences.length} difference${differences.length === 1 ? "" : "s"} will be recorded.`}
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : differences.length === 0 ? "Everything arrived" : "Confirm receipt"}
        </Button>
      </div>
    </form>
  )
}
