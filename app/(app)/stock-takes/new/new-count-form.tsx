"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { addDays } from "@/lib/dates"
import type { StockTakeScope } from "@/lib/store-ops"
import { startStockTake } from "../actions"

const SCOPES: { value: StockTakeScope; title: string; description: string }[] = [
  {
    value: "products",
    title: "Closing count of products",
    description: "Cakes, bread and pastries. The quick end-of-day count.",
  },
  { value: "all", title: "Everything", description: "Products, ingredients and packaging." },
  { value: "categories", title: "Chosen categories", description: "For example only the cakes, or only packaging." },
]

export function NewCountForm({
  locations,
  defaultLocationId,
  categories,
}: {
  locations: { id: string; code: string; name: string; today: string }[]
  defaultLocationId: string
  categories: { id: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const [locationId, setLocationId] = useState(defaultLocationId)
  const today = locations.find((l) => l.id === locationId)?.today ?? locations[0].today
  const [countDate, setCountDate] = useState(today)
  const [scope, setScope] = useState<StockTakeScope>("products")
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [blind, setBlind] = useState(false)
  const [note, setNote] = useState("")

  function submit() {
    if (scope === "categories" && categoryIds.length === 0) {
      return void toast.error("Choose at least one category.")
    }
    startTransition(async () => {
      const result = await startStockTake({ locationId, countDate, scope, categoryIds, blind, note })
      // On success the action opens the count; we only get here on errors.
      if (result && !result.ok) toast.error(result.error)
    })
  }

  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Card>
        <CardContent>
          <FieldGroup>
            {locations.length > 1 && (
              <Field>
                <FieldLabel htmlFor="count-location">Location</FieldLabel>
                <NativeSelect
                  id="count-location"
                  className="w-full"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  {locations.map((l) => (
                    <NativeSelectOption key={l.id} value={l.id}>
                      {l.code} · {l.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="count-date">Closing stock of</FieldLabel>
              <Input
                id="count-date"
                type="date"
                className="w-fit"
                min={addDays(today, -7)}
                max={today}
                value={countDate}
                onChange={(e) => setCountDate(e.target.value || today)}
              />
              <FieldDescription>
                The day this count closes. Counting before opening in the morning? Choose
                yesterday: nothing changes overnight.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FieldSet>
            <FieldLegend>What to count</FieldLegend>
            <div className="flex flex-col gap-2">
              {SCOPES.map((s) => (
                <label
                  key={s.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${scope === s.value ? "border-primary bg-muted/50" : ""}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={s.value}
                    checked={scope === s.value}
                    onChange={() => setScope(s.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-sm text-muted-foreground">{s.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {scope === "categories" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(c.id)}
                      onChange={(e) =>
                        setCategoryIds((current) =>
                          e.target.checked ? [...current, c.id] : current.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch id="count-blind" checked={blind} onCheckedChange={setBlind} />
              <div>
                <FieldLabel htmlFor="count-blind">Blind count</FieldLabel>
                <FieldDescription>
                  Counters don&apos;t see how many the system expects, so they count what&apos;s
                  really there. Managers still see it when reviewing.
                </FieldDescription>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="count-note">Note (optional)</FieldLabel>
              <Input
                id="count-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="e.g. Monthly full count"
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-fit" disabled={pending}>
        {pending ? "Starting…" : "Start counting"}
      </Button>
    </form>
  )
}
