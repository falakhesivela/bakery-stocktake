import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireUser } from "@/lib/auth"
import { loadOrder } from "@/lib/order-data"
import { orderPermissions } from "@/lib/orders"
import { loadOrderFormData } from "../../form-data"
import { OrderForm } from "../../order-form"

export const metadata: Metadata = { title: "Change order" }

export default function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  return (
    <Suspense fallback={<TableSkeleton rows={6} />}>
      <EditOrderContent params={params} />
    </Suspense>
  )
}

async function EditOrderContent({ params }: { params: PageProps<"/orders/[id]/edit">["params"] }) {
  const user = await requireUser()
  const { id } = await params
  const order = await loadOrder(id)
  if (!order) notFound()

  const perms = orderPermissions(user, {
    status: order.status,
    takenAtLocationId: order.takenAt.id,
    pickupLocationId: order.pickup.id,
    fulfilLocationId: order.fulfil.id,
  })
  if (!perms.edit) redirect(`/orders/${order.code}`)

  const { items, pickupOptions, bakeries } = await loadOrderFormData()
  // Keep items that were deactivated after the order was taken.
  for (const line of order.lines) {
    if (!items.some((i) => i.id === line.itemId)) {
      items.push({
        id: line.itemId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        price: line.unitPrice,
        madeToOrder: line.madeToOrder,
      })
    }
  }

  return (
    <>
      <PageHeader title={`Change ${order.code}`} description={`${order.customer.name}'s order.`} />
      <OrderForm
        key={order.updatedAt}
        isNew={false}
        cancelHref={`/orders/${order.code}`}
        items={items}
        pickupOptions={pickupOptions}
        bakeries={bakeries}
        takenAtOptions={[]}
        initial={{
          id: order.id,
          customerName: order.customer.name,
          customerPhone: order.customer.phone ?? "",
          customerEmail: order.customer.email ?? "",
          takenAtLocationId: order.takenAt.id,
          pickupLocationId: order.pickup.id,
          fulfilLocationId: order.fulfil.id,
          pickupDate: order.pickupDate,
          pickupTime: order.pickupTime ?? "",
          notes: order.notes ?? "",
          deposit: order.deposit ? String(order.deposit) : "",
          lines: order.lines.map((l) => ({
            itemId: l.itemId,
            custom: l.madeToOrder,
            qty: String(l.qty),
            unitPrice: String(l.unitPrice),
            details: l.details ?? {},
            photoPath: l.photoPath,
            photoUrl: l.photoUrl,
          })),
        }}
      />
    </>
  )
}
