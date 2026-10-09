import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { normalizePhone } from '@/lib/format'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const contacts = await db.contact.findMany({
    where: { customerId: id },
    orderBy: { isPrimary: 'desc' },
  })
  return ok(contacts)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const body = await req.json()
  if (!body.name) return err('Kişi adı gerekli', 400)

  // Photo (base64 data URL) — 2MB sınırı
  let photoValue: string | null = null
  if (body.photo && typeof body.photo === 'string' && body.photo.startsWith('data:image/')) {
    if (body.photo.length > 2_700_000) {
      return err('Fotoğraf çok büyük (maks 2MB)', 413)
    }
    photoValue = body.photo
  }

  if (body.isPrimary) {
    await db.contact.updateMany({ where: { customerId: id }, data: { isPrimary: false } })
  }

  const contact = await db.contact.create({
    data: {
      customerId: id,
      name: body.name,
      position: body.position || null,
      email: body.email || null,
      phone: normalizePhone(body.phone) || body.phone || null,
      photo: photoValue,
      isPrimary: body.isPrimary || false,
    },
  })
  return ok(contact)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const contactId = url.searchParams.get('contactId')
  if (!contactId) return err('contactId gerekli', 400)

  await db.contact.delete({ where: { id: contactId } })
  return ok({ success: true })
}
