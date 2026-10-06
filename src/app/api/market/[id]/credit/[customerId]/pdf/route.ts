// ============================================================
// GET /api/market/[id]/credit/[customerId]/pdf
// VERESİYE CARİ EKSTRESİ — gerçek PDF (pdf-lib).
// Müşterinin tüm borç/ödeme hareketleri + bakiye dökümü.
// Yetki: market.view
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import {
  createPdf, pdfResponse,
  drawText, drawRight, drawLine, drawBox, wrapText,
  fmtMoney, fmtDate, fmtDateTime,
  A4, INK, MUTED, LINE, ZEBRA, tr,
  rgb, RGB,
} from '@/lib/pdf-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.view')
  if (permErr) return permErr
  if (!user) return err('Oturum açmanız gerekli', 401)

  const { id, customerId } = await params
  const market = await db.market.findUnique({ where: { id } })
  if (!market || market.tenantId !== user!.tenantId) return err('Market bulunamadı', 404)

  const customer = await db.creditCustomer.findUnique({
    where: { id: customerId },
    include: {
      entries: {
        orderBy: { createdAt: 'asc' },
        include: { refSale: { select: { id: true, number: true, total: true } } },
      },
    },
  })
  if (!customer || customer.marketId !== id) return err('Veresiye müşterisi bulunamadı', 404)

  const tpl = await db.invoiceTemplate.findUnique({ where: { tenantId: user!.tenantId } })

  // Bakiye hesabı (eskiden yeniye akan bakiye kolonu için)
  let running = 0
  const rows = customer.entries.map((e) => {
    running += e.type === 'borc' ? e.amount : -e.amount
    return {
      id: e.id,
      date: e.createdAt,
      type: e.type,
      amount: e.amount,
      method: e.method,
      note: e.note,
      dueDate: e.dueDate,
      saleNo: e.refSale?.number ?? null,
      balance: running,
    }
  })
  const balance = Math.round(running * 100) / 100

  const margin = 42
  const W = A4.w
  const contentW = W - margin * 2

  const ctx = await createPdf({ primary: tpl?.primaryColor || '#10b981', accent: tpl?.accentColor || '#0d9488' })
  let y = A4.h - margin

  // ─── BAŞLIK ────────────────────────────────────────────────────
  drawText(ctx.page, tpl?.companyName || user.tenant.name || 'Şirket Adı', margin, y - 14, { font: ctx.bold, size: 15, color: ctx.primary })
  const infoLines = [
    tpl?.companyAddress || null,
    [tpl?.companyPhone ? `Tel: ${tpl.companyPhone}` : null, tpl?.companyEmail || null].filter(Boolean).join('  ·  ') || null,
  ].filter(Boolean) as string[]
  let iy = y - 28
  for (const line of infoLines) {
    drawText(ctx.page, line, margin, iy, { font: ctx.regular, size: 8.5, color: MUTED })
    iy -= 11
  }

  drawRight(ctx.page, 'VERESİYE CARİ EKSTRESİ', W - margin, y - 12, { font: ctx.bold, size: 15.5, color: ctx.accent })
  drawRight(ctx.page, market.name, W - margin, y - 28, { font: ctx.regular, size: 9.5, color: MUTED })
  drawRight(ctx.page, `Döküm Tarihi: ${fmtDateTime(new Date())}`, W - margin, y - 41, { font: ctx.regular, size: 9, color: MUTED })

  y = Math.min(iy, y - 58) - 6
  drawLine(ctx.page, margin, y, W - margin, ctx.primary, 1.4)
  y -= 18

  // ─── MÜŞTERİ + BAKİYE ÖZETİ ───────────────────────────────────
  drawText(ctx.page, 'MÜŞTERİ', margin, y, { font: ctx.bold, size: 8, color: MUTED })
  y -= 13
  drawText(ctx.page, customer.name, margin, y, { font: ctx.bold, size: 11.5 })
  const custDetail = [
    customer.phone ? `Tel: ${customer.phone}` : null,
    customer.note || null,
    customer.creditLimit != null ? `Limit: ${fmtMoney(customer.creditLimit)}` : null,
  ].filter(Boolean) as string[]
  let cy = y
  for (const line of custDetail) {
    cy -= 11.5
    drawText(ctx.page, line, margin, cy, { font: ctx.regular, size: 9, color: MUTED })
  }

  const overdue = rows.some((r) => r.type === 'borc' && r.dueDate && new Date(r.dueDate) < new Date() && r.balance > 0)
  const balColor: RGB = balance > 0 ? rgb(0.75, 0.15, 0.15) : rgb(0.06, 0.6, 0.4)
  drawRight(ctx.page, 'GÜNCEL BAKİYE', W - margin, y - 2, { font: ctx.bold, size: 9, color: MUTED })
  drawRight(ctx.page, fmtMoney(balance), W - margin, y - 18, { font: ctx.bold, size: 15, color: balColor })
  drawRight(ctx.page, balance > 0 ? (overdue ? 'Vadesi geçen borç mevcut' : 'Borçlu') : 'Borç yok', W - margin, y - 32, { font: ctx.regular, size: 8.5, color: MUTED })

  y = Math.min(cy, y - 38) - 10
  drawLine(ctx.page, margin, y, W - margin)
  y -= 16

  // ─── HAREKET TABLOSU ──────────────────────────────────────────
  const colDate = 62
  const colType = 48
  const colDetailW = contentW - colDate - colType - 58 - 74 - 74
  const WHITE: RGB = rgb(1, 1, 1)

  const header = (page: typeof ctx.page) => {
    drawBox(page, margin, y - 4, contentW, 17, ctx.primary)
    const hy = y + 0.5
    drawText(page, 'TARİH', margin + 5, hy, { font: ctx.bold, size: 8, color: WHITE })
    drawText(page, 'TÜR', margin + colDate + 5, hy, { font: ctx.bold, size: 8, color: WHITE })
    drawText(page, 'İŞLEM / AÇIKLAMA', margin + colDate + colType + 5, hy, { font: ctx.bold, size: 8, color: WHITE })
    drawRight(page, 'TUTAR', W - margin - 74 - 5, hy, { font: ctx.bold, size: 8, color: WHITE })
    drawRight(page, 'BAKİYE', W - margin - 5, hy, { font: ctx.bold, size: 8, color: WHITE })
    y -= 21
  }
  header(ctx.page)

  let i = 0
  for (const r of rows) {
    const detail = [
      r.saleNo ? `POS Satışı: ${r.saleNo}` : null,
      r.type === 'odeme' && r.method ? `Ödeme (${r.method})` : r.type === 'odeme' ? 'Ödeme' : null,
      r.note || null,
      r.dueDate && r.type === 'borc' ? `Vade: ${fmtDate(r.dueDate)}` : null,
    ].filter(Boolean).join('  ·  ')
    const detailRows = wrapText(detail || '—', ctx.regular, 8.5, colDetailW - 8).slice(0, 2)
    const rowH = Math.max(16, detailRows.length * 10.5 + 6)

    if (y - rowH < margin + 80) {
      ctx.page = ctx.doc.addPage([W, A4.h])
      y = A4.h - margin
      header(ctx.page)
    }

    if (i % 2 === 1) drawBox(ctx.page, margin, y - rowH + 11, contentW, rowH - 3, ZEBRA)

    const ry = y - 1
    drawText(ctx.page, fmtDate(r.date), margin + 5, ry, { font: ctx.regular, size: 8.5 })
    if (r.type === 'borc') {
      drawBox(ctx.page, margin + colDate + 3, ry - 2, 34, 12, rgb(0.9, 0.32, 0.3))
      drawText(ctx.page, 'BORÇ', margin + colDate + 7, ry + 0.5, { font: ctx.bold, size: 7, color: WHITE })
    } else {
      drawBox(ctx.page, margin + colDate + 3, ry - 2, 42, 12, rgb(0.06, 0.6, 0.4))
      drawText(ctx.page, 'ÖDEME', margin + colDate + 7, ry + 0.5, { font: ctx.bold, size: 7, color: WHITE })
    }
    drawText(ctx.page, detailRows[0] ?? '—', margin + colDate + colType + 5, ry, { font: ctx.regular, size: 8.5 })
    if (detailRows[1]) drawText(ctx.page, detailRows[1], margin + colDate + colType + 5, ry - 9.5, { font: ctx.regular, size: 7.5, color: MUTED })
    drawRight(ctx.page, `${r.type === 'borc' ? '+' : '−'}${fmtMoney(r.amount)}`, W - margin - 74 - 5, ry, {
      font: ctx.regular, size: 8.5, color: r.type === 'borc' ? rgb(0.75, 0.15, 0.15) : rgb(0.06, 0.5, 0.35),
    })
    drawRight(ctx.page, fmtMoney(r.balance), W - margin - 5, ry, { font: ctx.bold, size: 8.5 })
    drawLine(ctx.page, margin, y - rowH + 11, W - margin)
    y -= rowH
    i++
  }

  if (i === 0) {
    drawText(ctx.page, 'Cari hareket bulunmuyor', margin + 5, y - 4, { font: ctx.regular, size: 9, color: MUTED })
    y -= 24
  }

  // ─── TOPLAM SATIRI ────────────────────────────────────────────
  const totalBorc = rows.filter((r) => r.type === 'borc').reduce((s, r) => s + r.amount, 0)
  const totalOdeme = rows.filter((r) => r.type === 'odeme').reduce((s, r) => s + r.amount, 0)
  y -= 12
  if (y < margin + 70) {
    ctx.page = ctx.doc.addPage([W, A4.h])
    y = A4.h - margin
  }
  drawBox(ctx.page, W - margin - 300, y - 34, 300, 40, rgb(0.97, 0.98, 0.975))
  drawText(ctx.page, 'Toplam Borç', W - margin - 290, y - 12, { font: ctx.regular, size: 9, color: MUTED })
  drawRight(ctx.page, fmtMoney(totalBorc), W - margin - 10, y - 12, { font: ctx.regular, size: 9 })
  drawText(ctx.page, 'Toplam Ödeme', W - margin - 290, y - 25, { font: ctx.regular, size: 9, color: MUTED })
  drawRight(ctx.page, fmtMoney(totalOdeme), W - margin - 10, y - 25, { font: ctx.regular, size: 9 })
  drawLine(ctx.page, W - margin - 300, y - 30, W - margin, ctx.accent, 1)
  drawText(ctx.page, 'KALAN BAKİYE', W - margin - 290, y - 41, { font: ctx.bold, size: 9.5 })
  drawRight(ctx.page, fmtMoney(balance), W - margin - 10, y - 41, { font: ctx.bold, size: 10.5, color: balColor })

  // ─── ALT BİLGİ ────────────────────────────────────────────────
  const pages = ctx.doc.getPages()
  pages.forEach((p, idx) => {
    if (tpl?.footerText) {
      p.drawText(tr(tpl.footerText), { x: margin, y: 26, size: 7.5, font: ctx.regular, color: MUTED })
    }
    p.drawText(`${customer.name} · veresiye ekstresi · ${fmtDate(new Date())}`, { x: margin, y: 16, size: 7.5, font: ctx.regular, color: MUTED })
    const label = `Sayfa ${idx + 1} / ${pages.length}`
    const w = ctx.regular.widthOfTextAtSize(label, 7.5)
    p.drawText(label, { x: W - margin - w, y: 16, size: 7.5, font: ctx.regular, color: MUTED })
  })

  const bytes = await ctx.doc.save()

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'pdf_download',
    entity: 'credit_customer',
    entityId: customer.id,
    after: { market: market.name, customer: customer.name, balance, entries: rows.length },
  })

  return pdfResponse(bytes, `Veresiye-Ekstre-${tr(customer.name).replace(/[^\w.-]+/g, '-')}.pdf`)
}
