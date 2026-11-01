"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Camera, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { shrinkPhoto } from "@/lib/photos"

/** Take or pick one photo; hands back a shrunk JPEG (or null when removed). */
export function PhotoInput({
  value,
  onChange,
  label = "Photo",
}: {
  value: Blob | null
  onChange: (photo: Blob | null) => void
  label?: string
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  // Free the preview image when it changes or the form goes away.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file) return
          setBusy(true)
          try {
            const photo = await shrinkPhoto(file)
            setPreview(URL.createObjectURL(photo))
            onChange(photo)
          } catch {
            toast.error("Couldn't read that photo. Try another one.")
          } finally {
            setBusy(false)
          }
        }}
      />
      {value && preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview, not a page image */}
          <img src={preview} alt={label} className="size-12 rounded-md object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            className="absolute -top-1.5 -right-1.5 rounded-full bg-background p-0.5 shadow ring-1 ring-border"
            onClick={() => {
              setPreview(null)
              onChange(null)
            }}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Camera />
          {busy ? "Reading…" : label}
        </Button>
      )}
    </div>
  )
}
