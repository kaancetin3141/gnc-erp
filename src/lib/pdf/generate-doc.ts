// ============================================================
// GERÇEK PDF ÜRETİMİ — pdfkit ile A4 belge üretici
// Fatura / Teklif / Proforma için profesyonel, yazdırılabilir
// PDF buffer'ı üretir. Türkçe karakter desteği DejaVu Sans
// fontlarıyla (public/fonts) sağlanır.
// ============================================================

import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

export type DocType = 'invoice' | 'quote' | 'proforma'

export interface DocPdfLine {
  description: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
}

export interface DocPdfParty {
  name: string
  address?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  taxNumber?: string | null
}

export interface DocPdfData {
  type: DocType
  number: string
  status?: string | null
  issueDate: Date | string
  /** Fatura vade tarihi */
  dueDate?: Date | string | null
  /** Proforma/teklif geçerlilik tarihi */
  validUntil?: Date | string | null
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  customer: DocPdfParty | null
  lines: DocPdfLine[]
  /** Şirket (başlık) bilgileri — Tenant + InvoiceTemplate birleşimi */
  company?: {
    name: string
    legalName?: string | null
    address?: string | null
    phone?: string | null
    email?: string | null
    web?: string | null
    taxNumber?: string | null
    taxOffice?: string | null
  } | null
  /** Şablondan gelen alt not (InvoiceTemplate.footerText) */
  footerNote?: string | null
  /** Herkese açık online görüntüleme bağlantısı (paylaşım linki) */
  shareUrl?: string | null
}

// ------------------------------------------------------------
// Font çözümleme — standalone build + dev uyumlu yol araması
// ------------------------------------------------------------
const FONT_CACHE: Record<string, string> = {}

function resolveFont(file: string): string {
  if (FONT_CACHE[file]) return FONT_CACHE[file]
  const candidates = [
    path.join(process.cwd(), 'public', 'fonts', file),
    path.join(process.cwd(), 'src', 'assets', 'fonts', file),
    path.join(process.cwd(), '..', 'public', 'fonts', file),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        FONT_CACHE[file] = p
        return p
      }
    } catch { /* ignore */ }
  }
  throw new Error(`Font dosyası bulunamadı: ${file}`)
}

// ------------------------------------------------------------
// Biçim yardımcıları
// ------------------------------------------------------------
const fmtMoney = (n: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number.isFinite(n) ? n : 0)

const fmtQty = (n: number) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 })
    .format(Number.isFinite(n) ? n : 0)

function fmtDate(d?: Date | string | null): string | null {
  if (!d) return null
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return null
  return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function docTitle(type: DocType): string {
  return type === 'invoice' ? 'FATURA' : type === 'proforma' ? 'PROFORMA FATURA' : 'TEKLİF'
}

function statusLabel(type: DocType, status?: string | null): string | null {
  if (!status) return null
  if (type === 'invoice') {
    return ({
      odeme_bekliyor: 'Ödeme Bekliyor', odendi: 'Ödendi', gecikti: 'Gecikti', iptal: 'İptal',
    } as Record<string, string>)[status] ?? status
  }
  return ({
    taslak: 'Taslak', gonderildi: 'Gönderildi', onaylandi: 'Onaylandı',
    reddedildi: 'Reddedildi', faturalandi: 'Faturalandı',
  } as Record<string, string>)[status] ?? status
}

// ------------------------------------------------------------
// Renk paleti (CRM emerald diline uyumlu)
// ------------------------------------------------------------
const C = {
  brand: '#059669',      // emerald-600
  brandDark: '#047857',  // emerald-700
  brandSoft: '#ecfdf5',  // emerald-50
  zebra: '#f4faf7',      // çok açık yeşil-gri
  text: '#111827',       // gray-900
  muted: '#6b7280',      // gray-500
  line: '#d1d5db',       // gray-300
  white: '#ffffff',
}

// Sayfa geometrisi (A4 pt)
const PAGE_W = 595.28
const PAGE_H = 841.89
const M = 46
const CW = PAGE_W - M * 2
const RIGHT = PAGE_W - M

// Tablo kolonları
const COL_DESC_X = M + 6
const COL_DESC_W = 218
const COL_QTY_R = 330
const COL_UNIT_R = 412
const COL_TAX_R = 462
const COL_TOTAL_R = RIGHT - 6

const TABLE_HEADER_H = 24
const MIN_ROW_H = 22

// ------------------------------------------------------------
// Ana üretici
// ------------------------------------------------------------
export function generateDocPdf(data: DocPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: M,
        bufferPages: true,
        info: {
          Title: `${docTitle(data.type)} ${data.number}`,
          Creator: 'GNC CRM',
          Author: data.company?.name || 'GNC CRM',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('error', (e: Error) => reject(e))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      drawDocument(doc, data)

      doc.end()
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

// ------------------------------------------------------------
// Çizim
// ------------------------------------------------------------
function drawDocument(doc: PDFKit.PDFDocument, data: DocPdfData) {
  // Fontları kaydet — Türkçe karakterler DejaVu ile sorunsuz
  doc.registerFont('Body', resolveFont('DejaVuSans.ttf'))
  doc.registerFont('Bold', resolveFont('DejaVuSans-Bold.ttf'))

  // Üst marka şeridi
  doc.rect(0, 0, PAGE_W, 6).fill(C.brand)

  drawHeader(doc, data)
  drawMetaRow(doc, data)
  drawTable(doc, data)
  drawTotals(doc, data)
  drawNotes(doc, data)

  // Tüm sayfalara footer (bufferPages sayesinde toplam sayfa biliniyor)
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    drawPageFooter(doc, data, i - range.start + 1, range.count)
  }
}

function drawHeader(doc: PDFKit.PDFDocument, data: DocPdfData) {
  const top = M + 6
  const co = data.company

  // Sol — şirket kimliği
  let y = top
  doc.font('Bold').fontSize(16).fillColor(C.text)
    .text(co?.name || 'Şirket', M, y, { width: 300 })
  y = doc.y + 4

  const contactBits = [
    co?.legalName && co.legalName !== co.name ? co.legalName : null,
    co?.address,
    co?.taxNumber ? `VKN: ${co.taxNumber}` : null,
    co?.taxOffice ? `Vergi D.: ${co.taxOffice}` : null,
    co?.phone ? `Tel: ${co.phone}` : null,
    co?.email,
    co?.web,
  ].filter(Boolean) as string[]

  if (contactBits.length > 0) {
    doc.font('Body').fontSize(7.5).fillColor(C.muted)
      .text(contactBits.join('  ·  '), M, y, { width: 310, lineGap: 1.5 })
    y = doc.y + 2
  }

  // Sağ — belge başlığı
  const labelX = RIGHT - 190
  doc.font('Bold').fontSize(21).fillColor(C.brand)
    .text(docTitle(data.type), labelX, top + 2, { width: 190, align: 'right' })
  doc.font('Bold').fontSize(10.5).fillColor(C.text)
    .text(data.number, labelX, doc.y + 3, { width: 190, align: 'right' })
  const issueStr = fmtDate(data.issueDate)
  if (issueStr) {
    doc.font('Body').fontSize(8.5).fillColor(C.muted)
      .text(`Düzenleme: ${issueStr}`, labelX, doc.y + 2, { width: 190, align: 'right' })
  }

  // Başlık altı çizgisi
  const ruleY = Math.max(y, doc.y) + 12
  doc.moveTo(M, ruleY).lineTo(RIGHT, ruleY).lineWidth(1).strokeColor(C.brand).stroke()

  // sonraki bölüm için
  doc.x = M
  doc.y = ruleY + 14
}

function drawMetaRow(doc: PDFKit.PDFDocument, data: DocPdfData) {
  const startY = doc.y
  const cust = data.customer

  // --- Sol kutu: müşteri ---
  const boxW = 286
  const boxH = 92
  doc.roundedRect(M, startY, boxW, boxH, 6).fill('#f9fafb')
  doc.fillColor(C.brand).rect(M, startY, 3, boxH).fill() // sol vurgu çubuğu

  let y = startY + 9
  doc.font('Bold').fontSize(7.5).fillColor(C.muted)
    .text('MÜŞTERİ', M + 12, y, { characterSpacing: 1 })
  y += 13
  doc.font('Bold').fontSize(10.5).fillColor(C.text)
    .text(cust?.name || '—', M + 12, y, { width: boxW - 24 })
  y = doc.y + 2.5

  const custBits: string[] = []
  if (cust?.address) custBits.push(cust.address + (cust.city ? `, ${cust.city}` : ''))
  else if (cust?.city) custBits.push(cust.city)
  if (cust?.taxNumber) custBits.push(`VKN: ${cust.taxNumber}`)
  if (cust?.phone) custBits.push(`Tel: ${cust.phone}`)
  if (cust?.email) custBits.push(cust.email)

  doc.font('Body').fontSize(7.8).fillColor(C.muted)
  for (const bit of custBits) {
    if (y > startY + boxH - 4) break
    doc.text(bit, M + 12, y, { width: boxW - 24, lineGap: 1 })
    y = doc.y + 1.5
  }

  // --- Sağ kutu: belge bilgileri ---
  const infoX = M + boxW + 14
  const infoW = CW - boxW - 14
  doc.roundedRect(infoX, startY, infoW, boxH, 6).fill('#f9fafb')

  const rows: [string, string][] = []
  const iss = fmtDate(data.issueDate)
  if (iss) rows.push(['Düzenleme Tarihi', iss])

  if (data.type === 'invoice') {
    const due = fmtDate(data.dueDate)
    rows.push(['Vade Tarihi', due ?? '—'])
  } else {
    const val = fmtDate(data.validUntil)
    rows.push(['Geçerlilik Tarihi', val ?? '—'])
  }
  rows.push(['Para Birimi', data.currency])
  const st = statusLabel(data.type, data.status)
  if (st) rows.push(['Durum', st])

  let iy = startY + 9
  doc.font('Bold').fontSize(7.5).fillColor(C.muted)
    .text('BELGE BİLGİLERİ', infoX + 12, iy, { characterSpacing: 1 })
  iy += 14
  for (const [k, v] of rows) {
    doc.font('Body').fontSize(8).fillColor(C.muted).text(k, infoX + 12, iy, { width: infoW / 2 - 12 })
    doc.font('Bold').fontSize(8).fillColor(C.text)
      .text(v, infoX + infoW / 2, iy, { width: infoW / 2 - 12, align: 'right' })
    iy += 16.5
  }

  doc.x = M
  doc.y = startY + boxH + 18
}

interface ColumnSpec {
  label: string
  x?: number
  right?: number
  width: number
  align: 'left' | 'right' | 'center'
}

function drawTable(doc: PDFKit.PDFDocument, data: DocPdfData) {
  const cols: ColumnSpec[] = [
    { label: 'AÇIKLAMA', x: COL_DESC_X, width: COL_DESC_W, align: 'left' },
    { label: 'MİKTAR', right: COL_QTY_R, width: 60, align: 'right' },
    { label: 'BİRİM FİYAT', right: COL_UNIT_R, width: 78, align: 'right' },
    { label: 'KDV %', right: COL_TAX_R, width: 44, align: 'right' },
    { label: 'TUTAR', right: COL_TOTAL_R, width: 85, align: 'right' },
  ]

  const drawTableHeader = () => {
    const y = doc.y
    doc.rect(M, y, CW, TABLE_HEADER_H).fill(C.brandDark)
    doc.font('Bold').fontSize(8).fillColor(C.white)
    for (const c of cols) {
      const tx = c.align === 'left' ? c.x! : (c.right! - c.width)
      doc.text(c.label, tx, y + 8, { width: c.width, align: c.align, characterSpacing: 0.6 })
    }
    doc.y = y + TABLE_HEADER_H
  }

  doc.y += 4
  drawTableHeader()

  const lines = data.lines ?? []
  if (lines.length === 0) {
    doc.font('Body').fontSize(9).fillColor(C.muted)
      .text('Kalem bulunmuyor.', M + 6, doc.y + 10, { width: CW - 12 })
    doc.y += 30
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const desc = (l.description || '').trim() || '—'

    // Satır yüksekliği: açıklama sarmalaması hesaba katılır
    doc.font('Body').fontSize(8.6)
    const descH = doc.heightOfString(desc, { width: COL_DESC_W, lineGap: 1.5 })
    const rowH = Math.max(MIN_ROW_H, descH + 11)

    // Sayfa taşması → yeni sayfa + başlık tekrarı
    if (doc.y + rowH > PAGE_H - M - 46) {
      doc.addPage()
      doc.y = M
      drawTableHeader()
    }

    const rowY = doc.y
    if (i % 2 === 1) {
      doc.rect(M, rowY, CW, rowH).fill(C.zebra)
    }
    doc.rect(M, rowY + rowH, CW, 0.5).fillColor(C.line).fill()

    const textY = rowY + 7
    doc.font('Body').fontSize(8.6).fillColor(C.text)
      .text(desc, COL_DESC_X, textY, { width: COL_DESC_W, lineGap: 1.5, ellipsis: true, height: rowH - 6 })
    doc.font('Body')
      .fillColor(C.text).text(fmtQty(l.qty), COL_QTY_R - 60, textY, { width: 60, align: 'right' })
      .fillColor(C.text).text(fmtMoney(l.unitPrice), COL_UNIT_R - 78, textY, { width: 78, align: 'right' })
      .fillColor(C.muted).text(fmtQty(l.taxRate), COL_TAX_R - 44, textY, { width: 44, align: 'right' })
      .font('Bold').fillColor(C.text).text(fmtMoney(l.lineTotal), COL_TOTAL_R - 85, textY, { width: 85, align: 'right' })

    doc.y = rowY + rowH
  }

  // Tablo alt kapanış çizgisi
  doc.moveTo(M, doc.y + 4).lineTo(RIGHT, doc.y + 4).lineWidth(0.75).strokeColor(C.line).stroke()
  doc.y += 12
}

function drawTotals(doc: PDFKit.PDFDocument, data: DocPdfData) {
  const boxW = 230
  const boxX = RIGHT - boxW
  const rows: [string, string, boolean][] = [
    ['Ara Toplam', fmtMoney(data.subtotal), false],
    ['KDV', fmtMoney(data.taxTotal), false],
    ['GENEL TOPLAM', `${fmtMoney(data.total)} ${data.currency}`, true],
  ]
  const bigRow = 30
  const boxH = rows.length * 20 + bigRow + 8

  // Sayfaya sığmıyorsa yeni sayfada göster
  if (doc.y + boxH > PAGE_H - M - 40) {
    doc.addPage()
    doc.y = M
  }

  const y0 = doc.y + 2
  doc.roundedRect(boxX, y0, boxW, boxH, 6).lineWidth(1).stroke(C.line)

  let y = y0 + 7
  for (const [k, v, strong] of rows) {
    if (strong) {
      doc.roundedRect(boxX + 5, y - 4, boxW - 10, 28, 4).fill(C.brandSoft)
      doc.font('Bold').fontSize(9.5).fillColor(C.brandDark)
        .text(k, boxX + 14, y + 2, { width: boxW - 28 })
      doc.font('Bold').fontSize(11).fillColor(C.brandDark)
        .text(v, boxX + 14, y + 1, { width: boxW - 28, align: 'right' })
      y += bigRow
    } else {
      doc.font('Body').fontSize(9).fillColor(C.muted).text(k, boxX + 14, y, { width: boxW - 28 })
      doc.font('Bold').fontSize(9).fillColor(C.text)
        .text(v, boxX + 14, y, { width: boxW - 28, align: 'right' })
      y += 20
    }
  }

  doc.y = y0 + boxH + 4
  doc.x = M
}

function drawNotes(doc: PDFKit.PDFDocument, data: DocPdfData) {
  const notes: string[] = []

  if (data.type === 'proforma') {
    const val = fmtDate(data.validUntil)
    notes.push(val
      ? `Bu proforma fatura ${val} tarihine kadar geçerlidir.`
      : 'Bu proforma fatura resmi fatura değildir; fiyat ve koşulları bilgi amaçlıdır.')
  }
  if (data.type === 'quote') {
    const val = fmtDate(data.validUntil)
    notes.push(val
      ? `Bu teklif ${val} tarihine kadar geçerlidir.`
      : 'Teklifi onaylamak veya detaylı bilgi almak için bizimle iletişime geçebilirsiniz.')
  }
  if (data.type === 'invoice' && data.status === 'odeme_bekliyor' && data.dueDate) {
    const due = fmtDate(data.dueDate)
    notes.push(`Ödemenizi ${due ?? 'vade tarihi'} öncesinde gerçekleştirmenizi rica ederiz.`)
  }
  if (data.footerNote) notes.push(data.footerNote)

  if (notes.length === 0 && !data.shareUrl) return

  // Sol kolon: notlar (toplam kutusunun solunda/altında)
  let y = Math.max(doc.y + 8, PAGE_H - M - 150)
  if (doc.y + 60 > PAGE_H - M - 30) {
    doc.addPage()
    doc.y = M
    y = M
  }

  const noteW = 280
  doc.font('Bold').fontSize(7.5).fillColor(C.muted)
    .text('NOTLAR', M, y, { characterSpacing: 1 })
  y += 12
  doc.font('Body').fontSize(8).fillColor(C.text)
  for (const n of notes) {
    doc.text(`• ${n}`, M, y, { width: noteW, lineGap: 2 })
    y = doc.y + 3
  }

  if (data.shareUrl) {
    y += 2
    doc.font('Bold').fontSize(7.5).fillColor(C.muted)
      .text('ONLINE GÖRÜNTÜLE', M, y, { characterSpacing: 1 })
    y += 12
    doc.font('Body').fontSize(7.6).fillColor(C.brand)
      .text(data.shareUrl, M, y, { width: noteW, lineGap: 1.5, link: data.shareUrl })
    y = doc.y + 2
  }

  doc.x = M
  doc.y = Math.max(doc.y, y) + 10
}

function drawPageFooter(doc: PDFKit.PDFDocument, data: DocPdfData, page: number, total: number) {
  // DİKKAT: y alt marjinin ÜSTÜNDE kalmalı — pdfkit, yazı alanının dışına
  // taşan metinde otomatik yeni sayfa açar (bos sayfa bug'ının önlenmesi).
  const y = PAGE_H - M - 12
  doc.moveTo(M, y - 6).lineTo(RIGHT, y - 6).lineWidth(0.5).strokeColor(C.line).stroke()
  doc.font('Body').fontSize(7).fillColor(C.muted)
    .text(`GNC CRM ile oluşturuldu · ${new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, M, y, {
      width: 300,
      lineBreak: false,
    })
  doc.font('Body').fontSize(7).fillColor(C.muted)
    .text(`Sayfa ${page} / ${total}  ·  ${data.number}`, RIGHT - 160, y, { width: 160, align: 'right', lineBreak: false })
}
