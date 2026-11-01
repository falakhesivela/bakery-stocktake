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
import { requireUser } from "@/lib/auth"
import { formatMoney, formatQty } from "@/lib/format"
import { canEditRecipes } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Recipes" }

export default function RecipesPage() {
  return (
    <>
      <PageHeader
        title="Recipes"
        description="What goes into each product. Logging a bake takes these ingredients out of stock, and the cost to make each product comes from the ingredients' cost prices."
      />
      <Suspense fallback={<TableSkeleton />}>
        <RecipesContent />
      </Suspense>
    </>
  )
}

type Unit = "each" | "g" | "kg" | "ml" | "l"

async function RecipesContent() {
  const user = await requireUser()
  const canEdit = canEditRecipes(user)

  const supabase = await createClient()
  const [{ data: products }, { data: costs }] = await Promise.all([
    supabase
      .from("items")
      .select("id, sku, name, kind, unit, price, cost, categories(name)")
      .eq("active", true)
      .order("name"),
    supabase
      .from("recipe_costs")
      .select("product_item_id, yield_qty, line_count, lines_without_cost, unit_cost"),
  ])

  const costByProduct = new Map((costs ?? []).map((c) => [c.product_item_id!, c]))
  // Products, plus anything else made in-house (has a recipe).
  const rows = (products ?? []).filter((p) => p.kind === "product" || costByProduct.has(p.id))
  const missing = rows.filter((r) => !costByProduct.has(r.id)).length

  return (
    <div className="flex flex-col gap-4">
      {missing > 0 && (
        <p className="text-sm text-muted-foreground">
          {missing} product{missing === 1 ? " has" : "s have"} no recipe yet, so baking{" "}
          {missing === 1 ? "it doesn't" : "them doesn't"} use up any ingredients.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="hidden sm:table-cell">Recipe makes</TableHead>
            <TableHead className="text-right">Cost to make</TableHead>
            <TableHead className="hidden text-right md:table-cell">Price</TableHead>
            <TableHead className="hidden text-right md:table-cell">Margin</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const c = costByProduct.get(p.id)
            const unitCost = c ? Number(c.unit_cost) : null
            const price = p.price === null ? null : Number(p.price)
            const margin = unitCost !== null && price ? ((price - unitCost) / price) * 100 : null
            return (
              <TableRow key={p.id}>
                <TableCell className="whitespace-normal">
                  <Link href={`/recipes/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{p.sku}</span>
                    {p.categories?.name && <Badge variant="outline">{p.categories.name}</Badge>}
                    {c && Number(c.lines_without_cost) > 0 && (
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                        {c.lines_without_cost} without cost
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {c ? (
                    `${formatQty(Number(c.yield_qty), p.unit as Unit)} · ${c.line_count} ingredient${c.line_count === 1 ? "" : "s"}`
                  ) : (
                    <span className="text-muted-foreground">No recipe</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {unitCost === null ? "—" : formatMoney(unitCost)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {formatMoney(price)}
                </TableCell>
                <TableCell
                  className={`hidden text-right tabular-nums md:table-cell ${margin !== null && margin < 50 ? "text-amber-700 dark:text-amber-400" : ""}`}
                >
                  {margin === null ? "—" : `${Math.round(margin)}%`}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/recipes/${p.id}`}
                    className={buttonVariants({ size: "sm", variant: c ? "ghost" : canEdit ? "outline" : "ghost" })}
                  >
                    {c ? (canEdit ? "Edit" : "View") : canEdit ? "Add recipe" : "View"}
                  </Link>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
