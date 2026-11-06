"use client"

import Link from "next/link"
import { useId, useState, useTransition } from "react"
import { CakeSlice, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PhotoInput } from "@/components/photo-input"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useResetOnHide } from "@/hooks/use-reset-on-hide"
import { formatMoney } from "@/lib/format"
import { CAKE_FIELDS, type CakeDetails } from "@/lib/orders"
import { uploadOrderPhoto } from "@/lib/photos"
import { findCustomer, saveOrder } from "./actions"

type Item = {
  id: string
  sku: string
  name: string
  price: number | null
  madeToOrder: boolean
}

type Loc = { id: string; code: string; name: string; canProduce: boolean; today: string }

type Line = {
  key: number
  custom: boolean
  itemId: string
  qty: string
  unitPrice: string
  details: CakeDetails
  photo: Blob | null
  photoPath: string | null
  photoUrl: string | null
}

export type OrderFormInitial = {
  id?: string
  customerName: string
  customerPhone: string
  customerEmail: string
  takenAtLocationId: string
  pickupLocationId: string
  fulfilLocationId: string
  pickupDate: string
  pickupTime: string
  notes: string
  deposit: string
  lines: {
    itemId: string
    custom: boolean
    qty: string
    unitPrice: string
    details: CakeDetails
    photoPath: string | null
    photoUrl: string | null
  }[]
}

let nextKey = 1
const newLine = (patch: Partial<Line> = {}): Line => ({
  key: nextKey++,
  custom: false,
  itemId: "",
  qty: "1",
  unitPrice: "",
  details: {},
  photo: null,
  photoPath: null,
  photoUrl: null,
  ...patch,
})

export function OrderForm({
  initial,
  takenAtOptions,
  pickupOptions,
  bakeries,
  items,
  isNew,
  cancelHref,
}: {
  initial: OrderFormInitial
  takenAtOptions: { id: string; code: string; name: string }[]
  pickupOptions: Loc[]
  bakeries: { id: string; code: string; name: string }[]
  items: Item[]
  isNew: boolean
  cancelHref: string
}) {
  const formId = useId()
  const [pending, startTransition] = useTransition()
  const resetOnHide = useResetOnHide()
  const [form, setForm] = useState(() => ({ ...initial }))
  const [returning, setReturning] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.length
      ? initial.lines.map((l) => newLine({ ...l, photo: null }))
      : [newLine({ custom: true, itemId: items.find((i) => i.madeToOrder)?.id ?? "" })],
  )

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const byId = new Map(items.map((i) => [i.id, i]))
  const customItems = items.filter((i) => i.madeToOrder)
  const shelfItems = items.filter((i) => !i.madeToOrder)
  const pickup = pickupOptions.find((l) => l.id === form.pickupLocationId)
  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)
  const deposit = Number(form.deposit) || 0

  function update(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function choosePickup(id: string) {
    const loc = pickupOptions.find((l) => l.id === id)
    // A store that bakes makes its own orders; otherwise the first bakery does.
    const fulfil = loc?.canProduce ? id : form.fulfilLocationId === form.pickupLocationId ? bakeries[0]?.id ?? id : form.fulfilLocationId
    set({ pickupLocationId: id, fulfilLocationId: fulfil })
  }

  async function lookUp(phone: string) {
    if (!isNew || phone.replace(/\D/g, "").length < 6) return
    const result = await findCustomer(phone)
    if (!result.ok || !result.data) return setReturning(null)
    const { name, email, orders } = result.data
    setReturning(`Returning customer: ${name}${orders ? `, ${orders} earlier order${orders === 1 ? "" : "s"}` : ""}`)
    setForm((f) => ({
      ...f,
      customerName: f.customerName || name,
      customerEmail: f.customerEmail || email || "",
    }))
  }

  function submit(confirm: boolean) {
    const filled = lines.filter((l) => l.itemId)
    if (filled.length === 0) return void toast.error("Add at least one item to the order.")
    for (const l of filled) {
      const name = byId.get(l.itemId)?.name ?? "an item"
      if (!(Number(l.qty) > 0)) return void toast.error(`Enter how many ${name} the customer wants.`)
      if (l.unitPrice === "" || !(Number(l.unitPrice) >= 0)) return void toast.error(`Enter a price for the ${name}.`)
    }
    if (!form.customerName.trim()) return void toast.error("Enter the customer's name.")

    // On success the action opens the order; reset this form for next time.
    if (isNew) {
      resetOnHide(() => {
        setForm({ ...initial })
        setLines([newLine({ custom: true, itemId: customItems[0]?.id ?? "" })])
        setReturning(null)
      })
    }
    startTransition(async () => {
      let payload
      try {
        payload = await Promise.all(
          filled.map(async (l) => ({
            itemId: l.itemId,
            qty: Number(l.qty),
            unitPrice: Number(l.unitPrice),
            details: l.custom ? l.details : null,
            photoPath: l.photo ? await uploadOrderPhoto(l.photo) : l.photoPath,
          })),
        )
      } catch (err) {
        return void toast.error(err instanceof Error ? err.message : "Photo upload failed")
      }
      const result = await saveOrder({
        id: initial.id,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail,
        takenAtLocationId: isNew ? form.takenAtLocationId : undefined,
        pickupLocationId: form.pickupLocationId,
        fulfilLocationId: form.fulfilLocationId,
        pickupDate: form.pickupDate,
        pickupTime: form.pickupTime,
        notes: form.notes,
        deposit,
        confirm,
        lines: payload,
      })
      if (result && !result.ok) toast.error(result.error)
    })
  }

  return (
    <form
      className="flex max-w-4xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit(isNew)
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor={`${formId}-phone`}>Phone</FieldLabel>
            <Input
              id={`${formId}-phone`}
              type="tel"
              inputMode="tel"
              value={form.customerPhone}
              maxLength={40}
              onChange={(e) => set({ customerPhone: e.target.value })}
              onBlur={(e) => lookUp(e.target.value)}
              placeholder="082 555 1234"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
            <Input
              id={`${formId}-name`}
              value={form.customerName}
              maxLength={100}
              required
              onChange={(e) => set({ customerName: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-email`}>Email (optional)</FieldLabel>
            <Input
              id={`${formId}-email`}
              type="email"
              value={form.customerEmail}
              onChange={(e) => set({ customerEmail: e.target.value })}
            />
          </Field>
          {returning && <p className="text-sm text-green-700 sm:col-span-3 dark:text-green-400">{returning}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pickup</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {isNew && takenAtOptions.length > 1 && (
            <Field>
              <FieldLabel htmlFor={`${formId}-taken`}>Taken at</FieldLabel>
              <NativeSelect
                id={`${formId}-taken`}
                className="w-full"
                value={form.takenAtLocationId}
                onChange={(e) => set({ takenAtLocationId: e.target.value })}
              >
                {takenAtOptions.map((l) => (
                  <NativeSelectOption key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor={`${formId}-pickup`}>Collect from</FieldLabel>
            <NativeSelect
              id={`${formId}-pickup`}
              className="w-full"
              value={form.pickupLocationId}
              onChange={(e) => choosePickup(e.target.value)}
            >
              {pickupOptions.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.code} · {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel htmlFor={`${formId}-date`}>Date</FieldLabel>
              <Input
                id={`${formId}-date`}
                type="date"
                min={isNew ? pickup?.today : undefined}
                value={form.pickupDate}
                required
                onChange={(e) => set({ pickupDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-time`}>Time</FieldLabel>
              <Input
                id={`${formId}-time`}
                type="time"
                value={form.pickupTime}
                onChange={(e) => set({ pickupTime: e.target.value })}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor={`${formId}-fulfil`}>Made at</FieldLabel>
            <NativeSelect
              id={`${formId}-fulfil`}
              className="w-full"
              value={form.fulfilLocationId}
              onChange={(e) => set({ fulfilLocationId: e.target.value })}
            >
              {bakeries
                .filter((b) => b.id !== form.pickupLocationId)
                .map((b) => (
                  <NativeSelectOption key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </NativeSelectOption>
                ))}
              <NativeSelectOption value={form.pickupLocationId}>
                {pickup?.canProduce ? `${pickup.code} · ${pickup.name}` : `From ${pickup?.name ?? "the store"}'s shelf`}
              </NativeSelectOption>
            </NativeSelect>
            <FieldDescription>
              {form.fulfilLocationId === form.pickupLocationId
                ? "Set aside at the pickup store, no delivery needed."
                : "Goes on the bake list, then on the delivery to the pickup store."}
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const item = byId.get(line.itemId)
          const options = line.custom ? customItems : shelfItems
          return (
            <Card key={line.key} size="sm">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  {line.custom && <CakeSlice className="size-4 shrink-0 text-muted-foreground" />}
                  <NativeSelect
                    aria-label={`Item ${index + 1}`}
                    className="w-full"
                    value={line.itemId}
                    onChange={(e) => {
                      const next = byId.get(e.target.value)
                      update(line.key, {
                        itemId: e.target.value,
                        unitPrice: line.unitPrice || (next?.price != null ? String(next.price) : ""),
                      })
                    }}
                  >
                    <NativeSelectOption value="">{line.custom ? "Choose a type…" : "Choose a product…"}</NativeSelectOption>
                    {options.map((i) => (
                      <NativeSelectOption key={i.id} value={i.id}>
                        {i.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {line.custom && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {CAKE_FIELDS.map((f) => (
                      <Field key={f.key} className={f.key === "notes" || f.key === "inscription" ? "sm:col-span-2" : ""}>
                        <FieldLabel htmlFor={`${formId}-${f.key}-${index}`} className="text-xs">
                          {f.label}
                        </FieldLabel>
                        {f.key === "notes" ? (
                          <Textarea
                            id={`${formId}-${f.key}-${index}`}
                            rows={2}
                            maxLength={500}
                            placeholder={f.placeholder}
                            value={line.details[f.key] ?? ""}
                            onChange={(e) => update(line.key, { details: { ...line.details, [f.key]: e.target.value } })}
                          />
                        ) : (
                          <Input
                            id={`${formId}-${f.key}-${index}`}
                            maxLength={f.key === "inscription" ? 200 : 100}
                            placeholder={f.placeholder}
                            value={line.details[f.key] ?? ""}
                            onChange={(e) => update(line.key, { details: { ...line.details, [f.key]: e.target.value } })}
                          />
                        )}
                      </Field>
                    ))}
                    <div className="flex items-center gap-3 sm:col-span-2">
                      {line.photoUrl && !line.photo && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                        <img src={line.photoUrl} alt="Reference" className="size-12 rounded-md object-cover" />
                      )}
                      <PhotoInput
                        label={line.photoPath ? "Replace photo" : "Reference photo"}
                        value={line.photo}
                        onChange={(photo) => update(line.key, { photo })}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Field>
                    <FieldLabel htmlFor={`${formId}-qty-${index}`} className="text-xs">
                      How many
                    </FieldLabel>
                    <Input
                      id={`${formId}-qty-${index}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.qty}
                      onChange={(e) => update(line.key, { qty: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-price-${index}`} className="text-xs">
                      Price each
                    </FieldLabel>
                    <Input
                      id={`${formId}-price-${index}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      placeholder={item?.price == null ? "Quote" : undefined}
                      onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                    />
                  </Field>
                  <div className="flex flex-col justify-end pb-2 text-right text-sm tabular-nums">
                    {formatMoney((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setLines((c) => [...c, newLine({ custom: true, itemId: customItems[0]?.id ?? "" })])}
          disabled={customItems.length === 0}
        >
          <CakeSlice />
          Add custom cake
        </Button>
        <Button type="button" variant="outline" onClick={() => setLines((c) => [...c, newLine()])}>
          <Plus />
          Add product
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field>
            <FieldLabel htmlFor={`${formId}-notes`}>Notes for the order (optional)</FieldLabel>
            <Textarea
              id={`${formId}-notes`}
              rows={2}
              maxLength={1000}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="e.g. Customer will bring candles"
            />
          </Field>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span>Total</span>
              <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
            </div>
            <Field>
              <FieldLabel htmlFor={`${formId}-deposit`} className="text-xs">
                Deposit paid
              </FieldLabel>
              <Input
                id={`${formId}-deposit`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.deposit}
                onChange={(e) => set({ deposit: e.target.value })}
              />
            </Field>
            <div className="flex justify-between">
              <span>Still to pay</span>
              <span className="font-semibold tabular-nums">{formatMoney(Math.max(total - deposit, 0))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <div className="flex flex-wrap gap-2">
          {isNew && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => submit(false)}>
              Save, confirm later
            </Button>
          )}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : isNew ? "Save and confirm" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  )
}
