// ============================================================
// GET /api/invoices/[id]/pdf — GERÇEK PDF üretimi (pdf-lib)
// Tarayıcı print'i değil; sunucuda üretilen, indirilebilir
// gerçek PDF dosyası. Türkçe karakter desteği DejaVu ile.
// Yetki: erp.manage VEYA invoices.view (fiyatlı belge).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import {
  createPdf, nextPage, pdfResponse,
  drawText, drawRight, drawCenter, drawLine, drawBox, wrapText,
  fmtMoney, fmtDate,
  A4, INK, MUTED, LINE, ZEBRA, tr,
  rgb, RGB,
} from '@/lib/pdf-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user) return err('Oturum açmanız gerekli', 401)
  const canSeePrices = user.permissions.includes('erp.manage') || user.permissions.includes('invoices.view')
  if (!canSeePrices) return err('Fatura PDF görüntüleme yetkiniz yok', 403)

  const { id } = await params
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true, name: true, email: true, phone: true,
          address: true, city: true, taxNumber: true,
        },
      },
      lines: {
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { id: 'asc' },
      },
      order: { select: { id: true, number: true, status: true } },
    },
  })
  if (!invoice) return err('Fatura bulunamadı', 404)
  if (invoice.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const tpl = await db.invoiceTemplate.findUnique({ where: { tenantId: user!.tenantId } })

  const margin = 42
  const W = A4.w
  const contentW = W - margin * 2

  const ctx = await createPdf({ primary: tpl?.primaryColor || '#10b981', accent: tpl?.accentColor || '#0d9488' })
  let y = A4.h - margin

  // ─── BAŞLIK: şirket + FATURA künyesi ───────────────────────────
  drawText(ctx.page, tpl?.companyName || user.tenant.name || 'Şirket Adı', margin, y - 14, { font: ctx.bold, size: 15, color: ctx.primary })
  const infoLines = [
    tpl?.companyAddress || null,
    [tpl?.companyPhone ? `Tel: ${tpl.companyPhone}` : null, tpl?.companyEmail || null].filter(Boolean).join('  ·  ') || null,
    tpl?.taxOffice || tpl?.taxNumber ? [tpl?.taxOffice, tpl?.taxNumber ? `VKN: ${tpl.taxNumber}` : null].filter(Boolean).join('  ') : null,
  ].filter(Boolean) as string[]
  let iy = y - 28
  for (const line of infoLines) {
    drawText(ctx.page, line, margin, iy, { font: ctx.regular, size: 8.5, color: MUTED })
    iy -= 11
  }

  drawRight(ctx.page, 'FATURA', W - margin, y - 12, { font: ctx.bold, size: 21, color: ctx.accent })
  drawRight(ctx.page, invoice.number, W - margin, y - 30, { font: ctx.bold, size: 11, color: INK })
  drawRight(ctx.page, `Tarih: ${fmtDate(invoice.issueDate)}`, W - margin, y - 43, { font: ctx.regular, size: 9, color: MUTED })
  if (invoice.dueDate) {
    drawRight(ctx.page, `Vade: ${fmtDate(invoice.dueDate)}`, W - margin, y - 54, { font: ctx.regular, size: 9, color: MUTED })
  }

  y = Math.min(iy, y - 60) - 6
  drawLine(ctx.page, margin, y, W - margin, ctx.primary, 1.4)
  y -= 20

  // ─── MÜŞTERİ BLOĞU ─────────────────────────────────────────────
  drawText(ctx.page, 'MÜŞTERİ', margin, y, { font: ctx.bold, size: 8, color: MUTED })
  y -= 14
  drawText(ctx.page, invoice.customer?.name || '—', margin, y, { font: ctx.bold, size: 11.5 })
  y -= 13
  const custLines = [
    [invoice.customer?.address, invoice.customer?.city].filter(Boolean).join(', ') || null,
    invoice.customer?.taxNumber ? `VKN: ${invoice.customer.taxNumber}` : null,
    invoice.customer?.phone || null,
  ].filter(Boolean) as string[]
  for (const line of custLines) {
    drawText(ctx.page, line, margin, y, { font: ctx.regular, size: 9, color: MUTED })
    y -= 11.5
  }

  // Sipariş bağlantısı
  if (invoice.order?.number) {
    drawRight(ctx.page, `Sipariş: ${invoice.order.number}`, W - margin, y + 11.5, { font: ctx.regular, size: 9, color: MUTED })
  }

  // Ödendi bilgisi
  if (invoice.status === 'odendi' && invoice.paidDate) {
    drawRight(ctx.page, `Ödendi: ${fmtDate(invoice.paidDate)}`, W - margin, y, { font: ctx.regular, size: 9, color: MUTED })
  }

  y -= 14
  drawLine(ctx.page, margin, y, W - margin)
  y -= 16

  // ─── KALEM TABLOSU ─────────────────────────────────────────────
  const colQty = 52
  const colUnit = 92
  const colVat = 52
  const colDescX = margin + 22
  const colDescW = contentW - 22 - colQty - colUnit - colVat - 92
  const WHITE: RGB = rgb(1, 1, 1)

  const tableHeader = (page: typeof ctx.page) => {
    drawBox(page, margin, y - 4, contentW, 18, ctx.primary)
    const hy = y + 1.5
    drawText(page, '#', margin + 6, hy, { font: ctx.bold, size: 8.5, color: WHITE })
    drawText(page, 'AÇIKLAMA', colDescX, hy, { font: ctx.bold, size: 8.5, color: WHITE })
    drawRight(page, 'MİKTAR', margin + 22 + colDescW + colQty - 6, hy, { font: ctx.bold, size: 8.5, color: WHITE })
    drawRight(page, 'BİRİM FİYAT', margin + 22 + colDescW + colQty + colUnit - 6, hy, { font: ctx.bold, size: 8.5, color: WHITE })
    drawRight(page, 'KDV %', margin + 22 + colDescW + colQty + colUnit + colVat - 6, hy, { font: ctx.bold, size: 8.5, color: WHITE })
    drawRight(page, 'TOPLAM', W - margin - 6, hy, { font: ctx.bold, size: 8.5, color: WHITE })
    y -= 22
  }

  tableHeader(ctx.page)

  let rowIndex = 0
  for (const line of invoice.lines) {
    const descRaw = [
      line.description,
      line.product?.sku ? `SKU: ${line.product.sku}` : null,
      line.color ? `Renk: ${line.color}` : null,
    ].filter(Boolean).join('  ·  ')
    const descRows = wrapText(descRaw, ctx.regular, 9, colDescW - 6).slice(0, 3)
    const rowH = Math.max(18, descRows.length * 11 + 7)

    if (y - rowH < margin + 90) {
      ctx.page = nextPage(ctx)
      y = A4.h - margin
      tableHeader(ctx.page)
    }

    if (rowIndex % 2 === 1) {
      drawBox(ctx.page, margin, y - rowH + 12, contentW, rowH - 4, ZEBRA)
    }

    const ry = y - 2
    drawText(ctx.page, String(rowIndex + 1), margin + 6, ry, { font: ctx.regular, size: 9, color: MUTED })
    drawText(ctx.page, descRows[0] ?? '', colDescX, ry, { font: ctx.regular, size: 9 })
    if (descRows[1]) drawText(ctx.page, descRows[1], colDescX, ry - 10, { font: ctx.regular, size: 8, color: MUTED })
    if (descRows[2]) drawText(ctx.page, descRows[2], colDescX, ry - 19, { font: ctx.regular, size: 8, color: MUTED })
    drawRight(ctx.page, String(line.qty), margin + 22 + colDescW + colQty - 6, ry, { font: ctx.regular, size: 9 })
    drawRight(ctx.page, fmtMoney(line.unitPrice, invoice.currency), margin + 22 + colDescW + colQty + colUnit - 6, ry, { font: ctx.regular, size: 9 })
    drawRight(ctx.page, `${line.taxRate}%`, margin + 22 + colDescW + colQty + colUnit + colVat - 6, ry, { font: ctx.regular, size: 9 })
    drawRight(ctx.page, fmtMoney(line.lineTotal, invoice.currency), W - margin - 6, ry, { font: ctx.bold, size: 9 })
    drawLine(ctx.page, margin, y - rowH + 12, W - margin)
    y -= rowH
    rowIndex++
  }

  if (rowIndex === 0) {
    drawText(ctx.page, 'Kalem bulunmuyor', margin + 6, y - 4, { font: ctx.regular, size: 9, color: MUTED })
    y -= 22
  }

  // ─── TOPLAMLAR ─────────────────────────────────────────────────
  if (y < margin + 150) {
    ctx.page = nextPage(ctx)
    y = A4.h - margin
  }

  const bx = W - margin - 240
  const bw = 240
  y -= 10
  drawBox(ctx.page, bx, y - 58, bw, 66, rgb(0.97, 0.98, 0.975))
  drawLine(ctx.page, bx, y - 8, bx + bw, ctx.accent, 1)

  const ty = y - 20
  drawText(ctx.page, 'Ara Toplam', bx + 10, ty, { font: ctx.regular, size: 9.5, color: MUTED })
  drawRight(ctx.page, fmtMoney(invoice.subtotal, invoice.currency), bx + bw - 10, ty, { font: ctx.regular, size: 9.5 })
  drawText(ctx.page, 'KDV', bx + 10, ty - 15, { font: ctx.regular, size: 9.5, color: MUTED })
  drawRight(ctx.page, fmtMoney(invoice.taxTotal, invoice.currency), bx + bw - 10, ty - 15, { font: ctx.regular, size: 9.5 })

  drawBox(ctx.page, bx, y - 58, bw, 20, ctx.accent)
  drawText(ctx.page, 'GENEL TOPLAM', bx + 10, y - 52, { font: ctx.bold, size: 10.5, color: WHITE })
  drawRight(ctx.page, fmtMoney(invoice.total, invoice.currency), bx + bw - 10, y - 52, { font: ctx.bold, size: 11.5, color: WHITE })

  y -= 78

  // ─── NOTLAR ────────────────────────────────────────────────────
  const isIptal = invoice.status === 'iptal'
  const notes = isIptal ? 'BU FATURA İPTAL EDİLMİŞTİR' : (tpl?.notes || '')
  if (notes) {
    drawText(ctx.page, 'Notlar', margin, y, { font: ctx.bold, size: 9, color: MUTED })
    y -= 13
    for (const row of wrapText(notes, ctx.regular, 9, contentW).slice(0, 4)) {
      drawText(ctx.page, row, margin, y, { font: ctx.regular, size: 9, color: isIptal ? rgb(0.7, 0.1, 0.1) : INK })
      y -= 12
    }
  }

  // ─── ALT BİLGİ (banka + footer, tüm sayfalarda) ───────────────
  const bankLines: string[] = []
  if (tpl?.showBankInfo && tpl?.bankInfo) {
    try {
      const banks = JSON.parse(tpl.bankInfo) as { bankName: string; iban: string; accountHolder: string }[]
      for (const b of banks.slice(0, 3)) {
        bankLines.push([b.bankName, b.accountHolder, b.iban].filter(Boolean).join('  —  '))
      }
    } catch { /* bozuk json — yoksay */ }
  }

  const pages = ctx.doc.getPages()
  pages.forEach((p, i) => {
    let fy = 58
    for (const line of bankLines) {
      drawText(p, line, margin, fy, { font: ctx.regular, size: 8, color: MUTED })
      fy -= 10
    }
    if (tpl?.footerText) {
      drawCenter(p, tpl.footerText, W / 2, fy - 2, { font: ctx.regular, size: 8, color: MUTED })
    }
    drawLine(p, margin, 34, W - margin)
    drawText(p, `${tpl?.companyName || user.tenant.name || ''} · ${invoice.number} · ${fmtDate(invoice.issueDate)}`, margin, 24, { font: ctx.regular, size: 7.5, color: MUTED })
    drawRight(p, `Sayfa ${i + 1} / ${pages.length}`, W - margin, 24, { font: ctx.regular, size: 7.5, color: MUTED })
  })

  const bytes = await ctx.doc.save()

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'pdf_download',
    entity: 'invoice',
    entityId: invoice.id,
    after: { number: invoice.number, total: invoice.total },
  })

  return pdfResponse(bytes, `Fatura-${tr(invoice.number).replace(/[^\w.-]+/g, '-')}.pdf`)
}
