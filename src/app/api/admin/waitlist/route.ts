import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok, err,
} from '@/lib/api-utils'
import { isSuperAdmin, hasPermission } from '@/lib/rbac'

// ============================================================
// ADMIN — BEKLEME LİSTESİ (liste)
// GET ?page=&status=&providerId=&q=&from=&to=&tenantId=
//   · superadmin: platform geneli (+ opsiyonel ?tenantId=)
//   · admin: kendi tenant'ının işletmelerinin kayıtları
//     (WaitlistEntry tenant'sız → kapsam provider.tenantId üzerinden)
// Yetki: appointments.view (randevu sektörü) VEYA users.manage
//   (admin panel Üyeler/Değerlendirmeler sekmesi deseni — CRM
//   sektörü admini de işletme sahibi olarak panele erişir)
// Returns: { items, total, page, pageSize, counts: {waiting} }
// ============================================================

const STATUSES = ['waiting', 'notified', 'booked', 'cancelled', 'expired'] as const

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'appointments.view') && !hasPermission(user!, 'users.manage')) {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const providerId = (url.searchParams.get('providerId') || '').trim()
  const from = (url.searchParams.get('from') || '').trim()
  const to = (url.searchParams.get('to') || '').trim()
  const pageRaw = Number(url.searchParams.get('page') ?? '1')
  const page = Math.max(Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1, 1)
  const PAGE_SIZE = 20
  const tenantIdParam = (url.searchParams.get('tenantId') || '').trim()

  // Tenant kapsamı — superadmin ?tenantId= ile daraltabilir; admin zorunlu kendi tenant'ı
  let tenantFilter: string | undefined
  if (isSuperAdmin(user!.role)) {
    tenantFilter = tenantIdParam || undefined
  } else {
    if (tenantIdParam && tenantIdParam !== user!.tenantId) {
      return err('Bu tenantın bekleme kayıtlarını görme yetkin yok.', 403)
    }
    tenantFilter = user!.tenantId
  }

  const where: Record<string, unknown> = {}
  if (tenantFilter) where.provider = { tenantId: tenantFilter }
  if ((STATUSES as readonly string[]).includes(status)) where.status = status
  if (providerId) {
    // provider filtresi tenant kapsamıyla birleşir
    where.provider = {
      ...(typeof where.provider === 'object' && where.provider ? (where.provider as Record<string, unknown>) : {}),
      id: providerId,
    }
  }
  if (q) {
    const num = q.replace(/\D/g, '')
    where.AND = [
      {
        OR: [
          { customerName: { contains: q } },
          ...(num.length >= 3 ? [{ customerPhone: { contains: num } }] : []),
          { provider: { name: { contains: q } } },
        ],
      },
    ]
  }
  // tarih aralığı — preferredDate floating local gün başları
  const dFrom = from ? new Date(`${from}T00:00:00`) : null
  const dTo = to ? new Date(`${to}T00:00:00`) : null
  if (dFrom && !isNaN(dFrom.getTime())) {
    where.preferredDate = { ...(typeof where.preferredDate === 'object' && where.preferredDate ? (where.preferredDate as Record<string, unknown>) : {}), gte: dFrom }
  }
  if (dTo && !isNaN(dTo.getTime())) {
    const dayAfter = new Date(dTo.getTime() + 24 * 60 * 60_000)
    where.preferredDate = { ...(typeof where.preferredDate === 'object' && where.preferredDate ? (where.preferredDate as Record<string, unknown>) : {}), lt: dayAfter }
  }

  const scopeWhere = tenantFilter ? { provider: { tenantId: tenantFilter } } : {}

  const [items, total, waitingCount] = await Promise.all([
    db.waitlistEntry.findMany({
      where,
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        serviceName: true,
        preferredDate: true,
        preferredSlot: true,
        note: true,
        status: true,
        notifiedAt: true,
        createdAt: true,
        appointmentId: true,
        provider: { select: { name: true, slug: true } },
      },
    }),
    db.waitlistEntry.count({ where }),
    db.waitlistEntry.count({ where: { ...scopeWhere, status: 'waiting' } }),
  ])

  return ok({
    items: items.map((w) => ({
      id: w.id,
      providerName: w.provider.name,
      providerSlug: w.provider.slug,
      customerName: w.customerName,
      customerPhone: w.customerPhone,
      serviceName: w.serviceName,
      preferredDate: w.preferredDate,
      preferredSlot: w.preferredSlot,
      note: w.note,
      status: w.status,
      notifiedAt: w.notifiedAt,
      createdAt: w.createdAt,
      appointmentCode: w.appointmentId ? w.appointmentId.slice(-8).toUpperCase() : null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    counts: { waiting: waitingCount },
  })
}
