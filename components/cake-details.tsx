import { CAKE_FIELDS, type CakeDetails } from "@/lib/orders"

/** The custom cake fields that were filled in, with the wording stood out. */
export function CakeDetailsView({ details, compact = false }: { details: CakeDetails | null; compact?: boolean }) {
  if (!details) return null
  const filled = CAKE_FIELDS.filter((f) => details[f.key])
  if (filled.length === 0) return null
  return (
    <dl className={`grid gap-x-3 gap-y-0.5 ${compact ? "text-xs" : "text-sm"} grid-cols-[auto_1fr]`}>
      {filled.map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className={f.key === "inscription" ? "font-semibold" : ""}>
            {f.key === "inscription" ? `“${details[f.key]}”` : details[f.key]}
          </dd>
        </div>
      ))}
    </dl>
  )
}
