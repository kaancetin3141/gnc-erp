import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// ============================================================
// YAKLAŞAN DOĞUM GÜNLERİ — takvim üstü hatırlatma bandı için
// GET ?days=7 → önümüzdeki N gün içinde doğum günü olan müşteriler
// (birthday alanı "MM-DD" formatında; engelli müşteriler hariç)
// ============================================================

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const url = new URL(req.url)
  const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get('days') || '7') || 7))

  const customers = await db.appointmentCustomer.findMany({
    where: { providerId: id, isBlocked: false, NOT: { birthday: null } },
    select: {
      id: true, name: true, phone: true, birthday: true, tags: true,
      appointments: { orderBy: { date: 'desc' }, take: 1, select: { date: true } },
      _count: { select: { appointments: true } },
    },
  })

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const upcoming: {
    id: string; name: string; phone: string; birthday: string
    nextDate: string; daysUntil: number; isToday: boolean; appointmentCount: number
  }[] = []

  for (const c of customers) {
    if (!c.birthday) continue
    const m = c.birthday.match(/^(\d{1,2})-(\d{1,2})$/)
    if (!m) continue
    const mm = parseInt(m[1])
    const dd = parseInt(m[2])
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) continue

    // Bu yılki doğum günü; geçtiyse gelecek yılki
    let next = new Date(now.getFullYear(), mm - 1, dd)
    if (next.getTime() < today.getTime()) {
      next = new Date(now.getFullYear() + 1, mm - 1, dd)
    }
    const daysUntil = Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60_000))
    if (daysUntil > days) continue

    upcoming.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      birthday: c.birthday,
      nextDate: next.toISOString(),
      daysUntil,
      isToday: daysUntil === 0,
      appointmentCount: c._count?.appointments ?? 0,
    })
  }

  upcoming.sort((a, b) => a.daysUntil - b.daysUntil)

  return ok({ items: upcoming, windowDays: days })
}
