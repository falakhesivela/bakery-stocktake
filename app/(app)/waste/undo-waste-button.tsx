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
import { undoWaste } from "./actions"

export function UndoWasteButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Undo waste: ${label}`} />}>
        <Undo2 />
        <span className="hidden sm:inline">Undo</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Undo this waste?</DialogTitle>
          <DialogDescription>{label} goes back into stock.</DialogDescription>
        </DialogHeader>
        <form
          id={`undo-waste-${id}`}
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await undoWaste({ id, reason })
              if (!result.ok) return void toast.error(result.error)
              setOpen(false)
              toast.success("Waste undone")
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor={`undo-waste-reason-${id}`}>Reason</FieldLabel>
            <Input
              id={`undo-waste-reason-${id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Logged the wrong item"
              maxLength={300}
              required
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
            form={`undo-waste-${id}`}
            variant="destructive"
            disabled={pending || !reason.trim()}
          >
            Undo waste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
