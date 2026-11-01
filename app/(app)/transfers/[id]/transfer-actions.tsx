"use client"

import Link from "next/link"
import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Ban, Check, PackageCheck, Pencil, Printer, Send, ShoppingBasket, X } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
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
import type { TransferOrigin, TransferPermissions, TransferStatus } from "@/lib/transfers"
import { changeTransferStatus } from "../actions"

type Action = "submit" | "approve" | "reject" | "cancel" | "start_picking"

export function TransferActions({
  id,
  code,
  status,
  origin,
  perms,
}: {
  id: string
  code: string
  status: TransferStatus
  origin: TransferOrigin
  perms: TransferPermissions
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(action: Action, reason?: string, onDone?: (result?: string) => void) {
    startTransition(async () => {
      const result = await changeTransferStatus({ id, action, reason })
      if (!result.ok) return void toast.error(result.error)
      onDone?.(result.data.result)
    })
  }

  const printable = ["approved", "picking", "in_transit", "received"].includes(status)

  return (
    <div className="flex flex-wrap gap-2 lg:justify-end">
      {perms.receive && (
        <Link href={`/transfers/${code}/receive`} className={buttonVariants({ size: "lg" })}>
          <PackageCheck />
          Receive delivery
        </Link>
      )}

      {perms.pick &&
        (status === "picking" ? (
          <Link href={`/transfers/${code}/pick`} className={buttonVariants({ size: "lg" })}>
            <ShoppingBasket />
            Continue picking
          </Link>
        ) : (
          <Button
            size="lg"
            disabled={pending}
            onClick={() =>
              run("start_picking", undefined, () => router.push(`/transfers/${code}/pick`))
            }
          >
            <ShoppingBasket />
            Start picking
          </Button>
        ))}

      {perms.approve && (
        <>
          <Button
            size="lg"
            disabled={pending}
            onClick={() => run("approve", undefined, () => toast.success("Approved"))}
          >
            <Check />
            Approve
          </Button>
          <Link
            href={`/transfers/${code}/edit?approve=1`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Pencil />
            Change & approve
          </Link>
          <ReasonDialog
            trigger={
              <>
                <X />
                Reject
              </>
            }
            title={`Reject ${code}?`}
            description="The other location will see your reason."
            placeholder="e.g. No carrot cakes this week"
            required
            confirmLabel="Reject request"
            pending={pending}
            onConfirm={(reason, close) =>
              run("reject", reason, () => {
                close()
                toast.success("Request rejected")
              })
            }
          />
        </>
      )}

      {perms.submit && (
        <Button
          size="lg"
          disabled={pending}
          onClick={() =>
            run("submit", undefined, (result) =>
              toast.success(result === "approved" ? "Approved and ready for picking" : "Request sent"),
            )
          }
        >
          <Send />
          {origin === "push" ? "Approve for picking" : "Send request"}
        </Button>
      )}

      {perms.edit && (
        <Link
          href={`/transfers/${code}/edit`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <Pencil />
          Edit
        </Link>
      )}

      {printable && (
        <Link
          href={`/transfers/${code}/note`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <Printer />
          {status === "approved" || status === "picking" ? "Pick list" : "Delivery note"}
        </Link>
      )}

      {perms.cancel && (
        <ReasonDialog
          trigger={
            <>
              <Ban />
              {status === "draft" ? "Delete draft" : "Cancel"}
            </>
          }
          title={status === "draft" ? "Delete this draft?" : `Cancel ${code}?`}
          description={
            status === "draft"
              ? "The draft will be removed."
              : "Nothing has left the building yet, so no stock changes."
          }
          placeholder="Reason (optional)"
          required={false}
          confirmLabel={status === "draft" ? "Delete draft" : "Cancel transfer"}
          pending={pending}
          onConfirm={(reason, close) =>
            run("cancel", reason, (result) => {
              close()
              if (result === "deleted") {
                toast.success("Draft deleted")
                router.push("/transfers")
              } else {
                toast.success("Transfer cancelled")
              }
            })
          }
        />
      )}
    </div>
  )
}

function ReasonDialog({
  trigger,
  title,
  description,
  placeholder,
  required,
  confirmLabel,
  pending,
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  placeholder: string
  required: boolean
  confirmLabel: string
  pending: boolean
  onConfirm: (reason: string, close: () => void) => void
}) {
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="lg" />}>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault()
            onConfirm(reason.trim(), () => setOpen(false))
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${formId}-reason`}>Reason</FieldLabel>
            <Input
              id={`${formId}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholder}
              required={required}
              maxLength={500}
              autoFocus
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Go back
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="destructive"
            disabled={pending || (required && !reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
