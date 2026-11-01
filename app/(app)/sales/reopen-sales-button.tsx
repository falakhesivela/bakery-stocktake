"use client"

import { useState, useTransition } from "react"
import { RotateCcw } from "lucide-react"
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
import { reopenSales } from "./actions"

export function ReopenSalesButton({ id, date }: { id: string; date: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="w-fit" />}>
        <RotateCcw />
        Reopen to correct
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen sales for {date}?</DialogTitle>
          <DialogDescription>
            The stock goes back exactly where it was taken from, and the sales become a
            draft again. Fix them and post again.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`reopen-${id}`}>Reason (optional)</FieldLabel>
          <Input
            id={`reopen-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Cupcakes entered twice"
            maxLength={300}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Go back
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await reopenSales({ id, reason })
                if (!result.ok) return void toast.error(result.error)
                setOpen(false)
                toast.success("Sales reopened as a draft")
              })
            }
          >
            Reopen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
