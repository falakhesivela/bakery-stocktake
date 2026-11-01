"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { findTransfer } from "./actions"

/** Scan a delivery-note QR code (or type T-00042) to open that transfer. */
export function FindTransferButton() {
  const router = useRouter()

  return (
    <ScanButton
      label="Scan delivery note"
      title="Scan a delivery note"
      onScan={async (code) => {
        const result = await findTransfer(code)
        if (!result.ok) return void toast.error(result.error)
        router.push(`/transfers/${result.data.code}`)
      }}
    />
  )
}
