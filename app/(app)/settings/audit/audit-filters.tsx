"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

export function AuditFilters({
  areas,
  people,
  area,
  who,
}: {
  areas: { value: string; label: string }[]
  people: { id: string; name: string }[]
  area: string
  who: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function apply(key: "area" | "who", value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("before")
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }))
  }

  return (
    <div className="flex flex-wrap items-end gap-3 data-pending:opacity-70" data-pending={pending || undefined}>
      <Field className="w-auto">
        <FieldLabel htmlFor="audit-area">Area</FieldLabel>
        <NativeSelect id="audit-area" value={area} onChange={(e) => apply("area", e.target.value)}>
          <NativeSelectOption value="">Everything</NativeSelectOption>
          {areas.map((a) => (
            <NativeSelectOption key={a.value} value={a.value}>
              {a.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field className="w-auto">
        <FieldLabel htmlFor="audit-who">Changed by</FieldLabel>
        <NativeSelect id="audit-who" value={who} onChange={(e) => apply("who", e.target.value)}>
          <NativeSelectOption value="">Anyone</NativeSelectOption>
          {people.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </div>
  )
}
