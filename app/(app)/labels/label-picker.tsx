"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Printer, Search } from "lucide-react"
import { toast } from "sonner"
import { ScanButton } from "@/components/scanner/scan-button"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/format"

type Batch = {
  id: string
  code: string
  producedOn: string
  bestBefore: string | null
  itemName: string
  sku: string
  locationCode: string
}
type Product = { id: string; name: string; sku: string; barcode: string | null }

export const LABEL_SIZES = [
  { value: "58x40", label: "58 × 40 mm (label printer)" },
  { value: "50x25", label: "50 × 25 mm (small label printer)" },
  { value: "a4", label: "A4 sheet, 21 per page" },
]

export function LabelPicker({ batches, products }: { batches: Batch[]; products: Product[] }) {
  const router = useRouter()
  const [size, setSize] = useState("58x40")
  const [copies, setCopies] = useState("1")
  const [filter, setFilter] = useState("")

  function print(type: "batch" | "item", id: string) {
    const n = Math.min(200, Math.max(1, Math.floor(Number(copies) || 1)))
    router.push(`/labels/print?type=${type}&id=${id}&copies=${n}&size=${size}`)
  }

  const f = filter.trim().toLowerCase()
  const shownBatches = batches.filter(
    (b) => !f || [b.code, b.itemName, b.sku].some((v) => v.toLowerCase().includes(f)),
  )
  const shownProducts = products.filter(
    (p) => !f || [p.name, p.sku, p.barcode ?? ""].some((v) => v.toLowerCase().includes(f)),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="label-filter">Find</FieldLabel>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="label-filter"
                className="pl-8"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Item, SKU or batch code"
              />
            </div>
            <ScanButton
              size="icon"
              label="Scan a batch label to reprint it"
              onScan={(code) => {
                const batch = batches.find((b) => b.code.toLowerCase() === code.toLowerCase())
                if (batch) return print("batch", batch.id)
                const product = products.find(
                  (p) => p.sku.toLowerCase() === code.toLowerCase() || p.barcode === code,
                )
                if (product) return print("item", product.id)
                setFilter(code)
                toast.error(`Nothing found for “${code}”.`)
              }}
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="label-copies">Copies</FieldLabel>
          <Input
            id="label-copies"
            type="number"
            min={1}
            max={200}
            inputMode="numeric"
            className="w-24"
            value={copies}
            onChange={(e) => setCopies(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="label-size">Label size</FieldLabel>
          <NativeSelect id="label-size" value={size} onChange={(e) => setSize(e.target.value)}>
            {LABEL_SIZES.map((s) => (
              <NativeSelectOption key={s.value} value={s.value}>
                {s.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Tabs defaultValue="batch">
        <TabsList>
          <TabsTrigger value="batch">Batch labels</TabsTrigger>
          <TabsTrigger value="item">Product labels</TabsTrigger>
        </TabsList>
        <TabsContent value="batch" className="pt-2">
          {shownBatches.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {f ? "No recent batches match your search." : "No batches yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Baked</TableHead>
                  <TableHead>Best before</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownBatches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.itemName}</TableCell>
                    <TableCell className="font-mono text-xs">{b.code}</TableCell>
                    <TableCell>{formatDate(b.producedOn)}</TableCell>
                    <TableCell>{formatDate(b.bestBefore)}</TableCell>
                    <TableCell>{b.locationCode}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => print("batch", b.id)}>
                        <Printer />
                        Print
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        <TabsContent value="item" className="pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shownProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.barcode ?? `${p.sku} (SKU)`}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => print("item", p.id)}>
                      <Printer />
                      Print
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  )
}
