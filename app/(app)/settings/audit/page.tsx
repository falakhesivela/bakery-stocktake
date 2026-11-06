import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireAdmin } from "@/lib/auth"
import { WEEKDAYS } from "@/lib/dates"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { AuditFilters } from "./audit-filters"

export const metadata: Metadata = { title: "Audit log" }

export default function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed products, prices, recipes, suppliers, locations, users and standing orders, and when. Stock changes are in each item's stock history instead."
      />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

const AREAS: Record<string, { label: string; tables: string[] }> = {
  products: { label: "Products & prices", tables: ["items", "item_barcodes", "categories"] },
  recipes: { label: "Recipes", tables: ["recipes", "recipe_lines"] },
  suppliers: { label: "Suppliers", tables: ["suppliers"] },
  locations: { label: "Locations", tables: ["locations"] },
  users: { label: "Users & roles", tables: ["profiles", "user_locations"] },
  levels: { label: "Reorder levels", tables: ["item_location_settings"] },
  standing: { label: "Standing orders", tables: ["standing_orders"] },
}

const TABLE_LABELS: Record<string, string> = {
  items: "Item",
  item_barcodes: "Barcode",
  categories: "Category",
  recipes: "Recipe",
  recipe_lines: "Recipe line",
  suppliers: "Supplier",
  locations: "Location",
  profiles: "User",
  user_locations: "Role",
  item_location_settings: "Reorder level",
  standing_orders: "Standing order",
}

const ACTION_LABELS: Record<string, string> = { insert: "Added", update: "Changed", delete: "Removed" }

const COLUMN_LABELS: Record<string, string> = {
  is_admin: "admin",
  full_name: "name",
  category_id: "category",
  item_id: "item",
  location_id: "location",
  product_item_id: "product",
  ingredient_item_id: "ingredient",
  yield_qty: "batch makes",
  shelf_life_days: "shelf life (days)",
  track_batches: "tracks batches",
  made_to_order: "made to order",
  can_produce: "bakes here",
  reorder_level: "reorder level",
  par_level: "par level",
  image_path: "photo",
  sort_order: "order",
}

// Columns not worth showing when a row is added.
const HIDDEN = new Set(["id", "created_at", "updated_at", "updated_by", "created_by"])
const PAGE_SIZE = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

type Row = Record<string, unknown>

async function AuditContent({ searchParams }: { searchParams: PageProps<"/settings/audit">["searchParams"] }) {
  const user = await requireAdmin()
  const sp = await searchParams
  const area = AREAS[param(sp.area)] ? param(sp.area) : ""
  const before = Number(param(sp.before)) || null

  const supabase = await createClient()
  const [{ data: profiles }, { data: items }, { data: locations }, { data: categories }, { data: suppliers }, { data: recipes }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
      supabase.from("items").select("id, name"),
      supabase.from("locations").select("id, code, name"),
      supabase.from("categories").select("id, name"),
      supabase.from("suppliers").select("id, name"),
      supabase.from("recipes").select("id, product_item_id"),
    ])
  const who = (profiles ?? []).some((p) => p.id === param(sp.who)) ? param(sp.who) : ""

  let query = supabase
    .from("audit_log")
    .select("id, table_name, row_key, action, changes, actor, created_at")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE)
  if (area) query = query.in("table_name", AREAS[area].tables)
  if (who) query = query.eq("actor", who)
  if (before) query = query.lt("id", before)
  const { data: entries } = await query
  const rows = entries ?? []

  // Recipe lines that were changed (not added or removed) only carry the changed columns.
  const lineIds = rows.filter((r) => r.table_name === "recipe_lines" && r.action === "update").map((r) => r.row_key!)
  const { data: lines } = lineIds.length
    ? await supabase.from("recipe_lines").select("id, recipe_id, ingredient_item_id").in("id", lineIds)
    : { data: [] }

  const personName = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"]))
  const itemName = new Map((items ?? []).map((i) => [i.id, i.name]))
  const locationCode = new Map((locations ?? []).map((l) => [l.id, l.code]))
  const recipeItem = new Map((recipes ?? []).map((r) => [r.id, r.product_item_id]))
  const lineOf = new Map((lines ?? []).map((l) => [l.id, l]))
  const names = new Map<string, string>([
    ...personName,
    ...itemName,
    ...(locations ?? []).map((l) => [l.id, `${l.code} · ${l.name}`] as [string, string]),
    ...(categories ?? []).map((c) => [c.id, c.name] as [string, string]),
    ...(suppliers ?? []).map((s) => [s.id, s.name] as [string, string]),
  ])

  const str = (v: unknown) => (typeof v === "string" ? v : undefined)
  const item = (id: unknown) => itemName.get(str(id) ?? "") ?? "an item no longer listed"
  const code = (id: unknown) => locationCode.get(str(id) ?? "") ?? "?"
  const recipeName = (id: unknown) => {
    const product = recipeItem.get(str(id) ?? "")
    return product ? `the ${item(product)} recipe` : "a removed recipe"
  }

  function subject(r: (typeof rows)[number]) {
    const key = r.row_key ?? ""
    // Added or removed rows carry the whole row; changed rows only what changed.
    const data = (r.action === "update" ? {} : (r.changes ?? {})) as Row
    const parts = key.split("|")
    switch (r.table_name) {
      case "items":
        return itemName.get(key) ?? str(data.name) ?? "Removed item"
      case "item_barcodes":
        return `${key}${data.item_id ? ` for ${item(data.item_id)}` : ""}`
      case "categories":
      case "suppliers":
      case "profiles":
        return names.get(key) ?? str(data.name) ?? str(data.full_name) ?? "Removed"
      case "locations":
        return names.get(key) ?? str(data.name) ?? "Removed location"
      case "user_locations":
        return `${personName.get(parts[0]) ?? "Someone"} at ${code(parts[1])}`
      case "item_location_settings":
        return `${item(parts[0])} at ${code(parts[1])}`
      case "recipes":
        return recipeItem.has(key) ? recipeName(key) : `the ${item(data.product_item_id)} recipe`
      case "recipe_lines": {
        const line = lineOf.get(key) ?? (data as { recipe_id?: string; ingredient_item_id?: string })
        return `${item(line.ingredient_item_id)} in ${recipeName(line.recipe_id)}`
      }
      case "standing_orders": {
        const day = WEEKDAYS.find((d) => d.value === Number(parts[3]))?.short ?? "?"
        return `${item(parts[2])} · ${code(parts[0])} → ${code(parts[1])} · ${day}`
      }
      default:
        return key
    }
  }

  function show(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—"
    if (typeof value === "boolean") return value ? "yes" : "no"
    if (typeof value === "string") {
      if (UUID.test(value)) return names.get(value) ?? "(removed)"
      return value.length > 60 ? `${value.slice(0, 57)}…` : value
    }
    if (typeof value === "number") return String(value)
    return JSON.stringify(value)
  }

  function details(r: (typeof rows)[number]) {
    const changes = (r.changes ?? {}) as Row
    if (r.action === "update") {
      return Object.entries(changes)
        .filter(([col]) => !HIDDEN.has(col))
        .map(([col, pair]) => {
          const [before, after] = Array.isArray(pair) ? pair : [undefined, pair]
          return { col, text: `${show(before)} → ${show(after)}` }
        })
    }
    if (r.action === "delete") return []
    const keyCols = new Set(["recipe_id", "ingredient_item_id", "item_id", "location_id", "user_id", "from_location_id", "to_location_id", "weekday", "barcode", "name", "full_name", "product_item_id"])
    return Object.entries(changes)
      .filter(([col, v]) => !HIDDEN.has(col) && !keyCols.has(col) && v !== null && v !== "" && v !== false)
      .slice(0, 6)
      .map(([col, v]) => ({ col, text: show(v) }))
  }

  const timeZone = user.locations[0]?.timezone
  const people = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "Unknown" }))
  const olderHref = (() => {
    const params = new URLSearchParams()
    if (area) params.set("area", area)
    if (who) params.set("who", who)
    params.set("before", String(rows.at(-1)?.id ?? ""))
    return `/settings/audit?${params}`
  })()

  return (
    <div className="flex flex-col gap-4">
      <AuditFilters
        areas={Object.entries(AREAS).map(([value, a]) => ({ value, label: a.label }))}
        people={people}
        area={area}
        who={who}
      />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {before ? "No older changes." : "No changes recorded yet."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const list = details(r)
              return (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(r.created_at, timeZone)}</TableCell>
                  <TableCell className="text-sm">
                    {r.actor ? (personName.get(r.actor) ?? "Removed user") : <span className="text-muted-foreground">System</span>}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={r.action === "delete" ? "destructive" : r.action === "insert" ? "secondary" : "outline"}
                      >
                        {ACTION_LABELS[r.action] ?? r.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{TABLE_LABELS[r.table_name] ?? r.table_name}</span>
                    </div>
                    <div className="mt-1 font-medium">{subject(r)}</div>
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    {list.length > 0 && (
                      <ul className="space-y-0.5 text-sm">
                        {list.map((d) => (
                          <li key={d.col}>
                            <span className="text-muted-foreground">{COLUMN_LABELS[d.col] ?? d.col.replaceAll("_", " ")}:</span>{" "}
                            {d.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      <div className="flex gap-2">
        {before && (
          <Link
            href={`/settings/audit${area || who ? `?${new URLSearchParams({ ...(area && { area }), ...(who && { who }) })}` : ""}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Newest
          </Link>
        )}
        {rows.length === PAGE_SIZE && (
          <Link href={olderHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Older changes
          </Link>
        )}
      </div>
    </div>
  )
}
