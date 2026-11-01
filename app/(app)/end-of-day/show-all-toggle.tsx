"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Switch } from "@/components/ui/switch"

export function ShowAllToggle({ showAll }: { showAll: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch
        checked={showAll}
        onCheckedChange={(checked) => {
          const params = new URLSearchParams(searchParams.toString())
          if (checked) params.set("all", "1")
          else params.delete("all")
          startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }))
        }}
      />
      Ingredients & packaging too
    </label>
  )
}
