"use server"

import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getCurrentUser } from "@/lib/auth"
import { friendlyDbError } from "@/lib/db-errors"
import {
  importRowSchema,
  itemSchema,
  numberOrNull,
  type ImportRow,
} from "@/lib/schemas/item"
import { createClient } from "@/lib/supabase/server"

async function requireAdminAction() {
  const user = await getCurrentUser()
  if (!user) return fail("You are signed out. Sign in again.")
  if (!user.isAdmin) return fail("Only admins can change the catalogue.")
  return null
}

export type ItemFormState = { error?: string }

export async function saveItem(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const denied = await requireAdminAction()
  if (denied) return { error: denied.error }

  const id = String(formData.get("id") ?? "") || null
  const parsed = itemSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    unit: formData.get("unit"),
    categoryId: formData.get("categoryId") ?? "",
    shelfLifeDays: numberOrNull(formData.get("shelfLifeDays")),
    trackBatches: formData.get("trackBatches") === "on",
    cost: numberOrNull(formData.get("cost")),
    price: numberOrNull(formData.get("price")),
    notes: formData.get("notes") ?? "",
    active: formData.get("active") === "on",
    barcodes: String(formData.get("barcodes") ?? "")
      .split(/[\n,]/)
      .map((b) => b.trim())
      .filter(Boolean),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" }
  }

  const item = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc("save_item", {
    p_id: id ?? undefined,
    p_item: {
      sku: item.sku,
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      category_id: item.categoryId,
      shelf_life_days: item.shelfLifeDays,
      track_batches: item.trackBatches,
      cost: item.cost,
      price: item.price,
      notes: item.notes,
      active: item.active,
    },
    p_barcodes: item.barcodes,
  })

  if (error) return { error: friendlyDbError(error) }

  redirect("/catalogue")
}

export async function importItems(
  rows: ImportRow[],
): Promise<ActionResult<{ created: number; updated: number }>> {
  const denied = await requireAdminAction()
  if (denied) return denied

  const parsed = z.array(importRowSchema).min(1).max(2000).safeParse(rows)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Some rows are not valid")
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("import_items", {
    p_rows: parsed.data,
  })
  if (error) return fail(friendlyDbError(error))

  const result = data as { created: number; updated: number }
  return ok(result)
}

const categoryName = z
  .string()
  .trim()
  .min(1, "Enter a category name")
  .max(60, "Name is too long")

export async function createCategory(name: string): Promise<ActionResult> {
  const denied = await requireAdminAction()
  if (denied) return denied
  const parsed = categoryName.safeParse(name)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
  const { error } = await supabase
    .from("categories")
    .insert({ name: parsed.data, sort_order: (count ?? 0) + 1 })
  if (error) return fail(friendlyDbError(error))

  refresh()
  return ok(null)
}

export async function renameCategory(id: string, name: string): Promise<ActionResult> {
  const denied = await requireAdminAction()
  if (denied) return denied
  const parsed = categoryName.safeParse(name)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase
    .from("categories")
    .update({ name: parsed.data })
    .eq("id", id)
  if (error) return fail(friendlyDbError(error))

  refresh()
  return ok(null)
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const denied = await requireAdminAction()
  if (denied) return denied

  // Items in a deleted category simply become uncategorised.
  const supabase = await createClient()
  const { error } = await supabase.from("categories").delete().eq("id", id)
  if (error) return fail(friendlyDbError(error))

  refresh()
  return ok(null)
}
