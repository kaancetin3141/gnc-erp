// ============================================================
// Sunucu tarafı PDF üretimi — pdf-lib + DejaVu (Türkçe karakter
// desteği). Fontlar public/fonts altındadır; build scripti public/
// klasörünü standalone çıktıya kopyaladığı için fs ile okunabilir.
// Tüm gerçek PDF route'ları (fatura, veresiye ekstresi, ...) bu
// yardımcıları kullanır.
// ============================================================

import fs from 'fs'
import path from 'path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from 'pdf-lib'

// Route'lar pdf-lib'ı doğrudan bilmesin diye re-export
export { rgb }
export type { RGB }

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')

let _regular: Buffer | null = null
let _bold: Buffer | null = null

function fontBytes(kind: 'regular' | 'bold'): Buffer {
  if (kind === 'regular') {
    if (!_regular) _regular = fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans.ttf'))
    return _regular
  }
  if (!_bold) _bold = fs.readFileSync(path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'))
  return _bold
}

export const A4 = { w: 595.28, h: 841.89 }

export const INK: RGB = rgb(0.07, 0.09, 0.12)
export const MUTED: RGB = rgb(0.42, 0.45, 0.5)
export const LINE = rgb(0.85, 0.87, 0.89)
export const ZEBRA = rgb(0.96, 0.97, 0.975)

export interface PdfCtx {
  doc: PDFDocument
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  primary: RGB
  accent: RGB
}

export async function createPdf(opts?: { primary?: string; accent?: string }): Promise<PdfCtx> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const regular = await doc.embedFont(fontBytes('regular'), { subset: true })
  const bold = await doc.embedFont(fontBytes('bold'), { subset: true })
  const page = doc.addPage([A4.w, A4.h])
  return {
    doc,
    page,
    regular,
    bold,
    primary: hexToRgb(opts?.primary || '#10b981'),
    accent: hexToRgb(opts?.accent || '#0d9488'),
  }
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return rgb(0.06, 0.73, 0.51)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** pdf-lib'e güvenli metin (kontrol karakterlerini temizle) */
export function tr(s: unknown): string {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\v\f]/g, ' ')
}

export interface DrawOpts {
  font: PDFFont
  size: number
  color?: RGB
}

/** Sol hizalı metin çiz */
export function drawText(page: PDFPage, text: string, x: number, y: number, o: DrawOpts): void {
  page.drawText(tr(text), { x, y, size: o.size, font: o.font, color: o.color ?? INK })
}

/** Sağ hizalı metin çiz (xRight = sağ kenar x'i) */
export function drawRight(page: PDFPage, text: string, xRight: number, y: number, o: DrawOpts): void {
  const t = tr(text)
  const w = o.font.widthOfTextAtSize(t, o.size)
  page.drawText(t, { x: xRight - w, y, size: o.size, font: o.font, color: o.color ?? INK })
}

/** Ortalanmış metin çiz */
export function drawCenter(page: PDFPage, text: string, cx: number, y: number, o: DrawOpts): void {
  const t = tr(text)
  const w = o.font.widthOfTextAtSize(t, o.size)
  page.drawText(t, { x: cx - w / 2, y, size: o.size, font: o.font, color: o.color ?? INK })
}

/** Metni maxWidth'e göre satırlara böl */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = tr(text)
  const out: string[] = []
  for (const para of clean.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(cand, size) <= maxWidth) {
        line = cand
      } else {
        if (line) out.push(line)
        // tek kelime satırdan uzunsa sert kes
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = ''
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk)
              chunk = ch
            } else chunk += ch
          }
          line = chunk
        } else line = w
      }
    }
    if (line) out.push(line)
  }
  return out
}

export function fmtMoney(n: number, currency = 'TRY'): string {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n || 0)
  } catch {
    return `${(n || 0).toFixed(2)} ₺`
  }
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return `${fmtDate(date)} ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
}

/** yatay çizgi */
export function drawLine(page: PDFPage, x1: number, y: number, x2: number, color: RGB = LINE, thickness = 0.7): void {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
}

/** dolgulu dikdörtgen */
export function drawBox(page: PDFPage, x: number, y: number, w: number, h: number, color: RGB): void {
  page.drawRectangle({ x, y, width: w, height: h, color })
}

/** Yeni sayfa aç + sayfa numarası damgasını eski sayfaya bas */
export function nextPage(ctx: PdfCtx, margin = 42): PDFPage {
  ctx.page = ctx.doc.addPage([A4.w, A4.h])
  return ctx.page
}

/** Tüm sayfalara "X / Y" damgası bas (doküman bitiminde çağır) */
export async function stampPageNumbers(ctx: PdfCtx, footerNote?: string): Promise<void> {
  const pages = ctx.doc.getPages()
  pages.forEach((p, i) => {
    const label = `Sayfa ${i + 1} / ${pages.length}`
    const w = ctx.regular.widthOfTextAtSize(label, 8)
    p.drawText(label, { x: A4.w - 42 - w, y: 22, size: 8, font: ctx.regular, color: MUTED })
    if (footerNote) {
      p.drawText(tr(footerNote), { x: 42, y: 22, size: 8, font: ctx.regular, color: MUTED })
    }
  })
}

/** PDF baytlarını indirilebilir yanıta paketle */
export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
