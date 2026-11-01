"use client"

import { useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type TransferTab = "needs" | "open" | "transit" | "done"

export function TransferFilters({
  tab,
  location,
  locations,
  counts,
}: {
  tab: TransferTab
  location: string
  locations: { id: string; code: string; name: string }[]
  counts: { needs: number; open: number; transit: number }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  function apply(next: { tab?: TransferTab; location?: string }) {
    const merged = { tab, location, ...next }
    const params = new URLSearchParams()
    if (merged.tab !== "open") params.set("tab", merged.tab)
    if (merged.location) params.set("location", merged.location)
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false })
    })
  }

  return (
    <div
      className="flex flex-col gap-3 data-pending:opacity-70 sm:flex-row sm:items-center sm:justify-between"
      data-pending={pending || undefined}
    >
      <Tabs value={tab} onValueChange={(value) => apply({ tab: value as TransferTab })}>
        <TabsList>
          <TabsTrigger value="needs">Needs me ({counts.needs})</TabsTrigger>
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="transit">On the way ({counts.transit})</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
        </TabsList>
      </Tabs>
      {locations.length > 1 && (
        <NativeSelect
          aria-label="Location"
          value={location}
          onChange={(e) => apply({ location: e.target.value })}
        >
          <NativeSelectOption value="">All my locations</NativeSelectOption>
          {locations.map((l) => (
            <NativeSelectOption key={l.id} value={l.id}>
              {l.code} · {l.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </div>
  )
}
