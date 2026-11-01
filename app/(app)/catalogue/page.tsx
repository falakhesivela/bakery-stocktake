import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Plus, Tags, Upload } from "lucide-react"
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
import { requireUser } from "@/lib/auth"
import { formatMoney } from "@/lib/format"
import { ITEM_KINDS, KIND_LABELS } from "@/lib/schemas/item"
import { createClient } from "@/lib/supabase/server"
import { CatalogueFilters } from "./catalogue-filters"

export const metadata: Metadata = { title: "Catalogue" }

export default function CataloguePage({ searchParams }: PageProps<"/catalogue">) {
  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Products you bake and sell, the ingredients that go into them, and packaging."
        actions={
          <Suspense>
            <AdminActions />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <CatalogueContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function AdminActions() {
  const user = await requireUser()
  if (!user.isAdmin) return null
  return (
    <>
      <Link href="/catalogue/categories" className={buttonVariants({ variant: "ghost" })}>
        <Tags />
        Categories
      </Link>
      <Link href="/catalogue/import" className={buttonVariants({ variant: "outline" })}>
        <Upload />
        Import CSV
      </Link>
      <Link href="/catalogue/new" className={buttonVariants()}>
        <Plus />
        New item
      </Link>
    </>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
}

async function CatalogueContent({
  searchParams,
}: {
  searchParams: PageProps<"/catalogue">["searchParams"]
}) {
  const user = await requireUser()
  const sp = await searchParams
  const q = param(sp.q)
  const kindParam = param(sp.kind)
  const kind = (ITEM_KINDS as readonly string[]).includes(kindParam)
    ? (kindParam as (typeof ITEM_KINDS)[number])
    : ""
  const inactive = param(sp.inactive) === "1"

  const supabase = await createClient()

  // An exact barcode match narrows the list to that item.
  let barcodeItemId: string | null = null
  if (q) {
    const { data } = await supabase
      .from("item_barcodes")
      .select("item_id")
      .eq("barcode", q)
      .maybeSingle()
    barcodeItemId = data?.item_id ?? null
  }

  let query = supabase
    .from("items")
    .select(
      "id, sku, name, kind, unit, shelf_life_days, track_batches, cost, price, active, categories(name), item_barcodes(barcode)",
    )
    .order("kind")
    .order("name")
    .limit(1000)

  if (kind) query = query.eq("kind", kind)
  if (!inactive) query = query.eq("active", true)
  if (barcodeItemId) {
    query = query.eq("id", barcodeItemId)
  } else if (q) {
    const search = q.replace(/[,()%*\\]/g, " ").trim()
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
  }

  const { data: items, error } = await query

  return (
    <div className="flex flex-col gap-4">
      <CatalogueFilters current={{ q, kind, inactive }} />
      {error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load the catalogue: {error.message}</p>
      ) : !items?.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {q ? `No items match “${q}”.` : "No items yet."}
          {user.isAdmin && !q && (
            <div className="mt-2">
              <Link href="/catalogue/new" className="underline">
                Add your first item
              </Link>{" "}
              or{" "}
              <Link href="/catalogue/import" className="underline">
                import a CSV
              </Link>
              .
            </div>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Shelf life</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Barcodes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className={item.active ? "" : "opacity-60"}>
                <TableCell>
                  {user.isAdmin ? (
                    <Link href={`/catalogue/${item.id}`} className="font-medium hover:underline">
                      {item.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.name}</span>
                  )}
                  <div className="font-mono text-xs text-muted-foreground">
                    {item.sku}
                    {!item.active && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{KIND_LABELS[item.kind]}</Badge>
                </TableCell>
                <TableCell>{item.categories?.name ?? "—"}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell>
                  {item.track_batches
                    ? item.shelf_life_days !== null
                      ? `${item.shelf_life_days} day${item.shelf_life_days === 1 ? "" : "s"}`
                      : "Batches, no shelf life"
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(item.cost)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(item.price)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {item.item_barcodes.map((b) => b.barcode).join(", ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
