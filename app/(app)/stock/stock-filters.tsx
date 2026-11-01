"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { ScanButton } from "@/components/scanner/scan-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Filters = {
  location: string
  kind: string
  q: string
  view: "batch" | "item"
}

export function StockFilters({
  locations,
  current,
}: {
  locations: { id: string; code: string; name: string }[]
  current: Filters
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(current.q)

  function apply(next: Partial<Filters>) {
    const merged = { ...current, q, ...next }
    const params = new URLSearchParams()
    if (merged.location) params.set("location", merged.location)
    if (merged.kind) params.set("kind", merged.kind)
    if (merged.q) params.set("q", merged.q)
    if (merged.view !== "batch") params.set("view", merged.view)
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`)
    })
  }

  return (
    <div
      className="flex flex-col gap-3 lg:flex-row lg:items-center"
      data-pending={pending || undefined}
    >
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
            placeholder="Search name, SKU, barcode or batch"
            className="pl-8"
            aria-label="Search stock"
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
          aria-label="Item type"
          value={current.kind}
          onChange={(e) => apply({ kind: e.target.value })}
        >
          <NativeSelectOption value="">All types</NativeSelectOption>
          <NativeSelectOption value="product">Products</NativeSelectOption>
          <NativeSelectOption value="ingredient">Ingredients</NativeSelectOption>
          <NativeSelectOption value="packaging">Packaging</NativeSelectOption>
        </NativeSelect>
        <Tabs
          value={current.view}
          onValueChange={(value) => apply({ view: value as Filters["view"] })}
        >
          <TabsList>
            <TabsTrigger value="batch">By batch</TabsTrigger>
            <TabsTrigger value="item">By item</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
