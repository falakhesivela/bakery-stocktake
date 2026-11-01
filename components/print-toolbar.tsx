"use client"

import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"

export function PrintToolbar({
  count,
  noun = "label",
  backHref = "/labels",
  backLabel = "Back to labels",
}: {
  count?: number
  noun?: string
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white p-3 print:hidden">
      <Link href={backHref} className={buttonVariants({ variant: "ghost" })}>
        <ArrowLeft />
        {backLabel}
      </Link>
      <div className="flex items-center gap-3">
        {count !== undefined && (
          <span className="text-sm text-neutral-600">
            {count} {noun}
            {count === 1 ? "" : "s"}
          </span>
        )}
        <Button onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
      </div>
    </div>
  )
}
