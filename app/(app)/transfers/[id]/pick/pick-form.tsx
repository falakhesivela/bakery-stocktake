"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleCheck, TriangleAlert, Truck } from "lucide-react"
import { toast } from "sonner"
import { ExpiryBadge } from "@/components/expiry-badge"
import { ScanButton } from "@/components/scanner/scan-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatQty } from "@/lib/format"
import { dispatchTransfer } from "../../actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Line = {
  id: string
  itemId: string
  name: string
  sku: string
  unit: Unit
  trackBatches: boolean
  qty: number
}

type StockRow = {
  itemId: string
  batchId: string | null
  batchCode: string | null
  bestBefore: string | null
  daysToExpiry: number | null
  qty: number
}

const NO_BATCH = "none"
const pickKey = (lineId: string, batchId: string | null) => `${lineId}|${batchId ?? NO_BATCH}`

/** Batches available for a line; items without batches get one "no batch" row. */
function optionsFor(line: Line, stock: StockRow[]): StockRow[] {
  if (!line.trackBatches) {
    const qty = stock
      .filter((s) => s.itemId === line.itemId && s.batchId === null)
      .reduce((sum, s) => sum + s.qty, 0)
    return [{ itemId: line.itemId, batchId: null, batchCode: null, bestBefore: null, daysToExpiry: null, qty }]
  }
  return stock.filter((s) => s.itemId === line.itemId && s.batchId !== null && s.qty > 0)
}

/**
 * First-expiry-first-out: fill a line from its oldest in-date batches.
 * Quantities on `fixed` batches (scanned or typed by the picker) are kept and
 * only the rest of the line is spread over the other batches.
 */
function allocateLine(
  line: Line,
  stock: StockRow[],
  picks: Record<string, string>,
  fixed: Set<string>,
) {
  const next = { ...picks }
  const options = optionsFor(line, stock)
  if (!line.trackBatches) {
    const key = pickKey(line.id, null)
    if (!fixed.has(key)) next[key] = String(line.qty)
    return next
  }
  let remaining =
    line.qty -
    options
      .filter((o) => fixed.has(pickKey(line.id, o.batchId)))
      .reduce((sum, o) => sum + (Number(next[pickKey(line.id, o.batchId)]) || 0), 0)
  for (const option of options) {
    const key = pickKey(line.id, option.batchId)
    if (fixed.has(key)) continue
    const expired = option.daysToExpiry !== null && option.daysToExpiry < 0
    const take = expired ? 0 : Math.max(0, Math.min(remaining, option.qty))
    next[key] = take > 0 ? String(take) : ""
    remaining -= take
  }
  return next
}

function suggestPicks(lines: Line[], stock: StockRow[]) {
  return lines.reduce<Record<string, string>>(
    (picks, line) => allocateLine(line, stock, picks, new Set()),
    {},
  )
}

export function PickForm({
  transferId,
  code,
  lines,
  stock,
}: {
  transferId: string
  code: string
  lines: Line[]
  stock: StockRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [picks, setPicks] = useState<Record<string, string>>(() => suggestPicks(lines, stock))
  // Batches the picker scanned (ticked) or typed a quantity for: kept as they are.
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [fixed, setFixed] = useState<Set<string>>(() => new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pickedFor = (line: Line) =>
    optionsFor(line, stock).reduce(
      (sum, o) => sum + (Number(picks[pickKey(line.id, o.batchId)]) || 0),
      0,
    )

  const summary = lines.map((line) => ({ line, picked: pickedFor(line) }))
  const shortLines = summary.filter((s) => s.picked < s.line.qty)
  const overLines = summary.filter((s) => s.picked > s.line.qty)
  const totalPicked = summary.reduce((sum, s) => sum + s.picked, 0)

  function onScan(code: string) {
    const c = code.trim().toUpperCase()
    for (const line of lines) {
      for (const option of optionsFor(line, stock)) {
        if (!option.batchCode || option.batchCode.toUpperCase() !== c) continue
        const key = pickKey(line.id, option.batchId)
        const nextFixed = new Set(fixed).add(key)
        let nextPicks = picks
        if (!Number(picks[key])) {
          // The picker is holding this batch: send it instead of the suggested ones.
          const fromOtherScans = optionsFor(line, stock)
            .filter((o) => o.batchId !== option.batchId && fixed.has(pickKey(line.id, o.batchId)))
            .reduce((sum, o) => sum + (Number(picks[pickKey(line.id, o.batchId)]) || 0), 0)
          const take = Math.max(0, Math.min(option.qty, line.qty - fromOtherScans))
          if (take === 0) {
            toast.warning(
              `${line.name} is already complete from other scanned batches. Type a quantity for ${option.batchCode} if you want to send it too.`,
            )
          }
          nextPicks = { ...picks, [key]: take > 0 ? String(take) : "" }
        }
        setFixed(nextFixed)
        setChecked((current) => new Set(current).add(key))
        setPicks(allocateLine(line, stock, nextPicks, nextFixed))
        toast.success(`${line.name}: batch ${option.batchCode} ✓`)
        return
      }
    }
    const byItem = lines.find((l) => l.sku.toUpperCase() === c)
    if (byItem && !byItem.trackBatches) {
      setChecked((current) => new Set(current).add(pickKey(byItem.id, null)))
      toast.success(`${byItem.name} ✓`)
      return
    }
    if (byItem) {
      toast.error(`Scan the batch label on the ${byItem.name}, not the product barcode.`)
      return
    }
    toast.error(`“${code}” isn't on this transfer, or that batch isn't in stock here.`)
  }

  function dispatch() {
    const payload = lines.flatMap((line) =>
      optionsFor(line, stock).map((o) => ({
        lineId: line.id,
        batchId: o.batchId,
        qty: Number(picks[pickKey(line.id, o.batchId)]) || 0,
      })),
    )
    startTransition(async () => {
      const result = await dispatchTransfer({ id: transferId, picks: payload })
      if (!result.ok) {
        setConfirmOpen(false)
        return void toast.error(result.error)
      }
      toast.success(`${code} is on its way. Print the delivery note to go with it.`)
      router.push(`/transfers/${code}`)
    })
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ScanButton label="Scan batch label" onScan={onScan} />
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setPicks(suggestPicks(lines, stock))
            setFixed(new Set())
            setChecked(new Set())
          }}
        >
          Reset to suggested
        </Button>
      </div>

      {summary.map(({ line, picked }) => {
        const options = optionsFor(line, stock)
        const status =
          picked === line.qty ? "ok" : picked < line.qty ? "short" : "over"
        return (
          <Card key={line.id} size="sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{line.name}</CardTitle>
                <div className="font-mono text-xs text-muted-foreground">{line.sku}</div>
              </div>
              <div
                className={`text-right text-sm tabular-nums ${status === "ok" ? "text-green-700 dark:text-green-400" : status === "short" ? "text-amber-700 dark:text-amber-400" : "text-destructive"}`}
              >
                <div className="font-semibold">
                  {formatQty(picked, line.unit)} of {formatQty(line.qty, line.unit)}
                </div>
                <div className="text-xs">
                  {status === "ok" ? "Ready" : status === "short" ? "Short" : "More than approved"}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {options.length === 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  No stock of this item here. It will be sent as short.
                </p>
              )}
              {options.map((option) => {
                const key = pickKey(line.id, option.batchId)
                const value = picks[key] ?? ""
                const over = (Number(value) || 0) > option.qty
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[1fr_6rem] items-center gap-3 rounded-lg border px-3 py-2 sm:grid-cols-[1fr_auto_6rem]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {checked.has(key) && <CircleCheck className="size-4 text-green-600" />}
                      <span className="font-mono text-sm">
                        {option.batchCode ?? "No batch"}
                      </span>
                      {option.batchId && (
                        <ExpiryBadge bestBefore={option.bestBefore} daysToExpiry={option.daysToExpiry} />
                      )}
                    </div>
                    <div className="col-span-2 row-start-2 text-xs text-muted-foreground sm:col-span-1 sm:row-start-auto">
                      {formatQty(option.qty, line.unit)} in stock
                      {over && <span className="ml-1 text-destructive">(not enough)</span>}
                    </div>
                    <Input
                      aria-label={`Quantity from ${option.batchCode ?? "stock"}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={value}
                      onChange={(e) => {
                        setPicks((current) => ({ ...current, [key]: e.target.value }))
                        setFixed((current) => new Set(current).add(key))
                      }}
                      className="text-right"
                    />
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}

      {(shortLines.length > 0 || overLines.length > 0) && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            {shortLines.length > 0 && (
              <p>
                Short: {shortLines.map((s) => s.line.name).join(", ")}. The store will see
                what was approved and what was sent.
              </p>
            )}
            {overLines.length > 0 && (
              <p>More than approved: {overLines.map((s) => s.line.name).join(", ")}.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button size="lg" disabled={pending || totalPicked <= 0} onClick={() => setConfirmOpen(true)}>
          <Truck />
          Dispatch
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dispatch {code}?</DialogTitle>
            <DialogDescription>
              The picked stock leaves this location now and shows as on the way
              until the store receives it.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {summary.map(({ line, picked }) => (
              <li key={line.id} className="flex justify-between gap-2">
                <span>{line.name}</span>
                <span className={`tabular-nums ${picked < line.qty ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {formatQty(picked, line.unit)}
                  {picked !== line.qty && ` of ${formatQty(line.qty, line.unit)}`}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep picking
            </Button>
            <Button onClick={dispatch} disabled={pending}>
              {pending ? "Dispatching…" : "Dispatch now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
