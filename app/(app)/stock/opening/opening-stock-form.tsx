"use client"

import { useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, Plus, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { downloadCsv, parseCsvFile } from "@/lib/csv"
import { useResetOnHide } from "@/hooks/use-reset-on-hide"
import { postOpeningStock } from "./actions"

type Item = {
  id: string
  sku: string
  name: string
  kind: "product" | "ingredient" | "packaging"
  unit: string
  trackBatches: boolean
  shelfLifeDays: number | null
  barcodes: string[]
}

type Line = {
  key: number
  itemId: string
  qty: string
  producedOn: string
  bestBefore: string
}

const KIND_LABELS = {
  product: "Products",
  ingredient: "Ingredients",
  packaging: "Packaging",
} as const

let nextKey = 1
const newLine = (itemId = ""): Line => ({
  key: nextKey++,
  itemId,
  qty: "",
  producedOn: "",
  bestBefore: "",
})

export function OpeningStockForm({
  locations,
  items,
}: {
  locations: { id: string; code: string; name: string }[]
  items: Item[]
}) {
  const router = useRouter()
  const formId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "")
  const [note, setNote] = useState("")
  const [lines, setLines] = useState<Line[]>(() => [newLine()])
  const [problems, setProblems] = useState<string[]>([])
  const resetOnHide = useResetOnHide()

  const itemById = new Map(items.map((i) => [i.id, i]))

  function findItemByCode(code: string) {
    const c = code.trim().toLowerCase()
    return items.find(
      (i) => i.sku.toLowerCase() === c || i.barcodes.some((b) => b.toLowerCase() === c),
    )
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addScanned(code: string) {
    const item = findItemByCode(code)
    if (!item) {
      toast.error(`No item has the code “${code}”.`)
      return
    }
    setLines((current) => {
      const blank = current.find((l) => !l.itemId)
      if (blank) return current.map((l) => (l.key === blank.key ? { ...l, itemId: item.id } : l))
      return [...current, newLine(item.id)]
    })
    toast.success(`Added ${item.name}. Enter the quantity.`)
  }

  async function importCsv(file: File) {
    const rows = await parseCsvFile(file)
    const errors: string[] = []
    const imported: Line[] = []

    rows.forEach((row, index) => {
      const rowNo = index + 2 // header is row 1
      const item = findItemByCode(row.sku ?? row.barcode ?? "")
      if (!item) {
        errors.push(`Row ${rowNo}: no item with SKU “${row.sku ?? ""}”.`)
        return
      }
      const qty = Number(row.qty ?? row.quantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push(`Row ${rowNo}: quantity for ${item.name} must be more than 0.`)
        return
      }
      imported.push({
        ...newLine(item.id),
        qty: String(qty),
        producedOn: row.produced_on ?? "",
        bestBefore: row.best_before ?? "",
      })
    })

    setProblems(errors)
    if (imported.length > 0) {
      setLines((current) => [...current.filter((l) => l.itemId), ...imported])
      toast.success(`Loaded ${imported.length} line(s) from the file. Check them, then post.`)
    }
  }

  function submit() {
    const filled = lines.filter((l) => l.itemId || l.qty)
    startTransition(async () => {
      const result = await postOpeningStock({
        locationId,
        note,
        lines: filled.map((l) => ({
          itemId: l.itemId,
          qty: l.qty === "" ? Number.NaN : Number(l.qty),
          producedOn: l.producedOn,
          bestBefore: l.bestBefore,
        })),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Posted ${result.data.count} line(s) of opening stock.`)
      resetOnHide(() => {
        setLines([newLine()])
        setNote("")
        setProblems([])
      })
      router.push(`/stock?location=${locationId}`)
    })
  }

  const grouped = (Object.keys(KIND_LABELS) as Item["kind"][]).map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind),
  }))

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${formId}-location`}>Location</FieldLabel>
            <NativeSelect
              id={`${formId}-location`}
              className="w-full"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.code} · {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-note`}>Note (optional)</FieldLabel>
            <Input
              id={`${formId}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Count on go-live day"
              maxLength={500}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <ScanButton label="Scan to add" onScan={addScanned} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload />
          Load CSV
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            downloadCsv("opening-stock-template.csv", [
              { sku: "CAKE-CHOC-L", qty: 12, produced_on: "", best_before: "" },
              { sku: "FLOUR-CAKE", qty: 25, produced_on: "", best_before: "" },
            ])
          }
        >
          <Download />
          CSV template
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
              {problems.slice(0, 10).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {problems.length > 10 && <p>…and {problems.length - 10} more.</p>}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const item = itemById.get(line.itemId)
          const shelfHint =
            item?.trackBatches && item.shelfLifeDays !== null
              ? `Leave blank to use ${item.shelfLifeDays} day(s) after baking`
              : undefined

          return (
            <Card key={line.key} size="sm">
              <CardContent className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
                <Field>
                  <FieldLabel htmlFor={`${formId}-item-${index}`}>
                    Item {index + 1}
                  </FieldLabel>
                  <NativeSelect
                    id={`${formId}-item-${index}`}
                    className="w-full"
                    value={line.itemId}
                    onChange={(e) => updateLine(line.key, { itemId: e.target.value })}
                  >
                    <NativeSelectOption value="">Choose an item…</NativeSelectOption>
                    {grouped.map(
                      (group) =>
                        group.items.length > 0 && (
                          <NativeSelectOptGroup key={group.kind} label={KIND_LABELS[group.kind]}>
                            {group.items.map((i) => (
                              <NativeSelectOption key={i.id} value={i.id}>
                                {i.name} ({i.sku})
                              </NativeSelectOption>
                            ))}
                          </NativeSelectOptGroup>
                        ),
                    )}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-qty-${index}`}>
                    Quantity{item && item.unit !== "each" ? ` (${item.unit})` : ""}
                  </FieldLabel>
                  <Input
                    id={`${formId}-qty-${index}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={line.qty}
                    onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                  />
                </Field>
                {item?.trackBatches ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor={`${formId}-made-${index}`}>Baked / received</FieldLabel>
                      <Input
                        id={`${formId}-made-${index}`}
                        type="date"
                        value={line.producedOn}
                        onChange={(e) => updateLine(line.key, { producedOn: e.target.value })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${formId}-bb-${index}`}>Best before</FieldLabel>
                      <Input
                        id={`${formId}-bb-${index}`}
                        type="date"
                        value={line.bestBefore}
                        title={shelfHint}
                        onChange={(e) => updateLine(line.key, { bestBefore: e.target.value })}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground md:col-span-2 md:pb-2">
                    {item ? "No batches or best-before date for this item." : ""}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Leave the dates blank to use today as the bake date and the item&apos;s shelf
        life for best-before.
      </p>

      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setLines((c) => [...c, newLine()])}>
          <Plus />
          Add line
        </Button>
        <Button type="submit" size="lg" disabled={pending || !locationId}>
          {pending ? "Posting…" : "Post opening stock"}
        </Button>
      </div>
    </form>
  )
}
