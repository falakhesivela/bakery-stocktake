"use client"

import { useId, useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ExpiryBadge } from "@/components/expiry-badge"
import { PhotoInput } from "@/components/photo-input"
import { ScanButton } from "@/components/scanner/scan-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { formatDate, formatQty } from "@/lib/format"
import { uploadPhoto } from "@/lib/photos"
import { WASTE_REASON_LABELS, type WasteReason } from "@/lib/store-ops"
import { logWaste } from "./actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Item = {
  id: string
  sku: string
  name: string
  kind: "product" | "ingredient" | "packaging"
  unit: Unit
  trackBatches: boolean
  barcodes: string[]
}

type Batch = {
  itemId: string
  batchId: string
  batchCode: string
  bestBefore: string | null
  daysToExpiry: number | null
  qty: number
}

type NearExpiry = {
  itemId: string
  itemName: string
  unit: Unit
  batchId: string
  batchCode: string
  bestBefore: string | null
  daysToExpiry: number
  qty: number
}

type Line = {
  key: number
  itemId: string
  batchId: string // "" = oldest first
  qty: string
  reason: WasteReason | ""
  note: string
  photo: Blob | null
}

const KIND_LABELS = { product: "Products", ingredient: "Ingredients", packaging: "Packaging" } as const

let nextKey = 1
const newLine = (patch: Partial<Line> = {}): Line => ({
  key: nextKey++,
  itemId: "",
  batchId: "",
  qty: "",
  reason: "",
  note: "",
  photo: null,
  ...patch,
})

export function WasteForm({
  locationId,
  today,
  items,
  batches,
  nearExpiry,
}: {
  locationId: string
  today: string
  items: Item[]
  batches: Batch[]
  nearExpiry: NearExpiry[]
}) {
  const formId = useId()
  const [pending, startTransition] = useTransition()
  const [lines, setLines] = useState<Line[]>(() => [newLine()])
  const [date, setDate] = useState(today)

  const itemById = new Map(items.map((i) => [i.id, i]))
  const batchesFor = (itemId: string) => batches.filter((b) => b.itemId === itemId)

  function update(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addLine(patch: Partial<Line>) {
    const blank = lines.find((l) => !l.itemId)
    setLines(
      blank
        ? lines.map((l) => (l.key === blank.key ? { ...l, ...patch } : l))
        : [...lines, newLine(patch)],
    )
  }

  function onScan(code: string) {
    const c = code.trim().toLowerCase()
    const batch = batches.find((b) => b.batchCode.toLowerCase() === c)
    if (batch) {
      addLine({ itemId: batch.itemId, batchId: batch.batchId })
      return void toast.success(`${itemById.get(batch.itemId)?.name}, batch ${batch.batchCode}`)
    }
    const item = items.find(
      (i) => i.sku.toLowerCase() === c || i.barcodes.some((b) => b.toLowerCase() === c),
    )
    if (item) return addLine({ itemId: item.id })
    toast.error(`Nothing here has the code “${code}”.`)
  }

  function submit() {
    const filled = lines.filter((l) => l.itemId || l.qty)
    if (filled.length === 0) return void toast.error("Add at least one item.")
    for (const l of filled) {
      const name = itemById.get(l.itemId)?.name ?? "an item"
      if (!l.itemId) return void toast.error("Choose an item on every line, or remove the empty line.")
      if (!(Number(l.qty) > 0)) return void toast.error(`Enter how many ${name} were wasted.`)
      if (!l.reason) return void toast.error(`Choose a reason for ${name}.`)
    }

    startTransition(async () => {
      let payload
      try {
        payload = await Promise.all(
          filled.map(async (l) => ({
            itemId: l.itemId,
            batchId: l.batchId || null,
            qty: Number(l.qty),
            reason: l.reason as WasteReason,
            note: l.note,
            photoPath: l.photo ? await uploadPhoto(locationId, "waste", l.photo) : null,
          })),
        )
      } catch (err) {
        return void toast.error(err instanceof Error ? err.message : "Photo upload failed")
      }

      const result = await logWaste({ locationId, date, lines: payload })
      if (!result.ok) return void toast.error(result.error)
      toast.success(`Logged ${result.data.count} waste line${result.data.count === 1 ? "" : "s"}`)
      setLines([newLine()])
    })
  }

  const grouped = (Object.keys(KIND_LABELS) as Item["kind"][]).map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind),
  }))

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Log waste</CardTitle>
          <CardDescription>
            Pick the batch if you know it; otherwise the oldest stock is taken out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex flex-wrap items-end gap-2">
              <ScanButton label="Scan label" title="Scan a batch label or product" onScan={onScan} />
              <Field className="ml-auto w-auto">
                <FieldLabel htmlFor={`${formId}-date`}>Wasted on</FieldLabel>
                <Input
                  id={`${formId}-date`}
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value || today)}
                />
              </Field>
            </div>

            {lines.map((line, index) => {
              const item = itemById.get(line.itemId)
              const options = item?.trackBatches ? batchesFor(item.id) : []
              return (
                <div key={line.key} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="grid grid-cols-[1fr_2rem] gap-2">
                    <NativeSelect
                      aria-label={`Item ${index + 1}`}
                      className="w-full"
                      value={line.itemId}
                      onChange={(e) => update(line.key, { itemId: e.target.value, batchId: "" })}
                    >
                      <NativeSelectOption value="">Choose an item…</NativeSelectOption>
                      {grouped.map(
                        (g) =>
                          g.items.length > 0 && (
                            <NativeSelectOptGroup key={g.kind} label={KIND_LABELS[g.kind]}>
                              {g.items.map((i) => (
                                <NativeSelectOption key={i.id} value={i.id}>
                                  {i.name} ({i.sku})
                                </NativeSelectOption>
                              ))}
                            </NativeSelectOptGroup>
                          ),
                      )}
                    </NativeSelect>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1.4fr_6rem_1fr]">
                    {item?.trackBatches ? (
                      <NativeSelect
                        aria-label={`Batch ${index + 1}`}
                        className="w-full"
                        value={line.batchId}
                        onChange={(e) => update(line.key, { batchId: e.target.value })}
                      >
                        <NativeSelectOption value="">Oldest first (any batch)</NativeSelectOption>
                        {options.map((b) => (
                          <NativeSelectOption key={b.batchId} value={b.batchId}>
                            {b.batchCode} · best before {formatDate(b.bestBefore)} · {formatQty(b.qty, item.unit)} here
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    ) : (
                      <div className="hidden text-xs text-muted-foreground sm:flex sm:items-center">
                        {item ? "No batches for this item" : ""}
                      </div>
                    )}
                    <Input
                      aria-label={`Quantity ${index + 1}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder={item && item.unit !== "each" ? item.unit : "Qty"}
                      value={line.qty}
                      onChange={(e) => update(line.key, { qty: e.target.value })}
                    />
                    <NativeSelect
                      aria-label={`Reason ${index + 1}`}
                      className="w-full"
                      value={line.reason}
                      onChange={(e) => update(line.key, { reason: e.target.value as WasteReason })}
                    >
                      <NativeSelectOption value="">Reason…</NativeSelectOption>
                      {(Object.keys(WASTE_REASON_LABELS) as WasteReason[]).map((r) => (
                        <NativeSelectOption key={r} value={r}>
                          {WASTE_REASON_LABELS[r]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Note ${index + 1}`}
                      placeholder="Note (optional)"
                      maxLength={300}
                      value={line.note}
                      onChange={(e) => update(line.key, { note: e.target.value })}
                    />
                    <PhotoInput value={line.photo} onChange={(photo) => update(line.key, { photo })} />
                  </div>
                </div>
              )
            })}

            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setLines((c) => [...c, newLine()])}>
                <Plus />
                Add line
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Saving…" : "Log waste"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Use or remove</CardTitle>
          <CardDescription>Batches here that are past or at their best-before date.</CardDescription>
        </CardHeader>
        <CardContent>
          {nearExpiry.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing is past its date.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {nearExpiry.map((n) => (
                <li key={n.batchId} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{n.itemName}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">{n.batchCode}</span>
                      <ExpiryBadge bestBefore={n.bestBefore} daysToExpiry={n.daysToExpiry} />
                      <span>{formatQty(n.qty, n.unit)} here</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      addLine({
                        itemId: n.itemId,
                        batchId: n.batchId,
                        qty: String(n.qty),
                        reason: n.daysToExpiry < 0 ? "expired" : "unsold",
                      })
                      toast.info(`Added ${n.itemName}. Check the quantity, then log it.`)
                    }}
                  >
                    Waste
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
