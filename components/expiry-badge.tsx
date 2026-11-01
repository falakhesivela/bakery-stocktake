import { Badge } from "@/components/ui/badge"
import { expiryStatus, formatDate } from "@/lib/format"

export function ExpiryBadge({
  bestBefore,
  daysToExpiry,
}: {
  bestBefore: string | null
  daysToExpiry: number | null
}) {
  const status = expiryStatus(daysToExpiry)

  if (status === "none") {
    return <span className="text-muted-foreground">—</span>
  }

  const date = formatDate(bestBefore)

  switch (status) {
    case "expired":
      return <Badge variant="destructive">Expired {date}</Badge>
    case "today":
      return (
        <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-300">
          Today
        </Badge>
      )
    case "soon":
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
          Tomorrow
        </Badge>
      )
    default:
      return <span className="text-sm">{date}</span>
  }
}
