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
import { ROLE_LABELS } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Users" }

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts and what each person can do at each location."
        actions={
          <Link href="/settings/users/new" className={buttonVariants()}>
            <Plus />
            New user
          </Link>
        }
      />
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <UsersTable />
      </Suspense>
    </>
  )
}

async function UsersTable() {
  await requireAdmin()
  const supabase = await createClient()
  const { data: users } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_admin, active, user_locations(role, locations(code))")
    .order("active", { ascending: false })
    .order("full_name")

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Person</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(users ?? []).map((u) => (
          <TableRow key={u.id} className={u.active ? "" : "opacity-60"}>
            <TableCell>
              <Link href={`/settings/users/${u.id}`} className="font-medium hover:underline">
                {u.full_name || u.email}
              </Link>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {u.is_admin && <Badge>Admin</Badge>}
                {u.user_locations.map((ul) => (
                  <Badge key={`${ul.locations?.code}-${ul.role}`} variant="secondary">
                    {ul.locations?.code} · {ROLE_LABELS[ul.role]}
                  </Badge>
                ))}
                {!u.is_admin && u.user_locations.length === 0 && (
                  <span className="text-sm text-muted-foreground">No location yet</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              {u.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Deactivated</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
