import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireUser } from "@/lib/auth"
import { formatDate } from "@/lib/format"
import { isAnyManager } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { SupplierDialog } from "./supplier-dialog"

export const metadata: Metadata = { title: "Suppliers" }

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who delivers your ingredients and packaging. Choose them when you receive a delivery."
        actions={
          <Suspense>
            <AddButton />
          </Suspense>
        }
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <SuppliersContent />
      </Suspense>
    </>
  )
}

async function AddButton() {
  const user = await requireUser()
  return isAnyManager(user) ? <SupplierDialog /> : null
}

async function SuppliersContent() {
  const user = await requireUser()
  const canEdit = isAnyManager(user)
  const supabase = await createClient()
  const [{ data: suppliers }, { data: receipts }] = await Promise.all([
    supabase.from("suppliers").select("*").order("active", { ascending: false }).order("name"),
    supabase.from("goods_receipts").select("supplier_id, received_on").is("voided_at", null),
  ])

  const lastDelivery = new Map<string, string>()
  for (const r of receipts ?? []) {
    if (!r.supplier_id) continue
    const current = lastDelivery.get(r.supplier_id)
    if (!current || r.received_on > current) lastDelivery.set(r.supplier_id, r.received_on)
  }

  if ((suppliers ?? []).length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No suppliers yet.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead className="hidden sm:table-cell">Contact</TableHead>
          <TableHead className="hidden md:table-cell">Last delivery</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {(suppliers ?? []).map((s) => (
          <TableRow key={s.id} className={s.active ? "" : "text-muted-foreground"}>
            <TableCell className="whitespace-normal">
              <div className="font-medium">
                {s.name} {!s.active && <Badge variant="outline">Inactive</Badge>}
              </div>
              {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
              <div className="text-xs text-muted-foreground sm:hidden">
                {[s.contact_name, s.phone].filter(Boolean).join(" · ")}
              </div>
            </TableCell>
            <TableCell className="hidden whitespace-normal text-sm sm:table-cell">
              {s.contact_name && <div>{s.contact_name}</div>}
              {s.phone && (
                <a href={`tel:${s.phone}`} className="block hover:underline">
                  {s.phone}
                </a>
              )}
              {s.email && (
                <a href={`mailto:${s.email}`} className="block text-muted-foreground hover:underline">
                  {s.email}
                </a>
              )}
            </TableCell>
            <TableCell className="hidden md:table-cell">{formatDate(lastDelivery.get(s.id))}</TableCell>
            <TableCell className="text-right">
              {canEdit && (
                <SupplierDialog
                  supplier={{
                    id: s.id,
                    name: s.name,
                    contactName: s.contact_name ?? "",
                    phone: s.phone ?? "",
                    email: s.email ?? "",
                    notes: s.notes ?? "",
                    active: s.active,
                  }}
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
