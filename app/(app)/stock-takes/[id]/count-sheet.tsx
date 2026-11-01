"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate, formatQty } from "@/lib/format"
import { addCountByCode, addCountLine, setCount } from "../actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Line = {
  lineId: string
  itemId: string
  itemName: string
  sku: string
  unit: Unit
  category: string | null
  trackBatches: boolean
  batchCode: string | null
  bestBefore: string | null
  counted: number | null
  countedBy: string | null
  expected: number | null
  added: boolean
}

type Filter = "all" | "todo" | "done"

function without(drafts: Record<string, string>, key: string) {
  const next = { ...drafts }
  delete next[key]
  return next
}

export function CountSheet({
  stockTakeId,
  showExpected,
  lines,
  items,
}: {
  stockTakeId: string
  showExpected: boolean
  lines: Line[]
  items: { id: string; sku: string; name: string }[]
}) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  // Typed values not saved yet; everything else comes from the server.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Set<string>>(() => new Set())
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [addItemId, setAddItemId] = useState("")

  const countedLines = lines.filter((l) => l.counted !== null).length

  async function save(line: Line) {
    const draft = drafts[line.lineId]
    if (draft === undefined) return
    const counted = draft.trim() === "" ? null : Number(draft)
    if (counted !== null && (Number.isNaN(counted) || counted < 0)) {
      return void toast.error("Counts must be 0 or more.")
    }
    if (counted === line.counted) {
      setDrafts((d) => without(d, line.lineId))
      return
    }
    setSaving((s) => new Set(s).add(line.lineId))
    const result = await setCount({ lineId: line.lineId, counted })
    setSaving((s) => {
      const next = new Set(s)
      next.delete(line.lineId)
      return next
    })
    if (!result.ok) return void toast.error(result.error)
    setDrafts((d) => without(d, line.lineId))
    setJustSaved(line.lineId)
  }

  async function onScan(code: string) {
    const result = await addCountByCode({ stockTakeId, code })
    if (!result.ok) return void toast.error(result.error)
    toast.success(
      `${result.data.itemName}${result.data.batchCode ? ` (${result.data.batchCode})` : ""}: ${formatQty(result.data.counted)}`,
    )
  }

  async function addItem() {
    if (!addItemId) return
    const result = await addCountLine({ stockTakeId, itemId: addItemId })
    if (!result.ok) return void toast.error(result.error)
    setAddItemId("")
    toast.success("Added to the list. Enter how many you found.")
  }

  const q = search.trim().toLowerCase()
  const shown = lines.filter((l) => {
    if (filter === "todo" && l.counted !== null) return false
    if (filter === "done" && l.counted === null) return false
    if (!q) return true
    return [l.itemName, l.sku, l.batchCode ?? ""].some((v) => v.toLowerCase().includes(q))
  })

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            Counted {countedLines} of {lines.length}
          </CardTitle>
          <div className="flex gap-2">
            <ScanButton label="Scan to count" title="Scan a batch label (adds 1)" onScan={onScan} />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh counts from others"
              title="Refresh counts from others"
              disabled={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${lines.length ? (countedLines / lines.length) * 100 : 0}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="todo">To count ({lines.length - countedLines})</TabsTrigger>
              <TabsTrigger value="done">Counted</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find item or batch"
              className="pl-8"
              aria-label="Find item or batch"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="divide-y rounded-lg border">
          {shown.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Nothing to show.</p>
          )}
          {shown.map((line, index) => {
            const header =
              index === 0 || shown[index - 1].category !== line.category ? (
                <div className="bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {line.category ?? "No category"}
                </div>
              ) : null
            const value = drafts[line.lineId] ?? (line.counted === null ? "" : String(line.counted))
            const diff =
              showExpected && line.counted !== null && line.expected !== null && drafts[line.lineId] === undefined
                ? line.counted - line.expected
                : null
            return (
              <div key={line.lineId}>
                {header}
                <div className="grid grid-cols-[1fr_6rem_1.25rem] items-center gap-2 px-3 py-2">
                  <label htmlFor={`count-${line.lineId}`} className="min-w-0">
                    <div className="truncate font-medium">{line.itemName}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{line.batchCode ?? (line.trackBatches ? "No label" : line.sku)}</span>
                      {line.bestBefore && ` · best before ${formatDate(line.bestBefore)}`}
                      {showExpected && line.expected !== null && ` · expected ${formatQty(line.expected, line.unit)}`}
                      {diff !== null && diff !== 0 && (
                        <span className={diff < 0 ? "text-destructive" : "text-green-700 dark:text-green-400"}>
                          {" "}
                          ({diff > 0 ? "+" : ""}
                          {formatQty(diff, line.unit)})
                        </span>
                      )}
                      {line.added && " · found while counting"}
                    </div>
                  </label>
                  <Input
                    id={`count-${line.lineId}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="—"
                    className="text-right text-base"
                    value={value}
                    onChange={(e) => setDrafts((d) => ({ ...d, [line.lineId]: e.target.value }))}
                    onBlur={() => save(line)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                    }}
                  />
                  <span className="flex justify-center" aria-live="polite">
                    {saving.has(line.lineId) ? (
                      <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />
                    ) : line.counted !== null && drafts[line.lineId] === undefined ? (
                      <Check
                        className={`size-4 ${justSaved === line.lineId ? "text-green-600" : "text-muted-foreground"}`}
                        aria-label={line.countedBy ? `Counted by ${line.countedBy}` : "Counted"}
                      />
                    ) : null}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Found something not on the list?</span>
          <NativeSelect
            aria-label="Item to add"
            value={addItemId}
            onChange={(e) => setAddItemId(e.target.value)}
          >
            <NativeSelectOption value="">Choose an item…</NativeSelectOption>
            {items.map((i) => (
              <NativeSelectOption key={i.id} value={i.id}>
                {i.name} ({i.sku})
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button type="button" variant="outline" disabled={!addItemId} onClick={addItem}>
            <Plus />
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Counts save as you go, so several people can count at once. Batch labels can be
          scanned: each scan adds one. Leave a line empty if you didn&apos;t count it.
        </p>
      </CardContent>
    </Card>
  )
}
