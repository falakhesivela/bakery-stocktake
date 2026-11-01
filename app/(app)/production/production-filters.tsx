"use client"

import { useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

type Filters = { location: string; day: string; due: string }

export function ProductionFilters({
  locations,
  current,
  today,
}: {
  locations: { id: string; code: string; name: string }[]
  current: Filters
  today: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  function apply(next: Partial<Filters>) {
    const merged = { ...current, ...next }
    const params = new URLSearchParams()
    if (merged.location !== locations[0]?.id) params.set("location", merged.location)
    if (merged.day && merged.day !== today) params.set("day", merged.day)
    if (merged.due) params.set("due", merged.due)
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false })
    })
  }

  return (
    <div
      className="flex flex-wrap items-end gap-3 data-pending:opacity-70"
      data-pending={pending || undefined}
    >
      {locations.length > 1 && (
        <Field className="w-auto">
          <FieldLabel htmlFor="production-location">Bakery</FieldLabel>
          <NativeSelect
            id="production-location"
            value={current.location}
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
      <Field className="w-auto">
        <FieldLabel htmlFor="production-due">Orders due by</FieldLabel>
        <Input
          id="production-due"
          type="date"
          value={current.due}
          onChange={(e) => e.target.value && apply({ due: e.target.value })}
        />
      </Field>
      <Field className="w-auto">
        <FieldLabel htmlFor="production-day">Show bakes on</FieldLabel>
        <Input
          id="production-day"
          type="date"
          max={today}
          value={current.day}
          onChange={(e) => e.target.value && apply({ day: e.target.value })}
        />
      </Field>
    </div>
  )
}
