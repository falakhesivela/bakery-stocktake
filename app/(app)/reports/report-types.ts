export const REPORTS = [
  { value: "overview", label: "Overview" },
  { value: "sales", label: "Sales" },
  { value: "waste", label: "Waste" },
  { value: "sell-through", label: "Received, sold & wasted" },
  { value: "stock-value", label: "Stock value" },
  { value: "production", label: "Production" },
  { value: "ingredients", label: "Ingredient use" },
  { value: "counts", label: "Count differences" },
  { value: "deliveries", label: "Delivery differences" },
] as const

export type ReportType = (typeof REPORTS)[number]["value"]

export function isReportType(value: string): value is ReportType {
  return REPORTS.some((r) => r.value === value)
}
