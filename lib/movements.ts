export type MovementType =
  | "opening_balance"
  | "production_in"
  | "ingredient_use"
  | "purchase_in"
  | "transfer_out"
  | "transfer_in"
  | "transfer_loss"
  | "sale"
  | "waste"
  | "count_adjustment"
  | "order_fulfilled"
  | "manual_adjustment"

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  opening_balance: "Opening stock",
  production_in: "Baked",
  ingredient_use: "Used in baking",
  purchase_in: "Supplier delivery",
  transfer_out: "Sent",
  transfer_in: "Received",
  transfer_loss: "Transfer difference",
  sale: "Sold",
  waste: "Waste",
  count_adjustment: "Stock take",
  order_fulfilled: "Customer order",
  manual_adjustment: "Adjustment",
}
