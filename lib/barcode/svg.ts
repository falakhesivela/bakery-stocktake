import "server-only"
import { toSVG } from "bwip-js/node"

/** EAN-13 with a valid check digit. */
function isEan13(code: string) {
  if (!/^\d{13}$/.test(code)) return false
  const digits = code.split("").map(Number)
  const sum = digits
    .slice(0, 12)
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10 === digits[12]
}

/**
 * Renders a barcode as an SVG string. Uses EAN-13 for valid retail codes and
 * Code 128 for everything else (SKUs, batch codes). Text is drawn separately
 * in HTML, so the SVG only contains bars.
 */
export function barcodeSvg(code: string, options: { height?: number } = {}) {
  return toSVG({
    bcid: isEan13(code) ? "ean13" : "code128",
    text: code,
    height: options.height ?? 10,
    scale: 2,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  })
}

/** QR code as an SVG string (for delivery notes). */
export function qrSvg(text: string) {
  return toSVG({
    bcid: "qrcode",
    text,
    scale: 2,
    paddingwidth: 0,
    paddingheight: 0,
  })
}
