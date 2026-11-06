import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { addDays } from "@/lib/dates"
import { workLocations } from "@/lib/permissions"
import { defaultStoreLocation } from "@/lib/store-ops"
import { loadOrderFormData } from "../form-data"
import { OrderForm } from "../order-form"

export const metadata: Metadata = { title: "New order" }

export default function NewOrderPage() {
  return (
    <>
      <Link href="/orders" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Customer orders
      </Link>
      <PageHeader
        title="New customer order"
        description="A custom cake or a pre-order. Confirmed orders go on the bakery's list for their day."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <NewOrderContent />
      </Suspense>
    </>
  )
}

async function NewOrderContent() {
  const user = await requireUser()
  const locations = workLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">You don&apos;t work at a location that takes orders.</p>
  }
  const { items, pickupOptions, bakeries } = await loadOrderFormData()
  const takenAt = defaultStoreLocation(locations)
  const pickup = pickupOptions.find((l) => l.id === takenAt.id) ?? pickupOptions[0]
  const fulfil = pickup.canProduce ? pickup.id : (bakeries[0]?.id ?? pickup.id)

  return (
    <OrderForm
      isNew
      cancelHref="/orders"
      items={items}
      pickupOptions={pickupOptions}
      bakeries={bakeries}
      takenAtOptions={locations.map((l) => ({ id: l.id, code: l.code, name: l.name }))}
      initial={{
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        takenAtLocationId: takenAt.id,
        pickupLocationId: pickup.id,
        fulfilLocationId: fulfil,
        pickupDate: addDays(pickup.today, 1),
        pickupTime: "",
        notes: "",
        deposit: "",
        lines: [],
      }}
    />
  )
}
