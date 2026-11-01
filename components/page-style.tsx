"use client"

/**
 * A page-level <style> (e.g. @page size for printing) that switches itself off
 * while Next.js keeps the page hidden after navigating away, so it can't
 * affect the page that is showing.
 */
export function PageStyle({ css }: { css: string }) {
  return (
    <style
      ref={(style) => {
        if (style) style.media = ""
        return () => {
          if (style) style.media = "not all"
        }
      }}
    >
      {css}
    </style>
  )
}
