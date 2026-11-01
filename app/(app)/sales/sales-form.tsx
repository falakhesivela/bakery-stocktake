"use client"

import { useRef, useState, useTransition } from "react"
import { Download, Search, TriangleAlert, Upload } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { downloadCsv, parseCsvFile } from "@/lib/csv"
import { formatMoney, formatQty } from "@/lib/format"
import { saveSales } from "./actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Item = {
  id: string
  sku: string
  name: string
  unit: Unit
  price: number | null
  barcodes: string[]
  onHand: number
}

export function SalesForm({
  locationId,
  locationName,
  date,
  dateLabel,
  items,
  initial,
  initialNote,
  hasDraft,
}: {
  locationId: string
  locationName: string
  date: string
  dateLabel: string
  items: Item[]
  initial: Record<string, string>
  initialNote: string
  hasDraft: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [qty, setQty] = useState<Record<string, string>>(initial)
  const [note, setNote] = useState(initialNote)
  const [filter, setFilter] = useState("")
  const [highlight, setHighlight] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  const findByCode = (code: string) => {
    const c = code.trim().toLowerCase()
    return items.find(
      (i) => i.sku.toLowerCase() === c || i.barcodes.some((b) => b.toLowerCase() === c),
    )
  }

  const entered = items
    .map((i) => ({ item: i, qty: Number(qty[i.id] || 0) }))
    .filter((e) => e.qty > 0)
  const invalid = items.some((i) => qty[i.id] && (Number.isNaN(Number(qty[i.id])) || Number(qty[i.id]) < 0))
  const totals = entered.reduce(
    (sum, e) => ({ units: sum.units + e.qty, value: sum.value + e.qty * (e.item.price ?? 0) }),
    { units: 0, value: 0 },
  )
  const oversold = entered.filter((e) => e.qty > Math.max(e.item.onHand, 0))

  const f = filter.trim().toLowerCase()
  const shown = items.filter(
    (i) => !f || i.name.toLowerCase().includes(f) || i.sku.toLowerCase().includes(f),
  )

  function onScan(code: string) {
    const item = findByCode(code)
    if (!item) return void toast.error(`No product has the code “${code}”.`)
    setQty((current) => ({ ...current, [item.id]: String(Number(current[item.id] || 0) + 1) }))
    setFilter("")
    setHighlight(item.id)
    setTimeout(() => document.getElementById(`sale-${item.id}`)?.scrollIntoView({ block: "center" }), 50)
    toast.success(`${item.name}: ${Number(qty[item.id] || 0) + 1}`)
  }

  async function importCsv(file: File) {
    const rows = await parseCsvFile(file)
    const errors: string[] = []
    const next: Record<string, string> = {}
    rows.forEach((row, index) => {
      const code = row.sku ?? row.barcode ?? row.code ?? ""
      const item = findByCode(code)
      const n = Number(row.qty ?? row.quantity ?? row.sold)
      if (!item) return void errors.push(`Row ${index + 2}: no product with code “${code}”.`)
      if (!Number.isFinite(n) || n < 0) {
        return void errors.push(`Row ${index + 2}: the quantity for ${item.name} isn't a number.`)
      }
      next[item.id] = String(Number(next[item.id] || 0) + n)
    })
    setProblems(errors)
    const count = Object.keys(next).length
    if (count > 0) {
      setQty((current) => ({ ...current, ...next }))
      toast.success(`Loaded ${count} product(s) from the file. Check them, then post.`)
    }
  }

  function save(post: boolean) {
    if (invalid) return void toast.error("Quantities must be numbers of 0 or more.")
    startTransition(async () => {
      const result = await saveSales({
        locationId,
        date,
        note,
        post,
        lines: entered.map((e) => ({ itemId: e.item.id, qty: e.qty })),
      })
      setConfirmOpen(false)
      if (!result.ok) return void toast.error(result.error)
      toast.success(post ? `Sales for ${dateLabel} posted` : "Draft saved")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Sales for {dateLabel} at {locationName}
        </CardTitle>
        <CardDescription>
          {hasDraft ? "Draft saved, not posted yet. " : ""}
          Type how many of each product were sold. Leave the rest empty.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a product"
              className="pl-8"
              aria-label="Find a product"
            />
          </div>
          <ScanButton label="Scan" title="Scan a product (adds 1)" onScan={onScan} />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload />
            Till CSV
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              downloadCsv(
                "sales-template.csv",
                items.slice(0, 3).map((i) => ({ sku: i.sku, qty: 0 })),
              )
            }
          >
            <Download />
            Template
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importCsv(file).catch(() => toast.error("Couldn't read that file."))
              e.target.value = ""
            }}
          />
        </div>

        {problems.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">Some rows were skipped:</p>
              <ul className="mt-1 list-disc pl-5">
                {problems.slice(0, 8).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="divide-y rounded-lg border">
          {shown.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No products match “{filter}”.</p>
          )}
          {shown.map((item) => {
            const value = qty[item.id] ?? ""
            const n = Number(value || 0)
            const over = n > Math.max(item.onHand, 0)
            return (
              <div
                key={item.id}
                id={`sale-${item.id}`}
                className={`grid grid-cols-[1fr_6rem] items-center gap-3 px-3 py-2 ${highlight === item.id ? "bg-amber-500/10" : ""}`}
              >
                <label htmlFor={`sale-input-${item.id}`} className="min-w-0">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{item.sku}</span>
                    {" · "}
                    {formatQty(item.onHand, item.unit)} in stock
                    {item.price !== null && ` · ${formatMoney(item.price)}`}
                    {over && (
                      <span className="ml-1 text-amber-700 dark:text-amber-400">
                        <TriangleAlert className="inline size-3" /> more than in stock
                      </span>
                    )}
                  </div>
                </label>
                <Input
                  id={`sale-input-${item.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  className="text-right"
                  value={value}
                  onChange={(e) => setQty((current) => ({ ...current, [item.id]: e.target.value }))}
                />
              </div>
            )
          })}
        </div>

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. Till down for an hour"
          aria-label="Note"
          maxLength={500}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{formatQty(totals.units)}</span> items ·{" "}
            <span className="font-semibold tabular-nums">{formatMoney(totals.value)}</span>
            <span className="text-muted-foreground"> at list prices</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
              Save draft
            </Button>
            <Button type="button" size="lg" disabled={pending} onClick={() => setConfirmOpen(true)}>
              Post sales
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post sales for {dateLabel}?</DialogTitle>
            <DialogDescription>
              {entered.length === 0
                ? "Nothing is entered, so this records that nothing was sold."
                : `${formatQty(totals.units)} items will be taken out of stock at ${locationName}, oldest in-date batches first.`}{" "}
              A manager can reopen posted sales to fix mistakes.
            </DialogDescription>
          </DialogHeader>
          {oversold.length > 0 && (
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                More sold than the system has in stock: {oversold.map((o) => o.item.name).join(", ")}.
                Stock will show as negative until a delivery is received or the stock is counted.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button onClick={() => save(true)} disabled={pending}>
              {pending ? "Posting…" : "Post sales"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
