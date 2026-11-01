"use client"

import Link from "next/link"
import { useId, useRef, useState, useTransition } from "react"
import { CircleCheck, Printer } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { addDays } from "@/lib/dates"
import { formatDate, formatQty } from "@/lib/format"
import { useResetOnHide } from "@/hooks/use-reset-on-hide"
import { logProduction } from "./actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Item = {
  id: string
  sku: string
  name: string
  unit: Unit
  trackBatches: boolean
  shelfLifeDays: number | null
  barcodes: string[]
}

type PlanRow = {
  itemId: string
  sku: string
  name: string
  unit: Unit
  needed: number
  usableStock: number
  toMake: number
}

type LastBake = {
  itemName: string
  unit: Unit
  qty: number
  batchId: string | null
  batchCode: string | null
  ingredientsUsed: number
}

type Recipe = {
  yieldQty: number
  lines: { itemId: string; name: string; unit: Unit; qty: number; inStock: number }[]
}

type IngredientNeed = {
  itemId: string
  name: string
  unit: Unit
  needed: number
  inStock: number
  short: number
}

/** Rounds a quantity for display (3 decimals is enough for kg). */
const round3 = (n: number) => Math.round(n * 1000) / 1000

export function ProductionWorkspace({
  locationId,
  today,
  dueLabel,
  items,
  plan,
  recipes,
  ingredientNeeds,
}: {
  locationId: string
  today: string
  dueLabel: string
  items: Item[]
  plan: PlanRow[]
  recipes: Record<string, Recipe>
  ingredientNeeds: IngredientNeed[]
}) {
  const formId = useId()
  const formRef = useRef<HTMLDivElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [itemId, setItemId] = useState("")
  const [qty, setQty] = useState("")
  const [producedOn, setProducedOn] = useState("")
  const [bestBefore, setBestBefore] = useState("")
  const [note, setNote] = useState("")
  const [useRecipe, setUseRecipe] = useState(true)
  const [last, setLast] = useState<LastBake | null>(null)
  const resetOnHide = useResetOnHide()

  const item = items.find((i) => i.id === itemId)
  const recipe = item ? recipes[item.id] : undefined
  const defaultBestBefore =
    item?.trackBatches && item.shelfLifeDays !== null
      ? addDays(producedOn || today, item.shelfLifeDays)
      : null

  function choose(nextItemId: string, nextQty?: number) {
    setItemId(nextItemId)
    setBestBefore("")
    if (nextQty !== undefined) setQty(nextQty > 0 ? String(nextQty) : "")
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setTimeout(() => qtyRef.current?.focus(), 300)
  }

  function chooseByCode(code: string) {
    const c = code.trim().toLowerCase()
    const found = items.find(
      (i) => i.sku.toLowerCase() === c || i.barcodes.some((b) => b.toLowerCase() === c),
    )
    if (!found) return void toast.error(`No product has the code “${code}”.`)
    choose(found.id)
  }

  function submit() {
    if (!item) return void toast.error("Choose what you baked.")
    const amount = qty === "" ? Number.NaN : Number(qty)
    startTransition(async () => {
      const result = await logProduction({
        locationId,
        itemId,
        qty: amount,
        producedOn,
        bestBefore,
        note,
        useRecipe,
      })
      if (!result.ok) return void toast.error(result.error)
      setLast({
        itemName: item.name,
        unit: item.unit,
        qty: amount,
        batchId: result.data.batchId,
        batchCode: result.data.batchCode,
        ingredientsUsed: result.data.ingredientsUsed,
      })
      toast.success(`Logged ${formatQty(amount, item.unit)} ${item.name}`)
      resetOnHide(() => {
        setLast(null)
        setItemId("")
        setProducedOn("")
      })
      setQty("")
      setNote("")
      setBestBefore("")
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div ref={formRef} className="scroll-mt-16">
        <Card>
          <CardHeader>
            <CardTitle>Log a bake</CardTitle>
            <CardDescription>
              Adds the stock here and creates a batch you can label.
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
              {last && (
                <Alert>
                  <CircleCheck />
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Logged {formatQty(last.qty, last.unit)} {last.itemName}
                      {last.batchCode && (
                        <>
                          {" "}as batch <span className="font-mono">{last.batchCode}</span>
                        </>
                      )}
                      .
                      {last.ingredientsUsed > 0 &&
                        ` ${last.ingredientsUsed} ingredient${last.ingredientsUsed === 1 ? "" : "s"} taken out of stock.`}
                    </span>
                    {last.batchId && (
                      <Link
                        href={`/labels/print?type=batch&id=${last.batchId}&copies=${Math.min(200, Math.ceil(last.qty))}&back=/production`}
                        className={buttonVariants({ size: "sm" })}
                      >
                        <Printer />
                        Print {Math.min(200, Math.ceil(last.qty))} label
                        {Math.ceil(last.qty) === 1 ? "" : "s"}
                      </Link>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`${formId}-item`}>Product</FieldLabel>
                  <ScanButton size="sm" label="Scan" onScan={chooseByCode} />
                </div>
                <NativeSelect
                  id={`${formId}-item`}
                  className="w-full"
                  value={itemId}
                  onChange={(e) => choose(e.target.value)}
                >
                  <NativeSelectOption value="">Choose a product…</NativeSelectOption>
                  {items.map((i) => (
                    <NativeSelectOption key={i.id} value={i.id}>
                      {i.name} ({i.sku})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${formId}-qty`}>
                    How many{item && item.unit !== "each" ? ` (${item.unit})` : ""}
                  </FieldLabel>
                  <Input
                    ref={qtyRef}
                    id={`${formId}-qty`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    required
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="text-lg"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-made`}>Baked on</FieldLabel>
                  <Input
                    id={`${formId}-made`}
                    type="date"
                    max={today}
                    value={producedOn || today}
                    onChange={(e) => setProducedOn(e.target.value === today ? "" : e.target.value)}
                  />
                </Field>
              </div>

              {item?.trackBatches && (
                <Field>
                  <FieldLabel htmlFor={`${formId}-bb`}>Best before</FieldLabel>
                  <Input
                    id={`${formId}-bb`}
                    type="date"
                    min={producedOn || today}
                    value={bestBefore || defaultBestBefore || ""}
                    onChange={(e) =>
                      setBestBefore(e.target.value === defaultBestBefore ? "" : e.target.value)
                    }
                  />
                  <FieldDescription>
                    {item.shelfLifeDays !== null
                      ? `Normally ${item.shelfLifeDays} day(s) after baking.`
                      : "This product has no shelf life set. Enter a date or leave it empty."}
                  </FieldDescription>
                </Field>
              )}

              {item && recipe && (
                <div className="rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Switch checked={useRecipe} onCheckedChange={setUseRecipe} />
                    Take the ingredients out of stock
                  </label>
                  {useRecipe && (
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {recipe.lines.map((line) => {
                        const use = round3((line.qty * (Number(qty) || 0)) / recipe.yieldQty)
                        const short = use > Math.max(line.inStock, 0)
                        return (
                          <li key={line.itemId} className="flex justify-between gap-2">
                            <span>{line.name}</span>
                            <span
                              className={`tabular-nums ${short ? "font-medium text-destructive" : "text-muted-foreground"}`}
                            >
                              {formatQty(use, line.unit)}
                              <span className="text-xs"> of {formatQty(line.inStock, line.unit)}</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {useRecipe && recipe.lines.some((l) => (l.qty * (Number(qty) || 0)) / recipe.yieldQty > Math.max(l.inStock, 0)) && (
                    <p className="mt-2 text-xs text-destructive">
                      Not enough of some ingredients on record. The bake still saves; those
                      ingredients go negative until a delivery or count fixes them.
                    </p>
                  )}
                </div>
              )}
              {item && !recipe && (
                <p className="text-xs text-muted-foreground">
                  No recipe for {item.name}, so no ingredients are taken out.{" "}
                  <Link href={`/recipes/${item.id}`} className="underline">
                    Add a recipe
                  </Link>
                </p>
              )}

              <Field>
                <FieldLabel htmlFor={`${formId}-note`}>Note (optional)</FieldLabel>
                <Input
                  id={`${formId}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Oven 2, extra for the weekend"
                />
              </Field>

              <Button type="submit" size="lg" disabled={pending || !itemId}>
                {pending ? "Saving…" : "Log bake"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>To bake for orders due by {dueLabel.toLowerCase()}</CardTitle>
          <CardDescription>
            Open transfers from here (requests, standing orders and pushes not yet
            dispatched), minus stock that will still be fresh.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plan.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No open orders due by then.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Ordered</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">In stock</TableHead>
                  <TableHead className="text-right">To bake</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.map((row) => (
                  <TableRow key={row.itemId}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{row.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{row.sku}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        Ordered {formatQty(row.needed, row.unit)} · in stock{" "}
                        {formatQty(row.usableStock, row.unit)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatQty(row.needed, row.unit)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {formatQty(row.usableStock, row.unit)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${row.toMake > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {row.toMake > 0 ? formatQty(row.toMake, row.unit) : "Enough"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={row.toMake > 0 ? "default" : "outline"}
                        onClick={() => choose(row.itemId, row.toMake)}
                        disabled={!items.some((i) => i.id === row.itemId)}
                      >
                        Bake
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Stock counts if its best-before is on or after the due date. Due dates
            before {formatDate(today)} are included until they are dispatched.
          </p>

          {ingredientNeeds.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium">Ingredients for this bake list</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead className="text-right">Needed</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="text-right">Short</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredientNeeds.map((n) => (
                    <TableRow key={n.itemId}>
                      <TableCell className="whitespace-normal">{n.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty(n.needed, n.unit)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatQty(n.inStock, n.unit)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${n.short > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                      >
                        {n.short > 0 ? formatQty(n.short, n.unit) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
