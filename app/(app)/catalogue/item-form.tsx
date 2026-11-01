"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { ScanButton } from "@/components/scanner/scan-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { UNIT_OPTIONS } from "@/lib/format"
import { ITEM_KINDS, KIND_LABELS } from "@/lib/schemas/item"
import { saveItem, type ItemFormState } from "./actions"

export type ItemFormValues = {
  id?: string
  sku: string
  name: string
  kind: (typeof ITEM_KINDS)[number]
  unit: string
  categoryId: string
  shelfLifeDays: number | null
  trackBatches: boolean
  cost: number | null
  price: number | null
  notes: string
  active: boolean
  barcodes: string[]
}

export const EMPTY_ITEM: ItemFormValues = {
  sku: "",
  name: "",
  kind: "product",
  unit: "each",
  categoryId: "",
  shelfLifeDays: null,
  trackBatches: true,
  cost: null,
  price: null,
  notes: "",
  active: true,
  barcodes: [],
}

export function ItemForm({
  initial,
  categories,
}: {
  initial: ItemFormValues
  categories: { id: string; name: string }[]
}) {
  const [state, action, pending] = useActionState<ItemFormState, FormData>(saveItem, {})
  const [kind, setKind] = useState(initial.kind)
  const [trackBatches, setTrackBatches] = useState(initial.trackBatches)
  const [barcodes, setBarcodes] = useState(initial.barcodes.join("\n"))
  const isNew = !initial.id

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" name="name" defaultValue={initial.name} required maxLength={120} />
              </Field>
              <Field>
                <FieldLabel htmlFor="sku">SKU</FieldLabel>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={initial.sku}
                  required
                  maxLength={32}
                  pattern="[A-Za-z0-9._\-]{1,32}"
                  className="font-mono uppercase"
                  placeholder="CAKE-CHOC-L"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="kind">Type</FieldLabel>
                <NativeSelect
                  id="kind"
                  name="kind"
                  className="w-full"
                  value={kind}
                  onChange={(e) => {
                    const next = e.target.value as ItemFormValues["kind"]
                    setKind(next)
                    // Sensible default for new items: products have batches.
                    if (isNew) setTrackBatches(next === "product")
                  }}
                >
                  {ITEM_KINDS.map((k) => (
                    <NativeSelectOption key={k} value={k}>
                      {KIND_LABELS[k]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <NativeSelect
                  id="categoryId"
                  name="categoryId"
                  className="w-full"
                  defaultValue={initial.categoryId}
                >
                  <NativeSelectOption value="">No category</NativeSelectOption>
                  {categories.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="unit">Unit</FieldLabel>
                <NativeSelect id="unit" name="unit" className="w-full" defaultValue={initial.unit}>
                  {UNIT_OPTIONS.map((u) => (
                    <NativeSelectOption key={u.value} value={u.value}>
                      {u.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FieldSet>
            <FieldLegend>Freshness</FieldLegend>
            <FieldGroup>
              <Field orientation="horizontal">
                <Switch
                  id="trackBatches"
                  name="trackBatches"
                  checked={trackBatches}
                  onCheckedChange={setTrackBatches}
                />
                <div>
                  <FieldLabel htmlFor="trackBatches">Track batches and best-before dates</FieldLabel>
                  <FieldDescription>
                    Each bake or delivery becomes a batch with its own label. Oldest
                    batches are sent and sold first.
                  </FieldDescription>
                </div>
              </Field>
              {trackBatches && (
                <Field className="max-w-48">
                  <FieldLabel htmlFor="shelfLifeDays">Shelf life (days)</FieldLabel>
                  <Input
                    id="shelfLifeDays"
                    name="shelfLifeDays"
                    type="number"
                    min={0}
                    max={3650}
                    step={1}
                    inputMode="numeric"
                    defaultValue={initial.shelfLifeDays ?? ""}
                  />
                  <FieldDescription>Best-before = bake date + this many days.</FieldDescription>
                </Field>
              )}
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="cost">Cost per unit</FieldLabel>
                <Input
                  id="cost"
                  name="cost"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={initial.cost ?? ""}
                />
              </Field>
              {kind === "product" && (
                <Field>
                  <FieldLabel htmlFor="price">Selling price</FieldLabel>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    defaultValue={initial.price ?? ""}
                  />
                </Field>
              )}
            </div>
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="barcodes">Barcodes</FieldLabel>
                <ScanButton
                  size="sm"
                  label="Scan barcode"
                  onScan={(code) =>
                    setBarcodes((current) =>
                      current.split("\n").includes(code)
                        ? current
                        : [current.trim(), code].filter(Boolean).join("\n"),
                    )
                  }
                />
              </div>
              <Textarea
                id="barcodes"
                name="barcodes"
                rows={3}
                className="font-mono"
                value={barcodes}
                onChange={(e) => setBarcodes(e.target.value)}
                placeholder="One per line"
              />
              <FieldDescription>
                Optional. Scanning any of these (or the SKU) finds this item.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" name="notes" rows={2} defaultValue={initial.notes} maxLength={1000} />
            </Field>
            <Field orientation="horizontal">
              <Switch id="active" name="active" defaultChecked={initial.active} />
              <div>
                <FieldLabel htmlFor="active">Active</FieldLabel>
                <FieldDescription>Inactive items are hidden from lists and forms.</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Create item" : "Save changes"}
        </Button>
        <Link href="/catalogue" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
