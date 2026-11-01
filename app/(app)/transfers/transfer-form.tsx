"use client"

import Link from "next/link"
import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Copy, Gauge, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { formatQty } from "@/lib/format"
import type { TransferOrigin } from "@/lib/transfers"
import { useResetOnHide } from "@/hooks/use-reset-on-hide"
import { lastOrderLines, saveTransfer } from "./actions"

type Unit = "each" | "g" | "kg" | "ml" | "l"

type Item = {
  id: string
  sku: string
  name: string
  kind: "product" | "ingredient" | "packaging"
  unit: Unit
  barcodes: string[]
}

type Loc = { id: string; code: string; name: string; type: "warehouse" | "store" }

type Line = { key: number; itemId: string; qty: string; requestedQty: number | null }

export type TransferFormMode =
  /** New transfer: choose locations, save as draft or send on. */
  | "create"
  /** Editing a draft: save or send on. */
  | "draft"
  /** Editing a requested/approved transfer: save changes only. */
  | "edit"
  /** Sender approving a request with changed quantities. */
  | "approve"

const KIND_LABELS = {
  product: "Products",
  ingredient: "Ingredients",
  packaging: "Packaging",
} as const

let nextKey = 1
const newLine = (itemId = "", qty = "", requestedQty: number | null = null): Line => ({
  key: nextKey++,
  itemId,
  qty,
  requestedQty,
})

export function TransferForm({
  mode,
  origin,
  transferId,
  fromOptions,
  toOptions,
  initial,
  items,
  parByLocation,
  keepRequested = false,
  cancelHref,
}: {
  mode: TransferFormMode
  origin: TransferOrigin
  transferId?: string
  fromOptions: Loc[]
  toOptions: Loc[]
  initial: {
    fromLocationId: string
    toLocationId: string
    neededOn: string
    note: string
    lines: { itemId: string; qty: number; requestedQty: number | null }[]
  }
  items: Item[]
  parByLocation: Record<string, { itemId: string; par: number; onHand: number }[]>
  /** Requested lines can be set to 0 but not removed (sender editing). */
  keepRequested?: boolean
  cancelHref: string
}) {
  const router = useRouter()
  const formId = useId()
  const [pending, startTransition] = useTransition()
  const [fromId, setFromId] = useState(initial.fromLocationId)
  const [toId, setToId] = useState(initial.toLocationId)
  const [neededOn, setNeededOn] = useState(initial.neededOn)
  const [note, setNote] = useState(initial.note)
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.length > 0
      ? initial.lines.map((l) => newLine(l.itemId, String(l.qty), l.requestedQty))
      : [newLine()],
  )

  const resetOnHide = useResetOnHide()

  const itemById = new Map(items.map((i) => [i.id, i]))
  const locked = mode !== "create"
  const isRequest = origin !== "push"
  const par = parByLocation[toId] ?? []
  const showRequested = mode === "approve" || keepRequested

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addItem(itemId: string, qty = "") {
    if (lines.some((l) => l.itemId === itemId)) {
      toast.info(`${itemById.get(itemId)?.name} is already on the list.`)
      return
    }
    const blank = lines.find((l) => !l.itemId)
    setLines(
      blank
        ? lines.map((l) => (l.key === blank.key ? { ...l, itemId, qty } : l))
        : [...lines, newLine(itemId, qty)],
    )
  }

  function addScanned(code: string) {
    const c = code.trim().toLowerCase()
    const item = items.find(
      (i) => i.sku.toLowerCase() === c || i.barcodes.some((b) => b.toLowerCase() === c),
    )
    if (!item) return void toast.error(`No item has the code “${code}”.`)
    addItem(item.id)
  }

  function fillToPar() {
    const next = lines.filter((l) => l.itemId).map((l) => ({ ...l }))
    let changed = 0
    for (const p of par) {
      if (!itemById.has(p.itemId)) continue
      const need = Math.max(0, Math.ceil(p.par - Math.max(p.onHand, 0)))
      const existing = next.find((l) => l.itemId === p.itemId)
      if (existing) {
        existing.qty = String(need)
        changed++
      } else if (need > 0) {
        next.push(newLine(p.itemId, String(need)))
        changed++
      }
    }
    setLines(next.length > 0 ? next : [newLine()])
    toast.success(
      changed > 0
        ? "Filled quantities up to the par levels. Check them before sending."
        : "Everything is already at its par level.",
    )
  }

  function copyLastOrder() {
    startTransition(async () => {
      const result = await lastOrderLines({ fromLocationId: fromId, toLocationId: toId })
      if (!result.ok) return void toast.error(result.error)
      const known = result.data.lines.filter((l) => itemById.has(l.itemId))
      if (known.length === 0) return void toast.error("The last order had no items that are still active.")
      setLines(known.map((l) => newLine(l.itemId, String(l.qty))))
      toast.success(`Copied ${known.length} line(s) from ${result.data.code}.`)
    })
  }

  function submit(then: "save" | "submit" | "approve") {
    const filled = lines.filter((l) => l.itemId || l.qty)
    for (const l of filled) {
      if (!l.itemId) return void toast.error("Choose an item on every line, or remove the empty line.")
      if (l.qty === "" || Number.isNaN(Number(l.qty))) {
        return void toast.error(`Enter a quantity for ${itemById.get(l.itemId)?.name}.`)
      }
    }
    if (filled.length === 0) return void toast.error("Add at least one item.")

    startTransition(async () => {
      const result = await saveTransfer({
        id: transferId,
        origin: mode === "create" ? (origin === "push" ? "push" : "request") : undefined,
        fromLocationId: mode === "create" ? fromId : undefined,
        toLocationId: mode === "create" ? toId : undefined,
        neededOn,
        note,
        lines: filled.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
        then,
      })
      if (!result.ok) return void toast.error(result.error)
      if (mode === "create") {
        resetOnHide(() => {
          setFromId(initial.fromLocationId)
          setToId(initial.toLocationId)
          setNeededOn(initial.neededOn)
          setNote("")
          setLines([newLine()])
        })
      }
      if (result.data.followUpError) {
        toast.error(`Saved as a draft, but not sent: ${result.data.followUpError}`)
      } else if (then === "submit") {
        toast.success(isRequest ? "Request sent" : "Approved and ready for picking")
      } else if (then === "approve") {
        toast.success("Approved")
      } else {
        toast.success("Saved")
      }
      router.push(`/transfers/${result.data.id}`)
    })
  }

  const fromLoc = fromOptions.find((l) => l.id === fromId)
  const toLoc = toOptions.find((l) => l.id === toId)
  const grouped = (Object.keys(KIND_LABELS) as Item["kind"][]).map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind),
  }))

  return (
    <form
      id={formId}
      className="flex max-w-4xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit(mode === "approve" ? "approve" : mode === "edit" ? "save" : "submit")
      }}
    >
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <Field>
            <FieldLabel htmlFor={`${formId}-from`}>From</FieldLabel>
            {locked ? (
              <LocationText loc={fromLoc} />
            ) : (
              <NativeSelect
                id={`${formId}-from`}
                className="w-full"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {fromOptions
                  .filter((l) => l.id !== toId)
                  .map((l) => (
                    <NativeSelectOption key={l.id} value={l.id}>
                      {l.code} · {l.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <ArrowRight className="hidden size-5 self-end mb-2 text-muted-foreground sm:block" />
          <Field>
            <FieldLabel htmlFor={`${formId}-to`}>To</FieldLabel>
            {locked ? (
              <LocationText loc={toLoc} />
            ) : (
              <NativeSelect
                id={`${formId}-to`}
                className="w-full"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {toOptions
                  .filter((l) => l.id !== fromId)
                  .map((l) => (
                    <NativeSelectOption key={l.id} value={l.id}>
                      {l.code} · {l.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-needed`}>Needed on</FieldLabel>
            <Input
              id={`${formId}-needed`}
              type="date"
              value={neededOn}
              onChange={(e) => setNeededOn(e.target.value)}
            />
          </Field>
          <div className="hidden sm:block" />
          <Field>
            <FieldLabel htmlFor={`${formId}-note`}>Note (optional)</FieldLabel>
            <Input
              id={`${formId}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="e.g. Please box the cakes"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <ScanButton label="Scan to add" onScan={addScanned} />
        {(mode === "create" || mode === "draft") && fromId && toId && (
          <Button type="button" variant="outline" onClick={copyLastOrder} disabled={pending}>
            <Copy />
            Copy last order
          </Button>
        )}
        {mode !== "approve" && par.length > 0 && (
          <Button type="button" variant="outline" onClick={fillToPar}>
            <Gauge />
            Fill up to par levels
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="hidden grid-cols-[1fr_8rem_2rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Item</span>
            <span>Quantity</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const item = itemById.get(line.itemId)
            const lockedLine = (mode === "approve" || keepRequested) && line.requestedQty !== null
            return (
              <div
                key={line.key}
                className="grid grid-cols-[1fr_6rem_2rem] items-start gap-2 sm:grid-cols-[1fr_8rem_2rem]"
              >
                <div>
                  <NativeSelect
                    aria-label={`Item ${index + 1}`}
                    className="w-full"
                    value={line.itemId}
                    disabled={lockedLine}
                    onChange={(e) => updateLine(line.key, { itemId: e.target.value })}
                  >
                    <NativeSelectOption value="">Choose an item…</NativeSelectOption>
                    {grouped.map(
                      (group) =>
                        group.items.length > 0 && (
                          <NativeSelectOptGroup key={group.kind} label={KIND_LABELS[group.kind]}>
                            {group.items.map((i) => (
                              <NativeSelectOption
                                key={i.id}
                                value={i.id}
                                disabled={i.id !== line.itemId && lines.some((l) => l.itemId === i.id)}
                              >
                                {i.name} ({i.sku})
                              </NativeSelectOption>
                            ))}
                          </NativeSelectOptGroup>
                        ),
                    )}
                  </NativeSelect>
                  {showRequested && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {line.requestedQty !== null
                        ? `Asked for ${formatQty(line.requestedQty, item?.unit)}`
                        : "Added by the sender"}
                    </p>
                  )}
                </div>
                <Input
                  aria-label={`Quantity ${index + 1}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder={item && item.unit !== "each" ? item.unit : "Qty"}
                  value={line.qty}
                  onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lockedLine || lines.length === 1}
                  title={lockedLine ? "Set the quantity to 0 instead" : undefined}
                  onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            )
          })}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((c) => [...c, newLine()])}
            >
              <Plus />
              Add line
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <div className="flex flex-wrap gap-2">
          {(mode === "create" || mode === "draft") && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => submit("save")}>
              Save draft
            </Button>
          )}
          <Button type="submit" size="lg" disabled={pending || !fromId || !toId}>
            {pending
              ? "Saving…"
              : mode === "approve"
                ? "Approve these quantities"
                : mode === "edit"
                  ? "Save changes"
                  : isRequest
                    ? "Send request"
                    : "Approve for picking"}
          </Button>
        </div>
      </div>
    </form>
  )
}

function LocationText({ loc }: { loc: Loc | undefined }) {
  return (
    <div className="flex h-8 items-center text-sm">
      <span className="font-medium">{loc?.code}</span>
      <span className="ml-1.5 text-muted-foreground">{loc?.name}</span>
    </div>
  )
}
