import type { Metadata } from "next"
import { Suspense } from "react"
import { NotificationList } from "@/components/notifications"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { requireUser } from "@/lib/auth"
import { timeAgo } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Notifications" }

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Requests, deliveries, counts and orders that need you, plus a daily round-up of expiring and low stock. Kept for 60 days."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <NotificationsContent />
      </Suspense>
    </>
  )
}

async function NotificationsContent() {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100)

  const timeZone = user.locations[0]?.timezone
  return (
    <NotificationList
      initial={(data ?? []).map((n) => ({ ...n, when: timeAgo(n.created_at, undefined, timeZone) }))}
    />
  )
}
