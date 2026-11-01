"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { ScanButton } from "@/components/scanner/scan-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"

type Filters = { q: string; kind: string; inactive: boolean }

export function CatalogueFilters({ current }: { current: Filters }) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [q, setQ] = useState(current.q)

  function apply(next: Partial<Filters>) {
    const merged = { ...current, q, ...next }
    const params = new URLSearchParams()
    if (merged.q) params.set("q", merged.q)
    if (merged.kind) params.set("kind", merged.kind)
    if (merged.inactive) params.set("inactive", "1")
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`))
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
            placeholder="Search name, SKU or barcode"
            className="pl-8"
            aria-label="Search catalogue"
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
      <div className="flex flex-wrap items-center gap-4">
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
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={current.inactive}
            onCheckedChange={(checked) => apply({ inactive: checked })}
          />
          <Label htmlFor="show-inactive">Show inactive</Label>
        </div>
      </div>
    </div>
  )
}
