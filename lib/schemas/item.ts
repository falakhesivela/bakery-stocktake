import { z } from "zod"

export const ITEM_KINDS = ["product", "ingredient", "packaging"] as const
export const ITEM_UNITS = ["each", "g", "kg", "ml", "l"] as const

export const KIND_LABELS: Record<(typeof ITEM_KINDS)[number], string> = {
  product: "Product",
  ingredient: "Ingredient",
  packaging: "Packaging",
}

const sku = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9._-]{1,32}$/,
    "SKU can only use letters, numbers, dots, dashes and underscores (max 32).",
  )
  .transform((value) => value.toUpperCase())

export const itemSchema = z.object({
  sku,
  name: z.string().trim().min(1, "Enter a name").max(120, "Name is too long"),
  kind: z.enum(ITEM_KINDS),
  unit: z.enum(ITEM_UNITS),
  categoryId: z.union([z.literal(""), z.guid()]),
  shelfLifeDays: z
    .number()
    .int("Shelf life must be whole days")
    .min(0)
    .max(3650)
    .nullable(),
  trackBatches: z.boolean(),
  cost: z.number().min(0, "Cost can't be negative").nullable(),
  price: z.number().min(0, "Price can't be negative").nullable(),
  notes: z.string().trim().max(1000),
  active: z.boolean(),
  madeToOrder: z.boolean(),
  barcodes: z.array(z.string().trim().min(1).max(64)).max(20, "At most 20 barcodes"),
})

export type ItemInput = z.infer<typeof itemSchema>

/** Empty string → null, otherwise a number (NaN fails validation). */
export function numberOrNull(value: FormDataEntryValue | string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : ""
  return text === "" ? null : Number(text)
}

function yesNo(value: string | undefined, fallback: boolean) {
  const v = (value ?? "").trim().toLowerCase()
  if (["yes", "y", "true", "1"].includes(v)) return true
  if (["no", "n", "false", "0"].includes(v)) return false
  return fallback
}

/** One CSV row for the catalogue import. */
export const importRowSchema = z.object({
  sku,
  name: z.string().trim().min(1, "Name is missing").max(120),
  kind: z.enum(ITEM_KINDS, "Type must be product, ingredient or packaging"),
  category: z.string().trim().max(60),
  unit: z.enum(ITEM_UNITS, "Unit must be each, g, kg, ml or l"),
  shelf_life_days: z.number().int().min(0).max(3650).nullable(),
  track_batches: z.boolean(),
  cost: z.number().min(0).nullable(),
  price: z.number().min(0).nullable(),
  barcode: z.string().trim().max(64),
})

export type ImportRow = z.infer<typeof importRowSchema>

/** Turns a raw CSV record into an import row (validation happens separately). */
export function csvRecordToImportRow(record: Record<string, string>) {
  const kind = (record.kind || record.type || "product").toLowerCase()
  return {
    sku: record.sku ?? "",
    name: record.name ?? "",
    kind,
    category: record.category ?? "",
    unit: (record.unit || "each").toLowerCase(),
    shelf_life_days: numberOrNull(record.shelf_life_days),
    track_batches: yesNo(record.track_batches, kind === "product"),
    cost: numberOrNull(record.cost),
    price: numberOrNull(record.price),
    barcode: record.barcode ?? "",
  }
}
