"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, startTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Bell,
  CakeSlice,
  CheckCheck,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  Inbox,
  PackageMinus,
  ShoppingBag,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { timeAgo } from "@/lib/format"
import { createClient } from "@/lib/supabase/client"
import { cn } from "cn"

export type AppNotification = {
  id: number
  kind: string
  title: string
  body: string | null
  link: string | null
  created_at: string
  read_at: string | null
}

/** Sent on window when notifications were marked read, so every list reloads. */
const CHANGED = "notifications:changed"
const POLL_MS = 60_000

const ICONS: Record<string, LucideIcon> = {
  transfer_requested: Inbox,
  transfer_approved: CircleCheck,
  transfer_rejected: CircleX,
  transfer_dispatched: Truck,
  transfer_differences: TriangleAlert,
  count_submitted: ClipboardCheck,
  order_to_make: CakeSlice,
  order_made: ShoppingBag,
  order_cancelled: CircleX,
  expiry: Clock,
  low_stock: PackageMinus,
  orders_due: CakeSlice,
}

export function NotificationIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICONS[kind] ?? Bell
  return <Icon className={cn("size-4 shrink-0", className)} />
}

/** Marks notifications read (all of the user's when `ids` is left out). */
export async function markNotificationsRead(ids?: number[]) {
  const { error } = await createClient().rpc("mark_notifications_read", { p_ids: ids })
  window.dispatchEvent(new Event(CHANGED))
  return !error
}

/** The bell in the page header, with the newest notifications in a menu. */
export function NotificationBell() {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<{ unread: number; items: AppNotification[] }>({
    unread: 0,
    items: [],
  })

  const load = useCallback(async () => {
    const supabase = createClient()
    const [list, unread] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, kind, title, body, link, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ])
    if (list.error || unread.error) return
    startTransition(() => setState({ unread: unread.count ?? 0, items: list.data }))
  }, [])

  // Check on every page change, when the tab comes back, and once a minute.
  useEffect(() => {
    void load()
  }, [load, pathname])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load()
    }
    const timer = window.setInterval(refresh, POLL_MS)
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener(CHANGED, refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener(CHANGED, refresh)
    }
  }, [load])

  function open(n: AppNotification) {
    if (!n.read_at) {
      setState((s) => ({
        unread: Math.max(0, s.unread - 1),
        items: s.items.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)),
      }))
      void markNotificationsRead([n.id])
    }
    if (n.link) router.push(n.link)
  }

  const label = state.unread > 0 ? `Notifications, ${state.unread} unread` : "Notifications"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={label} title={label} className="relative" />}
      >
        <Bell />
        {state.unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
            {state.unread > 99 ? "99+" : state.unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span className="font-medium text-foreground">Notifications</span>
            {state.unread > 0 && <span className="text-xs font-normal">{state.unread} unread</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {state.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <DropdownMenuGroup>
            {state.items.map((n) => (
              <DropdownMenuItem key={n.id} onClick={() => open(n)} className="items-start gap-2 py-2">
                <NotificationIcon kind={n.kind} className="mt-0.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm leading-snug", !n.read_at && "font-semibold")}>{n.title}</div>
                  {n.body && <div className="truncate text-xs text-muted-foreground">{n.body}</div>}
                  <div className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</div>
                </div>
                {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {state.unread > 0 && (
            <DropdownMenuItem onClick={() => void markNotificationsRead()}>
              <CheckCheck />
              Mark all as read
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<Link href="/notifications" />}>
            <Bell />
            See all notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Header placeholder while the bell loads (it reads the URL). */
export function NotificationBellFallback() {
  return (
    <Button variant="ghost" size="icon" aria-label="Notifications" disabled>
      <Bell />
    </Button>
  )
}

/** The full list on /notifications. `when` is worked out on the server so it hydrates cleanly. */
export function NotificationList({ initial }: { initial: (AppNotification & { when: string })[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const unread = items.filter((n) => !n.read_at).length

  function markRead(ids?: number[]) {
    const now = new Date().toISOString()
    setItems((current) => current.map((n) => (!ids || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
    void markNotificationsRead(ids).then(() => router.refresh())
  }

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">You have no notifications.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : "All read"}</span>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markRead()}>
            <CheckCheck />
            Mark all as read
          </Button>
        )}
      </div>
      <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
        {items.map((n) => {
          const content = (
            <>
              <NotificationIcon kind={n.kind} className="mt-0.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</div>
                {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                <div className="text-xs text-muted-foreground">{n.when}</div>
              </div>
              {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            </>
          )
          return (
            <li key={n.id}>
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => !n.read_at && markRead([n.id])}
                  className="flex items-start gap-3 p-3 hover:bg-muted/50"
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => !n.read_at && markRead([n.id])}
                  className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50"
                >
                  {content}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
