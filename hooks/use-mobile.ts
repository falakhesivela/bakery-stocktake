import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * True on phone-sized screens. Starts as false (what the server renders) and
 * switches after the page has loaded, as a low-priority (transition) update.
 *
 * Why not useSyncExternalStore: its client value differs from the server's on
 * phones, which makes React apply an urgent update right after hydration. At
 * the root of the app that makes React give up hydrating content that is
 * still streaming in and re-render the whole page in the browser instead
 * (slower, and anything typed in the meantime is lost).
 */
/** Whether the screen is phone-sized right now (for event handlers). */
export function isMobileScreen() {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const sync = () => React.startTransition(() => setIsMobile(mql.matches))
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])

  return isMobile
}
