import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { normalizePhoneDigits } from '@/lib/appointment-customer'

// ============================================================
// Müşteri Kayıt Defteri — işletme bazlı kalıcı müşteri profilleri
// GET  ?q=  → aramalı liste + müşteri başına randevu istatistikleri
// POST      → yeni müşteri oluştur
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
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const qDigits = normalizePhoneDigits(q)

  const where: Record<string, unknown> = { providerId: id }
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      ...(qDigits ? [{ phoneDigits: { contains: qDigits } }] : []),
    ]
  }

  const customers = await db.appointmentCustomer.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 300,
  })

  // Randevu istatistikleri — tek sorguda topla, JS'te müşteri başına hesapla
  const appts = await db.appointment.findMany({
    where: { providerId: id, customerId: { in: customers.map((c) => c.id) } },
    select: { customerId: true, status: true, price: true, date: true },
  })

  const now = new Date()
  const statsByCustomer = new Map<string, {
    total: number; completed: number; cancelled: number; spent: number
    lastVisit: string | null; nextVisit: string | null
  }>()

  for (const a of appts) {
    if (!a.customerId) continue
    const s = statsByCustomer.get(a.customerId) ?? {
      total: 0, completed: 0, cancelled: 0, spent: 0, lastVisit: null as string | null, nextVisit: null as string | null,
    }
    s.total++
    if (a.status === 'tamamlandi') { s.completed++; s.spent += a.price || 0 }
    if (a.status === 'iptal' || a.status === 'gelmedi') s.cancelled++
    const d = new Date(a.date)
    if (d < now) {
      if (!s.lastVisit || d > new Date(s.lastVisit)) s.lastVisit = d.toISOString()
    } else if (['beklemede', 'onaylandi'].includes(a.status)) {
      if (!s.nextVisit || d < new Date(s.nextVisit)) s.nextVisit = d.toISOString()
    }
    statsByCustomer.set(a.customerId, s)
  }

  const items = customers.map((c) => ({
    ...c,
    stats: statsByCustomer.get(c.id) ?? { total: 0, completed: 0, cancelled: 0, spent: 0, lastVisit: null, nextVisit: null },
  }))

  // Özet
  const allCount = await db.appointmentCustomer.count({ where: { providerId: id } })
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const newThisMonth = await db.appointmentCustomer.count({
    where: { providerId: id, createdAt: { gte: monthStart } },
  })
  const withVisits = items.filter((c) => c.stats.total > 0).length

  return ok({
    items,
    summary: {
      total: allCount,
      withVisits,
      newThisMonth,
      blocked: items.filter((c) => c.isBlocked).length,
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { name, phone, email, address, notes, tags, birthday, isBlocked } = body as {
    name?: string; phone?: string; email?: string; address?: string
    notes?: string; tags?: string[]; birthday?: string; isBlocked?: boolean
  }

  if (!name?.trim()) return err('Müşteri adı gerekli', 400)
  if (!phone?.trim()) return err('Telefon gerekli', 400)
  const digits = normalizePhoneDigits(phone)
  if (digits.length < 7) return err('Geçerli bir telefon numarası girin', 400)

  const existing = await db.appointmentCustomer.findUnique({
    where: { providerId_phoneDigits: { providerId: id, phoneDigits: digits } },
    select: { id: true, name: true },
  })
  if (existing) return err(`Bu telefon numarası zaten kayıtlı: ${existing.name}`, 409)

  const customer = await db.appointmentCustomer.create({
    data: {
      providerId: id,
      name: name.trim(),
      phone: phone.trim(),
      phoneDigits: digits,
      email: email?.trim() || null,
      address: address?.trim() || null,
      notes: notes?.trim() || null,
      tags: Array.isArray(tags) && tags.length ? JSON.stringify(tags) : null,
      birthday: birthday?.trim() || null,
      isBlocked: !!isBlocked,
    },
  })

  return ok(customer, 201)
}
