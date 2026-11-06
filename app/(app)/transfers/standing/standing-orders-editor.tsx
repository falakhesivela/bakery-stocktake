"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowRight, CalendarPlus, CopyCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { WEEKDAYS } from "@/lib/dates"
import { formatQty } from "@/lib/format"
import {
  generateStandingTransfers,
  saveStandingOrders,
  suggestStandingOrder,
  type StandingSuggestion,
} from "../actions"

type Item = {
  id: string
  sku: string
  name: string
  kind: "product" | "ingredient" | "packaging"
  unit: "each" | "g" | "kg" | "ml" | "l"
}

type Loc = { id: string; code: string; name: string; type: "warehouse" | "store" }

const cellKey = (itemId: string, weekday: number) => `${itemId}|${weekday}`
const SUGGEST_WEEKS = 4
const round1 = (n: number) => formatQty(Math.round(n * 10) / 10)

export function StandingOrdersEditor({
  fromId,
  toId,
  locations,
  canEdit,
  canGenerate,
  routes,
  items,
  initial,
}: {
  fromId: string
  toId: string
  locations: Loc[]
  canEdit: boolean
  canGenerate: boolean
  routes: { fromId: string; toId: string; label: string; itemCount: number }[]
  items: Item[]
  initial: { itemId: string; weekday: number; qty: number }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [cells, setCells] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((r) => [cellKey(r.itemId, r.weekday), String(r.qty)])),
  )
  const [showAll, setShowAll] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Average sales behind each suggested quantity, shown under the box.
  const [hints, setHints] = useState<Record<string, StandingSuggestion>>({})
  const toLocation = locations.find((l) => l.id === toId)

  const usedItems = new Set(initial.map((r) => r.itemId))
  const shown = items.filter((i) => showAll || i.kind === "product" || usedItems.has(i.id))

  function goTo(nextFrom: string, nextTo: string) {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return
    const params = new URLSearchParams({ from: nextFrom, to: nextTo })
    router.replace(`${pathname}?${params}`, { scroll: false })
  }

  function setCell(itemId: string, weekday: number, value: string) {
    setCells((current) => ({ ...current, [cellKey(itemId, weekday)]: value }))
    setDirty(true)
  }

  function fillWeek(itemId: string) {
    const monday = cells[cellKey(itemId, 1)] ?? ""
    setCells((current) => {
      const next = { ...current }
      for (const day of WEEKDAYS) next[cellKey(itemId, day.value)] = monday
      return next
    })
    setDirty(true)
  }

  function save() {
    const rows: { itemId: string; weekday: number; qty: number }[] = []
    for (const [key, value] of Object.entries(cells)) {
      if (value === "") continue
      const qty = Number(value)
      if (Number.isNaN(qty) || qty < 0) return void toast.error("Quantities must be 0 or more.")
      const [itemId, weekday] = key.split("|")
      if (qty > 0) rows.push({ itemId, weekday: Number(weekday), qty })
    }
    startTransition(async () => {
      const result = await saveStandingOrders({ fromLocationId: fromId, toLocationId: toId, rows })
      if (!result.ok) return void toast.error(result.error)
      setDirty(false)
      toast.success(`Saved ${result.data.count} quantit${result.data.count === 1 ? "y" : "ies"}.`)
    })
  }

  function suggest() {
    startTransition(async () => {
      const result = await suggestStandingOrder({
        fromLocationId: fromId,
        toLocationId: toId,
        weeks: SUGGEST_WEEKS,
      })
      if (!result.ok) return void toast.error(result.error)
      const rows = result.data.rows
      if (rows.length === 0) {
        return void toast.info(`${toLocation?.code ?? "This store"} has no sales in the last ${SUGGEST_WEEKS} weeks to go on.`)
      }
      const itemIds = new Set(rows.map((r) => r.itemId))
      setCells((current) => {
        const next = { ...current }
        for (const id of itemIds) for (const day of WEEKDAYS) next[cellKey(id, day.value)] = ""
        for (const r of rows) next[cellKey(r.itemId, r.weekday)] = String(r.suggested)
        return next
      })
      setHints(Object.fromEntries(rows.map((r) => [cellKey(r.itemId, r.weekday), r])))
      setDirty(true)
      toast.success(
        `Filled in ${itemIds.size} item${itemIds.size === 1 ? "" : "s"} from average sales. Check the numbers, then save.`,
      )
    })
  }

  function generate() {
    startTransition(async () => {
      const result = await generateStandingTransfers()
      if (!result.ok) return void toast.error(result.error)
      toast.success(
        result.data.count > 0
          ? `Created ${result.data.count} order(s) for tomorrow.`
          : "Tomorrow's orders already exist (or there is nothing to order tomorrow).",
      )
    })
  }

  const dayTotal = (weekday: number) =>
    shown.reduce((sum, item) => sum + (Number(cells[cellKey(item.id, weekday)]) || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="standing-from">From</FieldLabel>
            <NativeSelect id="standing-from" value={fromId} onChange={(e) => goTo(e.target.value, toId)}>
              {locations.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.code} · {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <ArrowRight className="mb-2 size-5 text-muted-foreground" />
          <Field className="w-auto">
            <FieldLabel htmlFor="standing-to">To</FieldLabel>
            <NativeSelect id="standing-to" value={toId} onChange={(e) => goTo(fromId, e.target.value)}>
              {locations.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.code} · {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {canGenerate && (
            <Button variant="outline" className="ml-auto" onClick={generate} disabled={pending}>
              <CalendarPlus />
              Create tomorrow&apos;s orders now
            </Button>
          )}
        </CardContent>
      </Card>

      {routes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Routes with standing orders:</span>
          {routes.map((r) => (
            <Link
              key={`${r.fromId}|${r.toId}`}
              href={`${pathname}?from=${r.fromId}&to=${r.toId}`}
              onClick={(e) => {
                if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) {
                  e.preventDefault()
                }
              }}
            >
              <Badge variant={r.fromId === fromId && r.toId === toId ? "default" : "outline"}>
                {r.label} · {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {fromId === toId ? (
        <p className="text-sm text-muted-foreground">Choose two different locations.</p>
      ) : !canEdit ? (
        <p className="text-sm text-muted-foreground">
          You can only change standing orders for routes from or to a location you manage.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Switch id="standing-all" checked={showAll} onCheckedChange={setShowAll} />
              <label htmlFor="standing-all" className="text-sm">
                Show ingredients and packaging too
              </label>
            </div>
            {toLocation?.type === "store" && (
              <Button variant="outline" size="sm" className="sm:ml-auto" onClick={suggest} disabled={pending}>
                <Sparkles />
                Suggest from last {SUGGEST_WEEKS} weeks&apos; sales
              </Button>
            )}
          </div>
          {Object.keys(hints).length > 0 && (
            <p className="text-sm text-muted-foreground">
              Suggested quantities are what {toLocation?.code} sold on that weekday, on average, rounded up. The
              small number under each box is the average sold that day (hover over it for the average wasted).
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                {WEEKDAYS.map((d) => (
                  <TableHead key={d.value} className="text-center">
                    {d.short}
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-40">
                    <div className="font-medium">{item.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                  </TableCell>
                  {WEEKDAYS.map((d) => {
                    const hint = hints[cellKey(item.id, d.value)]
                    return (
                      <TableCell key={d.value} className="px-1 align-top">
                        <Input
                          aria-label={`${item.name} on ${d.long}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          className="w-16 text-center"
                          value={cells[cellKey(item.id, d.value)] ?? ""}
                          onChange={(e) => setCell(item.id, d.value, e.target.value)}
                        />
                        {hint && (
                          <div
                            className="mt-0.5 text-center text-[11px] text-muted-foreground tabular-nums"
                            title={`Average sold ${round1(hint.avgSold)}, wasted ${round1(hint.avgWasted)}`}
                          >
                            avg {round1(hint.avgSold)}
                          </div>
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Use Monday's quantity every day"
                      aria-label={`Use Monday's quantity of ${item.name} every day`}
                      onClick={() => fillWeek(item.id)}
                    >
                      <CopyCheck />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                {WEEKDAYS.map((d) => (
                  <TableCell key={d.value} className="text-center tabular-nums">
                    {formatQty(dayTotal(d.value))}
                  </TableCell>
                ))}
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
            <Button size="lg" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save standing order"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
