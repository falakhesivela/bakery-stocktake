"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

/** Location and day pickers that update the page's ?location= and ?date=. */
export function LocationDateFilter({
  locations,
  location,
  date,
  today,
  dateLabel = "Day",
  showDate = true,
}: {
  locations: { id: string; code: string; name: string }[]
  location: string
  date?: string
  today: string
  dateLabel?: string
  showDate?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function apply(next: { location?: string; date?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.location !== undefined) params.set("location", next.location)
    if (next.date !== undefined) {
      if (next.date && next.date !== today) params.set("date", next.date)
      else params.delete("date")
    }
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false })
    })
  }

  if (locations.length <= 1 && !showDate) return null

  return (
    <div
      className="flex flex-wrap items-end gap-3 data-pending:opacity-70"
      data-pending={pending || undefined}
    >
      {locations.length > 1 && (
        <Field className="w-auto">
          <FieldLabel htmlFor="filter-location">Location</FieldLabel>
          <NativeSelect
            id="filter-location"
            value={location}
            onChange={(e) => apply({ location: e.target.value })}
          >
            {locations.map((l) => (
              <NativeSelectOption key={l.id} value={l.id}>
                {l.code} · {l.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {showDate && (
        <Field className="w-auto">
          <FieldLabel htmlFor="filter-date">{dateLabel}</FieldLabel>
          <Input
            id="filter-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => e.target.value && apply({ date: e.target.value })}
          />
        </Field>
      )}
    </div>
  )
}
