"use client"

import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/csv"

/** Downloads the given rows as a CSV file (opens in Excel / Sheets). */
export function CsvButton({
  rows,
  filename,
  label = "Download CSV",
}: {
  rows: Record<string, string | number | null>[]
  filename: string
  label?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, rows)}
    >
      <Download />
      {label}
    </Button>
  )
}
