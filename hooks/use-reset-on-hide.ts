"use client"

import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * Next.js keeps recently visited pages alive but hidden (React Activity), so a
 * form you submitted still shows its old values when you come back to it.
 * Call the returned function after a successful submit with a reset callback;
 * it runs when the page is hidden, so the form is fresh next time. Drafts the
 * user hasn't submitted are left alone.
 */
export function useResetOnHide() {
  const pending = useRef<(() => void) | null>(null)

  useLayoutEffect(
    () => () => {
      pending.current?.()
      pending.current = null
    },
    [],
  )

  return useCallback((reset: () => void) => {
    pending.current = reset
  }, [])
}
