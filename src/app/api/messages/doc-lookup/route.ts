import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// ============================================================
// MESAJ EKİ → BELGE ÇÖZÜMLEME (GET /api/messages/doc-lookup)
// Sohbette gönderilen belge mesajları yalnızca METİN referansı olarak
// tutulur ("📎 Fatura FAT-2026-005 — ..."). PDF dosyası DB'ye yazılmaz;
// bu endpoint numaradan canlı çözümler ve önizleme URL'si döner.
// Böylece mesaj tabanı şişmez (dosya sunucuda anlık üretilir).
// ============================================================

// GET ?type=Fatura|Sipariş|Proforma|Teklif&number=FAT-2026-005
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? ''
  const number = (url.searchParams.get('number') ?? '').trim()
  if (!number) return err('Belge numarası gerekli', 400)

  const customerSelect = { select: { name: true } }

  // Fatura — sunucu tarafı gerçek PDF endpoint'i var
  if (type === 'Fatura') {
    const doc = await db.invoice.findFirst({
      where: { tenantId: user!.tenantId, number },
      include: { customer: customerSelect },
    })
    if (!doc) return err('Fatura bulunamadı (silinmiş olabilir)', 404)
    return ok({
      type, id: doc.id, number: doc.number,
      customerName: doc.customer.name, total: doc.total, currency: doc.currency,
      canPreview: true,
      url: `/api/invoices/${doc.id}/pdf`,
    })
  }

  // Proforma — quote.isProforma=true, ayrı PDF endpoint'i
  if (type === 'Proforma') {
    const doc = await db.quote.findFirst({
      where: { tenantId: user!.tenantId, isProforma: true, number },
      include: { customer: customerSelect },
    })
    if (!doc) return err('Proforma bulunamadı (silinmiş olabilir)', 404)
    return ok({
      type, id: doc.id, number: doc.number,
      customerName: doc.customer.name, total: doc.total, currency: doc.currency,
      canPreview: true,
      url: `/api/proforma/${doc.id}/pdf`,
    })
  }

  // Teklif — quote.isProforma=false
  if (type === 'Teklif') {
    const doc = await db.quote.findFirst({
      where: { tenantId: user!.tenantId, isProforma: false, number },
      include: { customer: customerSelect },
    })
    if (!doc) return err('Teklif bulunamadı (silinmiş olabilir)', 404)
    return ok({
      type, id: doc.id, number: doc.number,
      customerName: doc.customer.name, total: doc.total, currency: doc.currency,
      canPreview: true,
      url: `/api/quotes/${doc.id}/pdf`,
    })
  }

  // Sipariş — doğrudan PDF endpoint'i yok (Belge Yönetimi'nden üretilir)
  if (type === 'Sipariş') {
    const doc = await db.order.findFirst({
      where: { tenantId: user!.tenantId, number },
      include: { customer: customerSelect },
    })
    if (!doc) return err('Sipariş bulunamadı (silinmiş olabilir)', 404)
    return ok({
      type, id: doc.id, number: doc.number,
      customerName: doc.customer.name, total: doc.totalAmount, currency: doc.currency,
      canPreview: false,
      url: null,
    })
  }

  return err('Bilinmeyen belge türü', 400)
}
