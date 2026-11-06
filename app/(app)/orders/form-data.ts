import "server-only"
import { todayIn } from "@/lib/dates"
import { loadOrderItems } from "@/lib/order-data"
import { createClient } from "@/lib/supabase/server"

/** Locations and items the order form needs. */
export async function loadOrderFormData() {
  const supabase = await createClient()
  const [{ data: locations }, items] = await Promise.all([
    supabase
      .from("locations")
      .select("id, code, name, type, can_produce, timezone")
      .eq("active", true)
      .order("type", { ascending: false }) // stores first
      .order("name"),
    loadOrderItems(),
  ])
  const all = locations ?? []
  return {
    items,
    pickupOptions: all.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      canProduce: l.can_produce,
      today: todayIn(l.timezone),
    })),
    bakeries: all.filter((l) => l.can_produce).map((l) => ({ id: l.id, code: l.code, name: l.name })),
  }
}
