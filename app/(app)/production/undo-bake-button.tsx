"use client"

import { useState, useTransition } from "react"
import { Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { voidProduction } from "./actions"

export function UndoBakeButton({ runId, label }: { runId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Undo ${label}`} />}>
        <Undo2 />
        <span className="hidden sm:inline">Undo</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Undo this bake?</DialogTitle>
          <DialogDescription>
            {label} will be taken back out of stock. Only possible while none of
            the batch has been sent or sold.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`undo-${runId}`}
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await voidProduction({ runId, reason })
              if (!result.ok) return void toast.error(result.error)
              toast.success("Bake undone")
              setOpen(false)
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor={`undo-reason-${runId}`}>Reason</FieldLabel>
            <Input
              id={`undo-reason-${runId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Typed the wrong quantity"
              required
              maxLength={300}
              autoFocus
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            type="submit"
            form={`undo-${runId}`}
            variant="destructive"
            disabled={pending || !reason.trim()}
          >
            {pending ? "Undoing…" : "Undo bake"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
