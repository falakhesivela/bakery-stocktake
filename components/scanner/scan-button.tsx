"use client"

import { useEffect, useRef, useState } from "react"
import { ScanLine } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

// Minimal typing for the browser BarcodeDetector API (Chrome/Android/Edge).
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}
type BarcodeDetectorClass = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance
  getSupportedFormats?: () => Promise<string[]>
}

const WANTED_FORMATS = [
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "qr_code",
  "data_matrix",
]

type ScanButtonProps = {
  onScan: (code: string) => void
  label?: string
  title?: string
  size?: "default" | "sm" | "lg" | "icon"
  variant?: "default" | "outline" | "secondary" | "ghost"
}

/**
 * Button that opens the camera and returns the first barcode it reads.
 * USB/Bluetooth scanners don't need this: they type into the focused input.
 */
export function ScanButton({
  onScan,
  label = "Scan",
  title = "Scan a barcode",
  size = "default",
  variant = "outline",
}: ScanButtonProps) {
  const [open, setOpen] = useState(false)

  function handleCode(code: string) {
    setOpen(false)
    onScan(code)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={label}
          />
        }
      >
        <ScanLine />
        {size !== "icon" && label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Point the camera at the barcode or label, or type the code below.
          </DialogDescription>
        </DialogHeader>
        {open && <CameraScanner onDetected={handleCode} />}
        <ManualEntry onSubmit={handleCode} />
      </DialogContent>
    </Dialog>
  )
}

function CameraScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDetectedRef = useRef(onDetected)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let zxingControls: { stop: () => void } | null = null

    const finish = (code: string) => {
      if (stopped || !code.trim()) return
      stopped = true
      navigator.vibrate?.(80)
      onDetectedRef.current(code.trim())
    }

    const constraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    }

    async function start() {
      const video = videoRef.current
      if (!video) return

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "The camera isn't available here. It needs a secure (https) connection. You can type the code instead.",
        )
        setStarting(false)
        return
      }

      try {
        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass })
          .BarcodeDetector

        if (Detector) {
          const supported = (await Detector.getSupportedFormats?.()) ?? WANTED_FORMATS
          const formats = WANTED_FORMATS.filter((f) => supported.includes(f))
          const detector = new Detector({ formats })

          stream = await navigator.mediaDevices.getUserMedia(constraints)
          if (stopped) return
          video.srcObject = stream
          await video.play()
          setStarting(false)

          const tick = async () => {
            if (stopped) return
            try {
              const codes = await detector.detect(video)
              if (codes.length > 0) return finish(codes[0].rawValue)
            } catch {
              // Frame not ready yet; try again.
            }
            timer = setTimeout(tick, 150)
          }
          tick()
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser")
          const reader = new BrowserMultiFormatReader()
          zxingControls = await reader.decodeFromConstraints(
            constraints,
            video,
            (result) => {
              if (result) finish(result.getText())
            },
          )
          setStarting(false)
          if (stopped) zxingControls.stop()
        }
      } catch (err) {
        setStarting(false)
        const name = err instanceof DOMException ? err.name : ""
        if (name === "NotAllowedError") {
          setError("Camera permission was denied. Allow camera access in your browser settings, or type the code.")
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("No camera was found on this device. Type the code instead.")
        } else {
          setError("Couldn't start the camera. Type the code instead.")
        }
      }
    }

    start()

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
      zxingControls?.stop()
    }
  }, [])

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          {starting && (
            <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">
              Starting camera…
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ManualEntry({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("")

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type barcode, SKU or batch code"
        aria-label="Code"
      />
      <Button type="submit" variant="secondary">
        Use code
      </Button>
    </form>
  )
}
