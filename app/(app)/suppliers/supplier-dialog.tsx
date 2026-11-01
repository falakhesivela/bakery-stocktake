"use client"

import { useState, useTransition } from "react"
import { Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { saveSupplier } from "./actions"

type Supplier = {
  id?: string
  name: string
  contactName: string
  phone: string
  email: string
  notes: string
  active: boolean
}

const EMPTY: Supplier = { name: "", contactName: "", phone: "", email: "", notes: "", active: true }

export function SupplierDialog({ supplier }: { supplier?: Supplier }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Supplier>(supplier ?? EMPTY)
  const [pending, startTransition] = useTransition()
  const set = (patch: Partial<Supplier>) => setForm((f) => ({ ...f, ...patch }))
  const id = supplier?.id ?? "new"

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setForm(supplier ?? EMPTY)
      }}
    >
      <DialogTrigger
        render={
          supplier ? (
            <Button variant="ghost" size="sm" aria-label={`Edit ${supplier.name}`} />
          ) : (
            <Button />
          )
        }
      >
        {supplier ? <Pencil /> : <Plus />}
        {supplier ? <span className="hidden sm:inline">Edit</span> : "Add supplier"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : "Add a supplier"}</DialogTitle>
        </DialogHeader>
        <form
          id={`supplier-${id}`}
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await saveSupplier({ ...form, id: supplier?.id })
              if (!result.ok) return void toast.error(result.error)
              setOpen(false)
              toast.success(supplier ? "Supplier saved" : "Supplier added")
            })
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                id={`${id}-name`}
                value={form.name}
                maxLength={100}
                required
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-contact`}>Contact person</FieldLabel>
                <Input
                  id={`${id}-contact`}
                  value={form.contactName}
                  maxLength={100}
                  onChange={(e) => set({ contactName: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-phone`}>Phone</FieldLabel>
                <Input
                  id={`${id}-phone`}
                  type="tel"
                  value={form.phone}
                  maxLength={40}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
              <Input
                id={`${id}-email`}
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
              <Input
                id={`${id}-notes`}
                value={form.notes}
                maxLength={500}
                placeholder="e.g. Delivers Tuesdays and Fridays"
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Field>
            {supplier && (
              <Field orientation="horizontal">
                <Switch
                  id={`${id}-active`}
                  checked={form.active}
                  onCheckedChange={(active) => set({ active })}
                />
                <FieldLabel htmlFor={`${id}-active`}>Active</FieldLabel>
              </Field>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`supplier-${id}`} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
