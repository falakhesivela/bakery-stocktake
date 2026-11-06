"use client"

import { useTransition } from "react"
import { ChefHat } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { changeOrderStatus } from "./actions"

export function MarkReadyButton({ id, code }: { id: string; code: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await changeOrderStatus({ id, action: "ready" })
          if (!result.ok) return void toast.error(result.error)
          toast.success(
            result.data.transferCode
              ? `${code} is ready and on delivery ${result.data.transferCode}`
              : `${code} is ready`,
          )
        })
      }
    >
      <ChefHat />
      Mark ready
    </Button>
  )
}
