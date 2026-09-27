import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { normalizePhoneDigits } from '@/lib/appointment-customer'

// ============================================================
// Müşteri Kayıt Defteri — tek müşteri
// GET    → profil + tüm randevu geçmişi (özet istatistiklerle)
// PATCH  → profil güncelle
// DELETE → müşteri kaydını sil (randevular kalır, ilişki kopar)
// ============================================================

async function guard(req: NextRequest, providerId: string, customerId: string) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return { authErr, customer: null, user: null }

  const provider = await db.serviceProvider.findUnique({ where: { id: providerId }, select: { tenantId: true } })
  if (!provider) return { authErr: err('İşletme bulunamadı', 404), customer: null, user: null }
  if (provider.tenantId !== user!.tenantId) return { authErr: err('Erişim reddedildi', 403), customer: null, user: null }

  const customer = await db.appointmentCustomer.findFirst({
    where: { id: customerId, providerId },
  })
  if (!customer) return { authErr: err('Müşteri bulunamadı', 404), customer: null, user }
  return { authErr: null, customer, user: user! }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const { id, customerId } = await params
  const { authErr, customer } = await guard(req, id, customerId)
  if (authErr) return authErr

  const history = await db.appointment.findMany({
    where: { providerId: id, customerId },
    include: {
      staff: { select: { id: true, name: true, title: true, photo: true } },
      service: { select: { id: true, name: true, duration: true, price: true } },
    },
    orderBy: { date: 'desc' },
    take: 100,
  })

  return ok({ customer, history })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const { id, customerId } = await params
  const { authErr, customer } = await guard(req, id, customerId)
  if (authErr) return authErr

  const body = await req.json()
  const { name, phone, email, address, notes, tags, birthday, isBlocked } = body as {
    name?: string; phone?: string; email?: string; address?: string
    notes?: string | null; tags?: string[]; birthday?: string; isBlocked?: boolean
  }

  const data: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name.trim()) return err('Müşteri adı boş olamaz', 400)
    data.name = name.trim()
  }
  if (phone !== undefined) {
    const digits = normalizePhoneDigits(phone)
    if (digits.length < 7) return err('Geçerli bir telefon numarası girin', 400)
    if (digits !== customer.phoneDigits) {
      const clash = await db.appointmentCustomer.findUnique({
        where: { providerId_phoneDigits: { providerId: id, phoneDigits: digits } },
        select: { id: true, name: true },
      })
      if (clash) return err(`Bu telefon numarası zaten kayıtlı: ${clash.name}`, 409)
    }
    data.phone = phone.trim()
    data.phoneDigits = digits
  }
  if (email !== undefined) data.email = email?.trim() || null
  if (address !== undefined) data.address = address?.trim() || null
  if (notes !== undefined) data.notes = notes?.trim() || null
  if (tags !== undefined) data.tags = Array.isArray(tags) && tags.length ? JSON.stringify(tags) : null
  if (birthday !== undefined) data.birthday = birthday?.trim() || null
  if (isBlocked !== undefined) data.isBlocked = !!isBlocked

  const updated = await db.appointmentCustomer.update({ where: { id: customer.id }, data })
  return ok(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; customerId: string }> }) {
  const { id, customerId } = await params
  const { authErr } = await guard(req, id, customerId)
  if (authErr) return authErr

  await db.appointmentCustomer.delete({ where: { id: customerId } })
  return ok({ deleted: true })
}
