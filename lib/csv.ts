"use client"

import Papa from "papaparse"

/** Parses a CSV file with a header row into objects with trimmed, lower-case keys. */
export function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      transform: (value) => value.trim(),
      complete: (result) => resolve(result.data),
      error: (err) => reject(err),
    })
  })
}

/** Builds a CSV file and starts a download in the browser. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
