import { Badge } from "@/components/ui/badge"
import { STOCK_TAKE_STATUS_LABELS, type StockTakeStatus } from "@/lib/store-ops"

const CLASSES: Record<StockTakeStatus, string> = {
  counting: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  submitted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-green-500/15 text-green-700 dark:text-green-300",
  cancelled: "bg-muted text-muted-foreground line-through",
}

export function StockTakeStatusBadge({ status }: { status: StockTakeStatus }) {
  return <Badge className={CLASSES[status]}>{STOCK_TAKE_STATUS_LABELS[status]}</Badge>
}
