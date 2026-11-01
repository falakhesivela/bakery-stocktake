import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { todayIn } from "@/lib/dates"
import { workLocations } from "@/lib/permissions"
import { defaultStoreLocation } from "@/lib/store-ops"
import { createClient } from "@/lib/supabase/server"
import { NewCountForm } from "./new-count-form"

export const metadata: Metadata = { title: "New count" }

export default function NewCountPage({ searchParams }: PageProps<"/stock-takes/new">) {
  return (
    <>
      <Link href="/stock-takes" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-fit`}>
        <ArrowLeft />
        Stock takes
      </Link>
      <PageHeader
        title="New count"
        description="Several people can count at the same time on their phones. When you're done, a manager approves the differences."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <NewCountContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function NewCountContent({ searchParams }: { searchParams: PageProps<"/stock-takes/new">["searchParams"] }) {
  const user = await requireUser()
  const locations = workLocations(user)
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">You don&apos;t work at a location that holds stock.</p>
  }
  const sp = await searchParams
  const location = locations.find((l) => l.id === sp.location) ?? defaultStoreLocation(locations)

  const supabase = await createClient()
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("sort_order")
    .order("name")

  return (
    <NewCountForm
      locations={locations.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        today: todayIn(l.timezone),
      }))}
      defaultLocationId={location.id}
      categories={categories ?? []}
    />
  )
}
