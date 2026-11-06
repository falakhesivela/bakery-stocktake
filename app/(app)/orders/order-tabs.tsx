"use client"

import { useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type OrderTab = "collect" | "make" | "open" | "done"

export function OrderTabs({ tab }: { tab: OrderTab }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  return (
    <Tabs
      value={tab}
      data-pending={pending || undefined}
      className="data-pending:opacity-70"
      onValueChange={(value) =>
        startTransition(() => router.replace(`${pathname}?tab=${value}`, { scroll: false }))
      }
    >
      <TabsList>
        <TabsTrigger value="collect">To collect</TabsTrigger>
        <TabsTrigger value="make">To make</TabsTrigger>
        <TabsTrigger value="open">All open</TabsTrigger>
        <TabsTrigger value="done">Done</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
