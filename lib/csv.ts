"use client"

import Papa from "papaparse"

/** Parses a CSV file with a header row into objects with trimmed, lower-case keys. */
export function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      // Files saved by Excel (and our own downloads) can start with a byte-order mark.
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_"),
      transform: (value) => value.trim(),
      complete: (result) => resolve(result.data),
      error: (err) => reject(err),
    })
  })
}

/** Builds a CSV file and starts a download in the browser. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  // Text starting with = + - @ is prefixed with ' so spreadsheets don't run it
  // as a formula. The byte-order mark makes Excel read the file as UTF-8.
  const csv = Papa.unparse(rows, { escapeFormulae: true })
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
