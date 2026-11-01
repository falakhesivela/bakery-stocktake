type DbError = { code?: string; message: string; details?: string | null }

const UNIQUE_MESSAGES: Record<string, string> = {
  items_sku_key: "That SKU is already used by another item.",
  item_barcodes_pkey: "That barcode is already used by another item.",
  locations_code_key: "That location code is already used.",
  categories_name_key: "A category with that name already exists.",
  user_locations_pkey: "This person already has a role at that location.",
}

/** Turns a Postgres/PostgREST error into a message staff can act on. */
export function friendlyDbError(error: DbError): string {
  const text = `${error.message} ${error.details ?? ""}`

  if (error.code === "23505") {
    for (const [constraint, message] of Object.entries(UNIQUE_MESSAGES)) {
      if (text.includes(constraint)) return message
    }
    return error.message.startsWith("duplicate key")
      ? "That value is already used."
      : error.message
  }
  if (error.code === "42501") {
    // Our SQL functions raise 42501 with a message written for staff;
    // Postgres' own permission errors start with "permission denied".
    return error.message && !error.message.startsWith("permission denied")
      ? error.message
      : "You don't have permission to do that."
  }
  if (error.code === "23503") {
    return "This is still used elsewhere, so it can't be removed. Mark it inactive instead."
  }
  if (error.code === "22P02") {
    return "Something in the form isn't valid. Reload the page and try again."
  }
  if (error.code === "P0001") {
    // Messages raised on purpose in our SQL functions are written for staff.
    return error.message
  }
  return `Something went wrong: ${error.message}`
}
