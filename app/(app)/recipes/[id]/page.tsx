import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { canEditRecipes } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { RecipeForm } from "./recipe-form"

export const metadata: Metadata = { title: "Recipe" }

export default function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  return (
    <>
      <Link href="/recipes" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Recipes
      </Link>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <RecipeContent params={params} />
      </Suspense>
    </>
  )
}

type Unit = "each" | "g" | "kg" | "ml" | "l"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function RecipeContent({ params }: { params: PageProps<"/recipes/[id]">["params"] }) {
  const user = await requireUser()
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: product }, { data: recipe }, { data: items }] = await Promise.all([
    supabase.from("items").select("id, sku, name, kind, unit, price, cost").eq("id", id).maybeSingle(),
    supabase
      .from("recipes")
      .select("yield_qty, notes, updated_at, profiles(full_name), recipe_lines(qty, ingredient_item_id)")
      .eq("product_item_id", id)
      .maybeSingle(),
    supabase
      .from("items")
      .select("id, sku, name, kind, unit, cost, active")
      .neq("id", id)
      .order("kind", { ascending: false }) // ingredients and packaging before products
      .order("name"),
  ])
  if (!product) notFound()

  const canEdit = canEditRecipes(user)

  return (
    <>
      <PageHeader
        title={`Recipe: ${product.name}`}
        description={
          canEdit
            ? "Amounts are in each ingredient's own unit (kg, litres or each). Every bake of this product takes out its share of these."
            : "Only admins and bakery managers can change recipes."
        }
      />
      <RecipeForm
        key={recipe?.updated_at ?? "new"}
        product={{
          id: product.id,
          name: product.name,
          unit: product.unit as Unit,
          price: product.price === null ? null : Number(product.price),
          cost: product.cost === null ? null : Number(product.cost),
        }}
        canEdit={canEdit}
        canSetCost={user.isAdmin}
        hasRecipe={Boolean(recipe)}
        initial={{
          yieldQty: recipe ? String(Number(recipe.yield_qty)) : "1",
          notes: recipe?.notes ?? "",
          lines: (recipe?.recipe_lines ?? []).map((l) => ({
            itemId: l.ingredient_item_id,
            qty: String(Number(l.qty)),
          })),
        }}
        ingredients={(items ?? [])
          .filter((i) => i.active || recipe?.recipe_lines.some((l) => l.ingredient_item_id === i.id))
          .map((i) => ({
            id: i.id,
            sku: i.sku,
            name: i.name,
            kind: i.kind,
            unit: i.unit as Unit,
            cost: i.cost === null ? null : Number(i.cost),
          }))}
        updatedBy={recipe?.profiles?.full_name ?? null}
      />
    </>
  )
}
