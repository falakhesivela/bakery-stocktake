"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { formatMoney, formatQty } from "@/lib/format"
import { saveRecipe, setCostFromRecipe } from "../actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Ingredient = {
  id: string
  sku: string
  name: string
  kind: "product" | "ingredient" | "packaging"
  unit: Unit
  cost: number | null
}

type Line = { key: number; itemId: string; qty: string }

const KIND_LABELS = {
  ingredient: "Ingredients",
  packaging: "Packaging",
  product: "Products (made in-house)",
} as const

const UNIT_WORDS: Record<Unit, string> = { each: "each", g: "g", kg: "kg", ml: "ml", l: "L" }

let nextKey = 1
const newLine = (itemId = "", qty = ""): Line => ({ key: nextKey++, itemId, qty })

export function RecipeForm({
  product,
  canEdit,
  canSetCost,
  hasRecipe,
  initial,
  ingredients,
  updatedBy,
}: {
  product: { id: string; name: string; unit: Unit; price: number | null; cost: number | null }
  canEdit: boolean
  canSetCost: boolean
  hasRecipe: boolean
  initial: { yieldQty: string; notes: string; lines: { itemId: string; qty: string }[] }
  ingredients: Ingredient[]
  updatedBy: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [yieldQty, setYieldQty] = useState(initial.yieldQty)
  const [notes, setNotes] = useState(initial.notes)
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.length ? initial.lines.map((l) => newLine(l.itemId, l.qty)) : [newLine()],
  )

  const byId = new Map(ingredients.map((i) => [i.id, i]))
  const yieldNum = Number(yieldQty) || 0
  const costed = lines
    .filter((l) => l.itemId && Number(l.qty) > 0)
    .map((l) => {
      const ing = byId.get(l.itemId)!
      return { ing, qty: Number(l.qty), cost: ing.cost === null ? null : ing.cost * Number(l.qty) }
    })
  const batchCost = costed.reduce((sum, c) => sum + (c.cost ?? 0), 0)
  const missingCost = costed.filter((c) => c.cost === null).length
  const unitCost = yieldNum > 0 ? batchCost / yieldNum : null
  const margin =
    unitCost !== null && product.price ? ((product.price - unitCost) / product.price) * 100 : null

  function update(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function save(remove = false) {
    const filled = remove ? [] : lines.filter((l) => l.itemId || l.qty)
    for (const l of filled) {
      if (!l.itemId) return void toast.error("Choose an ingredient on every line, or remove the empty line.")
      if (!(Number(l.qty) > 0)) return void toast.error(`Enter how much ${byId.get(l.itemId)?.name} is used.`)
    }
    if (!remove && filled.length === 0) return void toast.error("Add at least one ingredient.")
    startTransition(async () => {
      const result = await saveRecipe({
        productId: product.id,
        yieldQty: remove ? 1 : yieldNum,
        notes,
        lines: filled.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
      })
      if (!result.ok) return void toast.error(result.error)
      toast.success(remove ? "Recipe removed" : "Recipe saved")
      if (remove) setLines([newLine()])
    })
  }

  const grouped = (Object.keys(KIND_LABELS) as Ingredient["kind"][]).map((kind) => ({
    kind,
    items: ingredients.filter((i) => i.kind === kind),
  }))

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="recipe-yield">One round of this recipe makes</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="recipe-yield"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                className="w-28"
                value={yieldQty}
                disabled={!canEdit}
                onChange={(e) => setYieldQty(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">
                {product.unit === "each" ? product.name : `${UNIT_WORDS[product.unit]} of ${product.name}`}
              </span>
            </div>
          </Field>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_7rem_2rem] gap-2 text-xs font-medium text-muted-foreground">
              <span>Ingredient</span>
              <span>Amount</span>
              <span />
            </div>
            {lines.map((line, index) => {
              const ing = byId.get(line.itemId)
              return (
                <div key={line.key} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2">
                  <NativeSelect
                    aria-label={`Ingredient ${index + 1}`}
                    className="w-full"
                    value={line.itemId}
                    disabled={!canEdit}
                    onChange={(e) => update(line.key, { itemId: e.target.value })}
                  >
                    <NativeSelectOption value="">Choose…</NativeSelectOption>
                    {grouped.map(
                      (g) =>
                        g.items.length > 0 && (
                          <NativeSelectOptGroup key={g.kind} label={KIND_LABELS[g.kind]}>
                            {g.items.map((i) => (
                              <NativeSelectOption
                                key={i.id}
                                value={i.id}
                                disabled={i.id !== line.itemId && lines.some((l) => l.itemId === i.id)}
                              >
                                {i.name} ({UNIT_WORDS[i.unit]})
                              </NativeSelectOption>
                            ))}
                          </NativeSelectOptGroup>
                        ),
                    )}
                  </NativeSelect>
                  <div className="relative">
                    <Input
                      aria-label={`Amount ${index + 1}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="pr-9 text-right"
                      value={line.qty}
                      disabled={!canEdit}
                      onChange={(e) => update(line.key, { qty: e.target.value })}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
                      {ing ? UNIT_WORDS[ing.unit] : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ingredient ${index + 1}`}
                    disabled={!canEdit || lines.length === 1}
                    onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )
            })}
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setLines((c) => [...c, newLine()])}
              >
                <Plus />
                Add ingredient
              </Button>
            )}
          </div>

          <Field>
            <FieldLabel htmlFor="recipe-notes">Notes (optional)</FieldLabel>
            <Textarea
              id="recipe-notes"
              rows={2}
              value={notes}
              disabled={!canEdit}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Tin size, oven temperature"
            />
          </Field>

          {canEdit && (
            <div className="flex flex-wrap justify-between gap-2">
              {hasRecipe ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => save(true)}>
                  Remove recipe
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" size="lg" disabled={pending} onClick={() => save()}>
                {pending ? "Saving…" : "Save recipe"}
              </Button>
            </div>
          )}
          {updatedBy && <p className="text-xs text-muted-foreground">Last changed by {updatedBy}.</p>}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Cost to make</CardTitle>
          <CardDescription>From the ingredients&apos; cost prices in the catalogue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <ul className="space-y-1">
            {costed.map((c) => (
              <li key={c.ing.id} className="flex justify-between gap-2">
                <span>
                  {formatQty(c.qty, c.ing.unit)} {c.ing.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {c.cost === null ? "no cost" : formatMoney(c.cost)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>One round</span>
            <span className="tabular-nums">{formatMoney(batchCost)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Each {product.unit === "each" ? "one" : UNIT_WORDS[product.unit]}</span>
            <span className="tabular-nums">{unitCost === null ? "—" : formatMoney(unitCost)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Selling price</span>
            <span className="tabular-nums">{formatMoney(product.price)}</span>
          </div>
          {margin !== null && (
            <div className={`flex justify-between ${margin < 50 ? "text-amber-700 dark:text-amber-400" : ""}`}>
              <span>Margin</span>
              <span className="tabular-nums">{Math.round(margin)}%</span>
            </div>
          )}
          {missingCost > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {missingCost} ingredient{missingCost === 1 ? " has" : "s have"} no cost price, so the
              real cost is higher.
            </p>
          )}
          {canSetCost && unitCost !== null && hasRecipe && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Cost price in the catalogue: {formatMoney(product.cost)}. Waste and stock-take values
                use it.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || Math.abs((product.cost ?? -1) - unitCost) < 0.005}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setCostFromRecipe({ productId: product.id, cost: unitCost })
                    if (!result.ok) return void toast.error(result.error)
                    toast.success(`Cost price set to ${formatMoney(unitCost)}`)
                  })
                }
              >
                Use {formatMoney(unitCost)} as the cost price
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
