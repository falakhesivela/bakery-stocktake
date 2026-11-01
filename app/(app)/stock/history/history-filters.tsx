"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { ScanButton } from "@/components/scanner/scan-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { MOVEMENT_LABELS, type MovementType } from "@/lib/movements"

type Filters = { location: string; type: string; q: string }

export function HistoryFilters({
  locations,
  current,
  itemFilter,
}: {
  locations: { id: string; code: string; name: string }[]
  current: Filters
  itemFilter: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(current.q)

  function apply(next: Partial<Filters>, keepItem = true) {
    const merged = { ...current, q, ...next }
    const params = new URLSearchParams()
    if (merged.location) params.set("location", merged.location)
    if (merged.type) params.set("type", merged.type)
    if (merged.q) params.set("q", merged.q)
    if (keepItem && itemFilter && !merged.q) {
      const item = new URLSearchParams(window.location.search).get("item")
      if (item) params.set("item", item)
    }
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false })
    })
  }

  return (
    <div
      className="flex flex-col gap-3 data-pending:opacity-70 lg:flex-row lg:items-center"
      data-pending={pending || undefined}
    >
      {itemFilter ? (
        <Badge variant="secondary" className="h-8 gap-2 px-3 text-sm">
          {itemFilter}
          <button type="button" aria-label="Clear item filter" onClick={() => apply({ q: "" }, false)}>
            <X className="size-3.5" />
          </button>
        </Badge>
      ) : (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            apply({ q })
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Item name, SKU, barcode or batch"
              className="pl-8"
              aria-label="Search history"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <ScanButton
            size="icon"
            label="Scan to search"
            onScan={(code) => {
              setQ(code)
              apply({ q: code })
            }}
          />
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <NativeSelect
          aria-label="Location"
          value={current.location}
          onChange={(e) => apply({ location: e.target.value })}
        >
          <NativeSelectOption value="">All my locations</NativeSelectOption>
          {locations.map((l) => (
            <NativeSelectOption key={l.id} value={l.id}>
              {l.code} · {l.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Type of change"
          value={current.type}
          onChange={(e) => apply({ type: e.target.value })}
        >
          <NativeSelectOption value="">All changes</NativeSelectOption>
          {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((t) => (
            <NativeSelectOption key={t} value={t}>
              {MOVEMENT_LABELS[t]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  )
}
