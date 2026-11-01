"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, Upload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { downloadCsv, parseCsvFile } from "@/lib/csv"
import {
  csvRecordToImportRow,
  importRowSchema,
  type ImportRow,
} from "@/lib/schemas/item"
import { importItems } from "../actions"

type PreviewRow = { rowNo: number; row: ImportRow | null; raw: Record<string, string>; error?: string }

const TEMPLATE = [
  {
    sku: "CAKE-LEMON-L",
    name: "Lemon cake (large)",
    kind: "product",
    category: "Cakes",
    unit: "each",
    shelf_life_days: 4,
    track_batches: "yes",
    cost: 110,
    price: 340,
    barcode: "",
  },
  {
    sku: "FLOUR-BREAD",
    name: "Bread flour",
    kind: "ingredient",
    category: "Ingredients",
    unit: "kg",
    shelf_life_days: "",
    track_batches: "no",
    cost: 16.5,
    price: "",
    barcode: "",
  },
]

export function ImportItems() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [fileName, setFileName] = useState("")
  const [pending, startTransition] = useTransition()

  const valid = preview.filter((p) => p.row && !p.error)
  const invalid = preview.length - valid.length

  async function load(file: File) {
    const records = await parseCsvFile(file)
    const seen = new Set<string>()
    setFileName(file.name)
    setPreview(
      records.map((raw, index) => {
        const parsed = importRowSchema.safeParse(csvRecordToImportRow(raw))
        const rowNo = index + 2
        if (!parsed.success) {
          return { rowNo, raw, row: null, error: parsed.error.issues[0]?.message }
        }
        const sku = parsed.data.sku.toUpperCase()
        if (seen.has(sku)) {
          return { rowNo, raw, row: null, error: "Same SKU appears earlier in the file" }
        }
        seen.add(sku)
        return { rowNo, raw, row: parsed.data }
      }),
    )
  }

  function runImport() {
    startTransition(async () => {
      const result = await importItems(valid.map((p) => p.row!))
      if (!result.ok) return void toast.error(result.error)
      toast.success(
        `Imported: ${result.data.created} new, ${result.data.updated} updated.`,
      )
      router.push("/catalogue")
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Prepare your file</CardTitle>
          <CardDescription>
            Columns: <code>sku</code>, <code>name</code>, <code>kind</code> (product,
            ingredient or packaging), <code>category</code>, <code>unit</code> (each, g, kg,
            ml, l), <code>shelf_life_days</code>, <code>track_batches</code> (yes/no),{" "}
            <code>cost</code>, <code>price</code>, <code>barcode</code>. Only sku and name
            are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => downloadCsv("items-template.csv", TEMPLATE)}>
            <Download />
            Download template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Upload and check</CardTitle>
          <CardDescription>
            Nothing is saved until you press Import.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => fileRef.current?.click()}>
              <Upload />
              Choose CSV file
            </Button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) load(file).catch(() => toast.error("Couldn't read that file."))
                e.target.value = ""
              }}
            />
          </div>

          {preview.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{valid.length} ready</Badge>
                {invalid > 0 && <Badge variant="destructive">{invalid} with problems (skipped)</Badge>}
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Shelf life</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((p) => (
                      <TableRow key={p.rowNo}>
                        <TableCell className="text-muted-foreground">{p.rowNo}</TableCell>
                        <TableCell className="font-mono text-xs">{p.raw.sku}</TableCell>
                        <TableCell>{p.raw.name}</TableCell>
                        <TableCell>{p.row?.kind ?? p.raw.kind}</TableCell>
                        <TableCell>{p.row?.unit ?? p.raw.unit}</TableCell>
                        <TableCell>{p.row?.shelf_life_days ?? "—"}</TableCell>
                        <TableCell>
                          {p.error ? (
                            <span className="text-destructive">{p.error}</span>
                          ) : (
                            <span className="text-green-700 dark:text-green-400">OK</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <Button size="lg" disabled={pending || valid.length === 0} onClick={runImport}>
                  {pending ? "Importing…" : `Import ${valid.length} item${valid.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
