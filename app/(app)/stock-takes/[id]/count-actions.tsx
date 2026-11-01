"use client"

import { useState, useTransition } from "react"
import { Ban, CircleCheck, Send, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/format"
import type { StockTakeStatus } from "@/lib/store-ops"
import { changeCountStatus, zeroUncounted } from "../actions"

type Pending = "approve" | "cancel" | "zero" | null

export function CountActions({
  id,
  status,
  isManager,
  canWork,
  countedLines,
  totalLines,
  differences,
  valueDiff,
  salesWarning,
}: {
  id: string
  status: StockTakeStatus
  isManager: boolean
  canWork: boolean
  countedLines: number
  totalLines: number
  differences: number
  valueDiff: number
  salesWarning: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<Pending>(null)
  const [reason, setReason] = useState("")
  const uncounted = totalLines - countedLines

  function run(action: "submit" | "return" | "approve" | "cancel", done: string) {
    startTransition(async () => {
      const result = await changeCountStatus({ id, action, reason })
      setDialog(null)
      if (!result.ok) return void toast.error(result.error)
      toast.success(
        action === "approve" && result.data.adjusted !== undefined
          ? `${done}: ${result.data.adjusted} line${result.data.adjusted === 1 ? "" : "s"} corrected`
          : done,
      )
    })
  }

  return (
    <div className="flex flex-wrap gap-2 lg:justify-end">
      {status === "counting" && canWork && uncounted > 0 && countedLines > 0 && (
        <Button variant="outline" disabled={pending} onClick={() => setDialog("zero")}>
          Set {uncounted} uncounted to 0
        </Button>
      )}
      {status === "counting" && canWork && !isManager && (
        <Button size="lg" disabled={pending || countedLines === 0} onClick={() => run("submit", "Handed in for approval")}>
          <Send />
          Finish counting
        </Button>
      )}
      {status === "counting" && isManager && (
        <Button
          variant="outline"
          disabled={pending || countedLines === 0}
          onClick={() => run("submit", "Counting finished")}
        >
          <Send />
          Finish counting
        </Button>
      )}
      {status === "submitted" && isManager && (
        <Button variant="outline" disabled={pending} onClick={() => run("return", "Sent back for recounting")}>
          <Undo2 />
          Send back to recount
        </Button>
      )}
      {isManager && (
        <>
          <Button size="lg" disabled={pending || countedLines === 0} onClick={() => setDialog("approve")}>
            <CircleCheck />
            Approve
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setDialog("cancel")}>
            <Ban />
            Cancel count
          </Button>
        </>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog === "approve" && (
            <>
              <DialogHeader>
                <DialogTitle>Approve this count?</DialogTitle>
                <DialogDescription>
                  {differences === 0
                    ? "Everything counted matches the system. Nothing changes."
                    : `${differences} line${differences === 1 ? "" : "s"} will be corrected to what was counted (net ${formatMoney(valueDiff)} at cost).`}{" "}
                  {uncounted > 0 && `${uncounted} uncounted line${uncounted === 1 ? " is" : "s are"} left as they are.`}
                </DialogDescription>
              </DialogHeader>
              {salesWarning && (
                <Alert>
                  <AlertDescription>{salesWarning}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Go back
                </Button>
                <Button disabled={pending} onClick={() => run("approve", "Count approved")}>
                  {salesWarning ? "Approve anyway" : "Approve"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "cancel" && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel this count?</DialogTitle>
                <DialogDescription>Nothing in stock changes.</DialogDescription>
              </DialogHeader>
              <Input
                aria-label="Reason"
                placeholder="Reason (optional)"
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Keep counting
                </Button>
                <Button variant="destructive" disabled={pending} onClick={() => run("cancel", "Count cancelled")}>
                  Cancel count
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "zero" && (
            <>
              <DialogHeader>
                <DialogTitle>Set {uncounted} uncounted lines to 0?</DialogTitle>
                <DialogDescription>
                  Only do this if you checked and these items really aren&apos;t there. On
                  approval their stock becomes 0.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Go back
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await zeroUncounted({ stockTakeId: id })
                      setDialog(null)
                      if (!result.ok) return void toast.error(result.error)
                      toast.success("Uncounted lines set to 0")
                    })
                  }
                >
                  Set to 0
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
