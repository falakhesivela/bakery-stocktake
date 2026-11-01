"use client"

import { useState, useTransition } from "react"
import { Ban } from "lucide-react"
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
import { cancelDelivery } from "../actions"

export function CancelDeliveryButton({ id, code }: { id: string; code: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" />}>
        <Ban />
        Cancel delivery
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {code}?</DialogTitle>
          <DialogDescription>
            Use this when a delivery was entered by mistake. Its stock is taken back out
            (anything already used goes negative until counted).
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`cancel-${id}`}>Reason</FieldLabel>
          <Input
            id={`cancel-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Entered twice"
            maxLength={300}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelDelivery({ id, reason })
                if (!result.ok) return void toast.error(result.error)
                setOpen(false)
                toast.success(`${code} cancelled`)
              })
            }
          >
            Cancel delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
