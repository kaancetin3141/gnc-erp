// ============================================================
// WhatsApp Mesaj Merkezi API
// GET  /api/whatsapp/messages — liste + istatistik (filtreli)
// POST /api/whatsapp/messages — yeni mesaj kaydı (kuyrukta)
// Yetki: messages.view — tenant izolasyonlu
// ============================================================

import { db } from '@/lib/db'
import { ok, err, requirePermission, getSession } from '@/lib/api-utils'
import { normalizePhone } from '@/lib/format'

export async function GET(req: Request) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'messages.view')
  if (permErr) return permErr
  if (!user) return err('Oturum gerekli', 401)

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const contextType = url.searchParams.get('contextType')
  const customerId = url.searchParams.get('customerId')
  const q = url.searchParams.get('q')?.trim()
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 500)

  const where: Record<string, unknown> = { tenantId: user.tenantId }
  if (status && status !== '__all__') where.status = status
  if (contextType && contextType !== '__all__') where.contextType = contextType
  if (customerId) where.customerId = customerId
  if (q) {
    where.OR = [
      { customerName: { contains: q } },
      { phone: { contains: q } },
      { contextNo: { contains: q } },
      { body: { contains: q } },
      { title: { contains: q } },
    ]
  }

  const [items, total, kuyrukta, gonderildi, bugun] = await Promise.all([
    db.whatsAppMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, customerId: true, customerName: true, phone: true,
        title: true, body: true, contextType: true, contextId: true, contextNo: true,
        amount: true, currency: true, status: true, channel: true,
        sentAt: true, createdByName: true, createdAt: true,
      },
    }),
    db.whatsAppMessage.count({ where: { tenantId: user.tenantId } }),
    db.whatsAppMessage.count({ where: { tenantId: user.tenantId, status: 'kuyrukta' } }),
    db.whatsAppMessage.count({ where: { tenantId: user.tenantId, status: 'gonderildi' } }),
    db.whatsAppMessage.count({
      where: {
        tenantId: user.tenantId,
        status: 'gonderildi',
        sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ])

  return ok({ items, stats: { total, kuyrukta, gonderildi, bugun } })
}

export async function POST(req: Request) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'messages.view')
  if (permErr) return permErr
  if (!user) return err('Oturum gerekli', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.phone !== 'string' || typeof body.body !== 'string' || !body.body.trim()) {
    return err('Telefon ve mesaj metni zorunlu')
  }
  const phone = normalizePhone(body.phone)
  if (!phone) return err('Geçersiz telefon numarası')

  const validContexts = ['fatura_hatirlatma', 'teklif_gonderim', 'proforma_gonderim', 'randevu_onay', 'aidat_hatirlatma', 'serbest']
  const contextType = typeof body.contextType === 'string' && validContexts.includes(body.contextType)
    ? body.contextType
    : 'serbest'

  const msg = await db.whatsAppMessage.create({
    data: {
      tenantId: user.tenantId,
      customerId: typeof body.customerId === 'string' && body.customerId ? body.customerId : null,
      customerName: typeof body.customerName === 'string' ? body.customerName.slice(0, 120) : null,
      phone,
      title: typeof body.title === 'string' ? body.title.slice(0, 160) : null,
      body: body.body,
      contextType,
      contextId: typeof body.contextId === 'string' && body.contextId ? body.contextId : null,
      contextNo: typeof body.contextNo === 'string' ? body.contextNo.slice(0, 60) : null,
      amount: typeof body.amount === 'number' && !isNaN(body.amount) ? body.amount : null,
      currency: typeof body.currency === 'string' ? body.currency.slice(0, 8) : null,
      status: 'kuyrukta',
      channel: 'wa.me',
      createdById: user.id,
      createdByName: user.name,
    },
  })

  return ok({ id: msg.id }, 201)
}
