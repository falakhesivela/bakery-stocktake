import { Badge } from "@/components/ui/badge"
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders"

const CLASSES: Record<OrderStatus, string> = {
  new: "bg-muted text-muted-foreground",
  confirmed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  ready: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  collected: "bg-green-500/15 text-green-700 dark:text-green-300",
  cancelled: "bg-muted text-muted-foreground line-through",
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={CLASSES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
}
