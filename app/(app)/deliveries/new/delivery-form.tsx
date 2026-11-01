"use client"

import { useId, useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { addDays } from "@/lib/dates"
import { formatMoney } from "@/lib/format"
import { useResetOnHide } from "@/hooks/use-reset-on-hide"
import { receiveDelivery } from "../actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Item = {
  id: string
  sku: string
  name: string
  kind: "product" | "ingredient" | "packaging"
  unit: Unit
  cost: number | null
  trackBatches: boolean
  shelfLifeDays: number | null
  barcodes: string[]
}

type Line = {
  key: number
  itemId: string
  qty: string
  unitCost: string
  bestBefore: string
  supplierBatch: string
}

const KIND_LABELS = {
  ingredient: "Ingredients",
  packaging: "Packaging",
  product: "Products",
} as const

const UNIT_WORDS: Record<Unit, string> = { each: "each", g: "g", kg: "kg", ml: "ml", l: "L" }

let nextKey = 1
const newLine = (patch: Partial<Line> = {}): Line => ({
  key: nextKey++,
  itemId: "",
  qty: "",
  unitCost: "",
  bestBefore: "",
  supplierBatch: "",
  ...patch,
})

export function DeliveryForm({
  locations,
  suppliers,
  items,
}: {
  locations: { id: string; code: string; name: string; today: string; canManage: boolean }[]
  suppliers: { id: string; name: string }[]
  items: Item[]
}) {
  const formId = useId()
  const [pending, startTransition] = useTransition()
  const resetOnHide = useResetOnHide()
  const [locationId, setLocationId] = useState(locations[0].id)
  const location = locations.find((l) => l.id === locationId) ?? locations[0]
  const [supplierId, setSupplierId] = useState("")
  const [receivedOn, setReceivedOn] = useState(location.today)
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [updateCosts, setUpdateCosts] = useState(false)
  const [lines, setLines] = useState<Line[]>(() => [newLine()])

  const byId = new Map(items.map((i) => [i.id, i]))
  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0)

  function update(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function chooseItem(key: number, itemId: string) {
    const item = byId.get(itemId)
    update(key, { itemId, unitCost: item?.cost != null ? String(item.cost) : "", bestBefore: "" })
  }

  function onScan(code: string) {
    const c = code.trim().toLowerCase()
    const item = items.find(
      (i) => i.sku.toLowerCase() === c || i.barcodes.some((b) => b.toLowerCase() === c),
    )
    if (!item) return void toast.error(`No item has the code “${code}”.`)
    const blank = lines.find((l) => !l.itemId)
    const patch = { itemId: item.id, unitCost: item.cost != null ? String(item.cost) : "" }
    setLines(blank ? lines.map((l) => (l.key === blank.key ? { ...l, ...patch } : l)) : [...lines, newLine(patch)])
    toast.success(`Added ${item.name}. Enter the quantity.`)
  }

  function submit() {
    const filled = lines.filter((l) => l.itemId || l.qty)
    if (filled.length === 0) return void toast.error("Add at least one item.")
    for (const l of filled) {
      const name = byId.get(l.itemId)?.name ?? "an item"
      if (!l.itemId) return void toast.error("Choose an item on every line, or remove the empty line.")
      if (!(Number(l.qty) > 0)) return void toast.error(`Enter how much ${name} arrived.`)
      if (l.unitCost !== "" && !(Number(l.unitCost) >= 0)) return void toast.error(`Check the cost of ${name}.`)
    }
    // On success the action navigates to the new delivery, so register the
    // reset first: the form is empty next time it's opened.
    resetOnHide(() => {
      setLines([newLine()])
      setReference("")
      setNote("")
      setUpdateCosts(false)
    })
    startTransition(async () => {
      const result = await receiveDelivery({
        locationId,
        supplierId,
        receivedOn,
        reference,
        note,
        updateCosts,
        lines: filled.map((l) => ({
          itemId: l.itemId,
          qty: Number(l.qty),
          unitCost: l.unitCost === "" ? null : Number(l.unitCost),
          bestBefore: l.bestBefore,
          supplierBatch: l.supplierBatch,
        })),
      })
      // On success the action opens the delivery; we only get here on errors.
      if (result && !result.ok) toast.error(result.error)
    })
  }

  const grouped = (Object.keys(KIND_LABELS) as Item["kind"][]).map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind),
  }))

  return (
    <form
      className="flex max-w-4xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {locations.length > 1 && (
            <Field>
              <FieldLabel htmlFor="delivery-location">Delivered to</FieldLabel>
              <NativeSelect
                id="delivery-location"
                className="w-full"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value)
                  setUpdateCosts(false)
                }}
              >
                {locations.map((l) => (
                  <NativeSelectOption key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="delivery-supplier">Supplier</FieldLabel>
            <NativeSelect
              id="delivery-supplier"
              className="w-full"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <NativeSelectOption value="">Not listed / none</NativeSelectOption>
              {suppliers.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="delivery-date">Received on</FieldLabel>
            <Input
              id="delivery-date"
              type="date"
              max={location.today}
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value || location.today)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="delivery-reference">Delivery note / invoice no.</FieldLabel>
            <Input
              id="delivery-reference"
              value={reference}
              maxLength={100}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. INV-20431"
            />
          </Field>
        </CardContent>
      </Card>

      <div>
        <ScanButton label="Scan to add" onScan={onScan} />
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const item = byId.get(line.itemId)
          const defaultBest =
            item?.trackBatches && item.shelfLifeDays !== null ? addDays(receivedOn, item.shelfLifeDays) : ""
          return (
            <Card key={line.key} size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_2rem] gap-2">
                  <NativeSelect
                    aria-label={`Item ${index + 1}`}
                    className="w-full"
                    value={line.itemId}
                    onChange={(e) => chooseItem(line.key, e.target.value)}
                  >
                    <NativeSelectOption value="">Choose an item…</NativeSelectOption>
                    {grouped.map(
                      (g) =>
                        g.items.length > 0 && (
                          <NativeSelectOptGroup key={g.kind} label={KIND_LABELS[g.kind]}>
                            {g.items.map((i) => (
                              <NativeSelectOption key={i.id} value={i.id}>
                                {i.name} ({UNIT_WORDS[i.unit]})
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
                <div className="grid gap-2 sm:grid-cols-4">
                  <Field>
                    <FieldLabel htmlFor={`${formId}-qty-${index}`} className="text-xs">
                      Quantity{item ? ` (${UNIT_WORDS[item.unit]})` : ""}
                    </FieldLabel>
                    <Input
                      id={`${formId}-qty-${index}`}
                      aria-label={`Quantity ${index + 1}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.qty}
                      onChange={(e) => update(line.key, { qty: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-cost-${index}`} className="text-xs">
                      Cost per {item ? UNIT_WORDS[item.unit] : "unit"}
                    </FieldLabel>
                    <Input
                      id={`${formId}-cost-${index}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.unitCost}
                      onChange={(e) => update(line.key, { unitCost: e.target.value })}
                    />
                  </Field>
                  {item?.trackBatches && (
                    <>
                      <Field>
                        <FieldLabel htmlFor={`${formId}-best-${index}`} className="text-xs">
                          Best before
                        </FieldLabel>
                        <Input
                          id={`${formId}-best-${index}`}
                          type="date"
                          min={receivedOn}
                          value={line.bestBefore || defaultBest}
                          onChange={(e) =>
                            update(line.key, { bestBefore: e.target.value === defaultBest ? "" : e.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${formId}-lot-${index}`} className="text-xs">
                          Supplier lot no.
                        </FieldLabel>
                        <Input
                          id={`${formId}-lot-${index}`}
                          value={line.supplierBatch}
                          maxLength={60}
                          onChange={(e) => update(line.key, { supplierBatch: e.target.value })}
                        />
                      </Field>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setLines((c) => [...c, newLine()])}>
          <Plus />
          Add line
        </Button>
        <span className="text-sm">
          Delivery value <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
        </span>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="delivery-note">Note (optional)</FieldLabel>
            <Input
              id="delivery-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Two bags torn, supplier will credit"
            />
          </Field>
          {location.canManage && (
            <Field orientation="horizontal">
              <Switch id="delivery-costs" checked={updateCosts} onCheckedChange={setUpdateCosts} />
              <div>
                <FieldLabel htmlFor="delivery-costs">Update cost prices</FieldLabel>
                <FieldDescription>
                  Set each item&apos;s cost price in the catalogue to the cost on this delivery.
                  Recipe costs and waste values use it.
                </FieldDescription>
              </div>
            </Field>
          )}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Receive delivery"}
      </Button>
    </form>
  )
}
