import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { requireUser } from "@/lib/auth"
import { barcodeSvg } from "@/lib/barcode/svg"
import { formatDate } from "@/lib/format"
import { canPrintLabels } from "@/lib/permissions"
import { safeNextPath } from "@/lib/safe-redirect"
import { createClient } from "@/lib/supabase/server"
import { PageStyle } from "@/components/page-style"
import { PrintToolbar } from "@/components/print-toolbar"

export const metadata: Metadata = { title: "Print labels" }

type Size = "58x40" | "50x25" | "a4"

const PAGE_CSS: Record<Size, string> = {
  "58x40": "@page { size: 58mm 40mm; margin: 0 }",
  "50x25": "@page { size: 50mm 25mm; margin: 0 }",
  a4: "@page { size: A4; margin: 15mm 7mm }",
}

const LABEL_BOX: Record<Size, string> = {
  "58x40": "w-[58mm] h-[40mm] p-[2.5mm] break-after-page",
  "50x25": "w-[50mm] h-[25mm] p-[1.5mm] break-after-page",
  a4: "w-[63.5mm] h-[38.1mm] p-[2.5mm]",
}

type Label = {
  title: string
  code: string
  lines: string[]
}

export default function PrintLabelsPage({ searchParams }: PageProps<"/labels/print">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Preparing labels…</p>}>
      <Labels searchParams={searchParams} />
    </Suspense>
  )
}

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

async function Labels({ searchParams }: { searchParams: PageProps<"/labels/print">["searchParams"] }) {
  const user = await requireUser()
  if (!canPrintLabels(user)) redirect("/dashboard")

  const sp = await searchParams
  const type = param(sp.type)
  const id = param(sp.id)
  const copies = Math.min(200, Math.max(1, Math.floor(Number(param(sp.copies)) || 1)))
  const sizeParam = param(sp.size)
  const size: Size = sizeParam === "50x25" || sizeParam === "a4" ? sizeParam : "58x40"
  const back = sp.back ? safeNextPath(param(sp.back)) : "/labels"

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  let label: Label | null = null

  if (type === "batch") {
    const { data: batch } = await supabase
      .from("batches")
      .select("code, produced_on, best_before, items(name, sku)")
      .eq("id", id)
      .maybeSingle()
    if (batch) {
      label = {
        title: batch.items?.name ?? "",
        code: batch.code,
        lines: [
          `Baked ${formatDate(batch.produced_on)}`,
          batch.best_before ? `Best before ${formatDate(batch.best_before)}` : "",
        ].filter(Boolean),
      }
    }
  } else if (type === "item") {
    const { data: item } = await supabase
      .from("items")
      .select("name, sku, item_barcodes(barcode)")
      .eq("id", id)
      .maybeSingle()
    if (item) {
      label = {
        title: item.name,
        code: item.item_barcodes[0]?.barcode ?? item.sku,
        lines: [item.sku],
      }
    }
  }

  if (!label) notFound()

  const svg = barcodeSvg(label.code, { height: size === "50x25" ? 7 : 10 })
  const small = size === "50x25"

  return (
    <>
      <PageStyle css={PAGE_CSS[size]} />
      <PrintToolbar
        count={copies}
        backHref={back}
        backLabel={back.startsWith("/labels") ? "Back to labels" : "Back"}
      />
      <div
        className={
          size === "a4"
            ? "mx-auto grid w-fit grid-cols-3 gap-x-[2.5mm] p-4 print:p-0"
            : "flex flex-col items-center gap-4 p-4 print:block print:p-0"
        }
      >
        {Array.from({ length: copies }).map((_, i) => (
          <div
            key={i}
            className={`${LABEL_BOX[size]} flex flex-col justify-between overflow-hidden bg-white text-black outline outline-1 outline-neutral-300 print:outline-none`}
          >
            <div>
              <div className={`${small ? "text-[8pt]" : "text-[10pt]"} leading-tight font-bold`}>
                {label.title}
              </div>
              {label.lines.map((line) => (
                <div key={line} className={`${small ? "text-[6.5pt]" : "text-[8pt]"} leading-tight`}>
                  {line}
                </div>
              ))}
            </div>
            <div>
              <div
                className="[&_svg]:h-auto [&_svg]:max-h-[14mm] [&_svg]:w-full"
                // SVG is generated on the server by bwip-js from our own data.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <div className={`${small ? "text-[6.5pt]" : "text-[8pt]"} text-center font-mono tracking-wide`}>
                {label.code}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
