"use client"

import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatQty } from "@/lib/format"
import { saveLevels } from "./actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"
type Kind = "product" | "ingredient" | "packaging"

type Item = {
  id: string
  sku: string
  name: string
  kind: Kind
  unit: Unit
  onHand: number
  reorderLevel: string
  parLevel: string
}

export function LevelsEditor({
  locationId,
  defaultKind,
  items,
}: {
  locationId: string
  defaultKind: Kind
  items: Item[]
}) {
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<Kind | "all">(defaultKind)
  const [search, setSearch] = useState("")
  // Edited values only; untouched rows show what's saved.
  const [edits, setEdits] = useState<Record<string, { reorderLevel: string; parLevel: string }>>({})

  const value = (item: Item) => edits[item.id] ?? { reorderLevel: item.reorderLevel, parLevel: item.parLevel }
  const changed = items.filter((i) => {
    const e = edits[i.id]
    return e && (e.reorderLevel !== i.reorderLevel || e.parLevel !== i.parLevel)
  })

  function edit(item: Item, patch: Partial<{ reorderLevel: string; parLevel: string }>) {
    setEdits((current) => ({ ...current, [item.id]: { ...value(item), ...patch } }))
  }

  function save() {
    const rows = changed.map((i) => {
      const e = value(i)
      return {
        itemId: i.id,
        reorderLevel: e.reorderLevel === "" ? null : Number(e.reorderLevel),
        parLevel: e.parLevel === "" ? null : Number(e.parLevel),
      }
    })
    if (rows.some((r) => Number.isNaN(r.reorderLevel) || Number.isNaN(r.parLevel))) {
      return void toast.error("Levels must be numbers.")
    }
    startTransition(async () => {
      const result = await saveLevels({ locationId, rows })
      if (!result.ok) return void toast.error(result.error)
      setEdits({})
      toast.success(`Saved ${rows.length} level${rows.length === 1 ? "" : "s"}`)
    })
  }

  const q = search.trim().toLowerCase()
  const shown = items.filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind | "all")}>
          <TabsList>
            <TabsTrigger value="product">Products</TabsTrigger>
            <TabsTrigger value="ingredient">Ingredients</TabsTrigger>
            <TabsTrigger value="packaging">Packaging</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find an item"
            className="pl-8"
            aria-label="Find an item"
          />
        </div>
      </div>

      <div className="divide-y rounded-lg border">
        <div className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_6rem_6.5rem_6.5rem]">
          <span>Item</span>
          <span className="hidden text-right sm:block">On hand</span>
          <span>Reorder at</span>
          <span>Order up to</span>
        </div>
        {shown.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing to show.</p>}
        {shown.map((item) => {
          const v = value(item)
          const low = v.reorderLevel !== "" && item.onHand <= Number(v.reorderLevel)
          return (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_6rem_6.5rem_6.5rem]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{item.sku}</span>
                  <span className={`sm:hidden ${low ? "text-destructive" : ""}`}>
                    {" "}
                    · {formatQty(item.onHand, item.unit)} here
                  </span>
                </div>
              </div>
              <div
                className={`hidden text-right text-sm tabular-nums sm:block ${low ? "font-semibold text-destructive" : "text-muted-foreground"}`}
              >
                {formatQty(item.onHand, item.unit)}
              </div>
              <Input
                aria-label={`${item.name} reorder level`}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="—"
                value={v.reorderLevel}
                onChange={(e) => edit(item, { reorderLevel: e.target.value })}
              />
              <Input
                aria-label={`${item.name} par level`}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="—"
                value={v.parLevel}
                onChange={(e) => edit(item, { parLevel: e.target.value })}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        {changed.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
          </span>
        )}
        <Button size="lg" disabled={pending || changed.length === 0} onClick={save}>
          {pending ? "Saving…" : "Save levels"}
        </Button>
      </div>
    </div>
  )
}
