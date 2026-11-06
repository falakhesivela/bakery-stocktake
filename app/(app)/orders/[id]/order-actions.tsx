"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Ban, Check, ChefHat, HandCoins, Pencil, Printer } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/format"
import type { OrderPermissions, OrderStatus } from "@/lib/orders"
import { changeOrderStatus, collectOrder } from "../actions"

export function OrderActions({
  id,
  code,
  status,
  perms,
  balance,
  fromShelf,
  pickupName,
}: {
  id: string
  code: string
  status: OrderStatus
  perms: OrderPermissions
  balance: number
  fromShelf: boolean
  pickupName: string
}) {
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<"collect" | "cancel" | null>(null)
  const [paid, setPaid] = useState(String(balance))
  const [reason, setReason] = useState("")

  function run(action: "confirm" | "ready" | "cancel") {
    startTransition(async () => {
      const result = await changeOrderStatus({ id, action, reason })
      setDialog(null)
      if (!result.ok) return void toast.error(result.error)
      if (action === "confirm") toast.success("Order confirmed: it's on the bake list")
      if (action === "cancel") toast.success("Order cancelled")
      if (action === "ready") {
        toast.success(
          result.data.transferCode
            ? `Ready. It goes to ${pickupName} on delivery ${result.data.transferCode}.`
            : "Ready to collect",
        )
      }
    })
  }

  const open = status !== "collected" && status !== "cancelled"

  return (
    <div className="flex flex-wrap gap-2 lg:justify-end">
      {perms.collect && (
        <Button size="lg" disabled={pending} onClick={() => setDialog("collect")}>
          <HandCoins />
          Customer collected
        </Button>
      )}
      {perms.ready && (
        <Button size="lg" variant={perms.collect ? "outline" : "default"} disabled={pending} onClick={() => run("ready")}>
          <ChefHat />
          {fromShelf ? "Set aside, ready" : "Mark ready"}
        </Button>
      )}
      {perms.confirm && (
        <Button size="lg" disabled={pending} onClick={() => run("confirm")}>
          <Check />
          Confirm order
        </Button>
      )}
      {perms.edit && (
        <Link href={`/orders/${code}/edit`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Pencil />
          Change
        </Link>
      )}
      {open && (
        <>
          <Link
            href={`/orders/${code}/ticket?size=sheet`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Printer />
            Order sheet
          </Link>
          <Link
            href={`/orders/${code}/ticket?size=label`}
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            <Printer />
            Box label
          </Link>
        </>
      )}
      {perms.cancel && (
        <Button variant="ghost" size="lg" disabled={pending} onClick={() => setDialog("cancel")}>
          <Ban />
          Cancel order
        </Button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog === "collect" && (
            <form
              id={`collect-${id}`}
              onSubmit={(e) => {
                e.preventDefault()
                const amount = Number(paid)
                if (paid === "" || !(amount >= 0)) return void toast.error("Enter what the customer paid (0 if nothing).")
                startTransition(async () => {
                  const result = await collectOrder({ id, paid: amount })
                  if (!result.ok) return void toast.error(result.error)
                  setDialog(null)
                  toast.success(`${code} collected`)
                })
              }}
            >
              <DialogHeader>
                <DialogTitle>Hand over {code}?</DialogTitle>
                <DialogDescription>
                  {balance > 0 ? `${formatMoney(balance)} is still to pay.` : "It's fully paid."} The
                  items are taken out of this store&apos;s stock.
                </DialogDescription>
              </DialogHeader>
              <Field className="my-4">
                <FieldLabel htmlFor={`paid-${id}`}>Paid now</FieldLabel>
                <Input
                  id={`paid-${id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  autoFocus
                />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                  Go back
                </Button>
                <Button type="submit" disabled={pending}>
                  Collected
                </Button>
              </DialogFooter>
            </form>
          )}
          {dialog === "cancel" && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel {code}?</DialogTitle>
                <DialogDescription>
                  {status === "ready"
                    ? "If it's on a delivery that hasn't left yet, it comes off that delivery. Anything already made stays in stock."
                    : "It comes off the bake list."}
                </DialogDescription>
              </DialogHeader>
              <Field>
                <FieldLabel htmlFor={`cancel-${id}`}>Reason (optional)</FieldLabel>
                <Input
                  id={`cancel-${id}`}
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Customer cancelled by phone"
                />
              </Field>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Keep the order
                </Button>
                <Button variant="destructive" disabled={pending} onClick={() => run("cancel")}>
                  Cancel order
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
