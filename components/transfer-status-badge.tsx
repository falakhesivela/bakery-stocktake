import { Badge } from "@/components/ui/badge"
import { STATUS_LABELS, type TransferStatus } from "@/lib/transfers"

const STATUS_CLASSES: Record<TransferStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  requested: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  picking: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  in_transit: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  received: "bg-green-500/15 text-green-700 dark:text-green-300",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through",
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return <Badge className={STATUS_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
}
