"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { addDays } from "@/lib/dates"
import { REPORTS, type ReportType } from "./report-types"

/** Report, location and date range pickers that update the page's search params. */
export function ReportFilters({
  report,
  locations,
  location,
  from,
  to,
  today,
}: {
  report: ReportType
  locations: { id: string; code: string; name: string }[]
  location: string
  from: string
  to: string
  today: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function apply(next: { report?: string; location?: string; from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }))
  }

  const ranges = [
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "Last 4 weeks", from: addDays(today, -27), to: today },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ]
  const showDates = report !== "stock-value"

  return (
    <div
      className="flex flex-wrap items-end gap-3 data-pending:opacity-70"
      data-pending={pending || undefined}
    >
      <Field className="w-auto">
        <FieldLabel htmlFor="report-type">Report</FieldLabel>
        <NativeSelect id="report-type" value={report} onChange={(e) => apply({ report: e.target.value })}>
          {REPORTS.map((r) => (
            <NativeSelectOption key={r.value} value={r.value}>
              {r.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {locations.length > 1 && (
        <Field className="w-auto">
          <FieldLabel htmlFor="report-location">Location</FieldLabel>
          <NativeSelect
            id="report-location"
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
        </Field>
      )}
      {showDates && (
        <>
          <Field className="w-auto">
            <FieldLabel htmlFor="report-from">From</FieldLabel>
            <Input
              id="report-from"
              type="date"
              max={to}
              value={from}
              onChange={(e) => e.target.value && apply({ from: e.target.value })}
            />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="report-to">To</FieldLabel>
            <Input
              id="report-to"
              type="date"
              min={from}
              max={today}
              value={to}
              onChange={(e) => e.target.value && apply({ to: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-1">
            {ranges.map((r) => (
              <Button
                key={r.label}
                type="button"
                size="sm"
                variant={r.from === from && r.to === to ? "secondary" : "ghost"}
                onClick={() => apply({ from: r.from, to: r.to })}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
