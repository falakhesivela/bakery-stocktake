import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Locations" }

export default function LocationsPage() {
  return (
    <>
      <PageHeader
        title="Locations"
        description="Your stores and warehouses. Stock is tracked separately at each one."
        actions={
          <Link href="/settings/locations/new" className={buttonVariants()}>
            <Plus />
            New location
          </Link>
        }
      />
      <Suspense fallback={<TableSkeleton rows={3} />}>
        <LocationsTable />
      </Suspense>
    </>
  )
}

async function LocationsTable() {
  await requireAdmin()
  const supabase = await createClient()
  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, type, can_produce, timezone, active, user_locations(count)")
    .order("type")
    .order("code")

  if (!locations?.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No locations yet. Add your warehouse and stores to get started.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Location</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Bakes on site</TableHead>
          <TableHead>Timezone</TableHead>
          <TableHead className="text-right">Staff</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {locations.map((l) => (
          <TableRow key={l.id} className={l.active ? "" : "opacity-60"}>
            <TableCell>
              <Link href={`/settings/locations/${l.id}`} className="font-medium hover:underline">
                {l.name}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{l.code}</div>
            </TableCell>
            <TableCell className="capitalize">{l.type}</TableCell>
            <TableCell>{l.can_produce ? "Yes" : "—"}</TableCell>
            <TableCell className="text-sm">{l.timezone}</TableCell>
            <TableCell className="text-right tabular-nums">{l.user_locations[0]?.count ?? 0}</TableCell>
            <TableCell>
              {l.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
