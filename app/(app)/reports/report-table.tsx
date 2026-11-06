import { CsvButton } from "@/components/csv-button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "cn"

type CsvValue = string | number | null

export type Column<T> = {
  header: string
  /** The value in the CSV file (and on screen when there's no `cell`). */
  value: (row: T) => CsvValue
  cell?: (row: T) => React.ReactNode
  numeric?: boolean
  /** Shown in the totals row. */
  total?: React.ReactNode
  className?: string
}

/** A report card: title, CSV download, table and an optional totals row. */
export function ReportTable<T>({
  title,
  description,
  rows,
  columns,
  filename,
  empty = "Nothing in this period.",
}: {
  title: string
  description?: React.ReactNode
  rows: T[]
  columns: Column<T>[]
  filename: string
  empty?: string
}) {
  const csv = rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c.header, round(c.value(row))])),
  )
  const hasTotals = rows.length > 1 && columns.some((c) => c.total !== undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <CsvButton rows={csv} filename={filename} label="CSV" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.header} className={cn(c.numeric && "text-right", c.className)}>
                    {c.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.header}
                      className={cn(c.numeric && "text-right tabular-nums", c.className)}
                    >
                      {c.cell ? c.cell(row) : c.value(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            {hasTotals && (
              <TableFooter>
                <TableRow>
                  {columns.map((c, i) => (
                    <TableCell
                      key={c.header}
                      className={cn("font-medium", c.numeric && "text-right tabular-nums", c.className)}
                    >
                      {c.total ?? (i === 0 ? "Total" : null)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function round(value: CsvValue) {
  return typeof value === "number" ? Math.round(value * 1000) / 1000 : value
}
