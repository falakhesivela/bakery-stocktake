import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false, // server render: assume desktop
  )
}

const noSubscribe = () => () => {}

/**
 * False while a component is being hydrated, true afterwards. Use it to keep
 * the first client render identical to the server HTML when output depends on
 * browser-only values (e.g. screen size) that a parent may already know.
 */
export function useHydrated() {
  return React.useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  )
}
