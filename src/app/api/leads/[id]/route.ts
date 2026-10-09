import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
  canAccessResource, safeJsonParse,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — lead detayı
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      convertedCustomer: { select: { id: true, name: true } },
      activities: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      },
    },
  })

  if (!lead) return err('Lead bulunamadı', 404)
  if (lead.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const canAccess = await canAccessResource(user!, lead.ownerId)
  if (!canAccess) return err('Bu leadı görüntüleme yetkiniz yok', 403)

  return ok({
    ...lead,
    notes: safeJsonParse<unknown[]>(lead.notes, []),
  })
}

// PATCH — lead güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'leads.edit')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.lead.findUnique({ where: { id } })
  if (!existing) return err('Lead bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const canAccess = await canAccessResource(user!, existing.ownerId)
  if (!canAccess) return err('Bu leadı düzenleme yetkiniz yok', 403)

  const body = await req.json()
  const { status, ownerId, notes, convertedCustomerId, name, phone, address, city, category } = body

  const updateData: Record<string, unknown> = {}

  if (status !== undefined) updateData.status = status
  if (ownerId !== undefined) {
    if (ownerId) {
      const newOwner = await db.user.findFirst({
        where: { id: ownerId, tenantId: user!.tenantId },
        select: { id: true },
      })
      if (!newOwner) return err('Yeni sahip bulunamadı', 404)
      updateData.ownerId = ownerId
    } else {
      updateData.ownerId = null
    }
  }
  if (notes !== undefined) {
    updateData.notes = JSON.stringify(Array.isArray(notes) ? notes : [])
  }
  if (convertedCustomerId !== undefined) {
    updateData.convertedCustomerId = convertedCustomerId || null
  }
  if (name !== undefined) updateData.name = name
  if (phone !== undefined) updateData.phone = phone || null
  if (address !== undefined) updateData.address = address || null
  if (city !== undefined) updateData.city = city || null
  if (category !== undefined) updateData.category = category || null

  // Status 'donustu' ise: convertedCustomerId yoksa otomatik Customer oluştur
  if (status === 'donustu' && !convertedCustomerId && !existing.convertedCustomerId) {
    // Sadece placeId ile mükerrer kontrolü (Google Maps benzersiz ID)
    // İsim/telefon eşleşmesi çok agresif — farklı işletmeler benzer isimlere sahip olabilir
    let existingCustomer: { id: string; name: string } | null = null
    if (existing.placeId) {
      existingCustomer = await db.customer.findFirst({
        where: {
          tenantId: user!.tenantId,
          placeId: existing.placeId,
        },
        select: { id: true, name: true },
      })
    }

    if (existingCustomer) {
      // Mevcut müşteriye bağla
      updateData.convertedCustomerId = existingCustomer.id
    } else {
      // Yeni müşteri oluştur
      const newCustomer = await db.customer.create({
        data: {
          tenantId: user!.tenantId,
          name: existing.name,
          sector: existing.category || 'Diğer',
          segment: 'potansiyel',
          ownerId: existing.ownerId,
          source: 'google_maps',
          address: existing.address,
          city: existing.city,
          country: existing.country || 'TR',
          lat: existing.lat,
          lng: existing.lng,
          placeId: existing.placeId,
          phone: existing.phone,
          web: existing.web,
          status: 'aktif',
          tags: JSON.stringify(['Maps Lead']),
          kvkkConsent: false,
        },
      })
      updateData.convertedCustomerId = newCustomer.id
      await writeAuditLog({
        tenantId: user!.tenantId,
        actorId: user!.id,
        action: 'create',
        entity: 'customer',
        entityId: newCustomer.id,
        after: { ...newCustomer, source: 'lead_conversion', leadId: id },
      })
    }
  } else if (status === 'donustu' && convertedCustomerId) {
    const cust = await db.customer.findFirst({
      where: { id: convertedCustomerId, tenantId: user!.tenantId },
      select: { id: true },
    })
    if (!cust) return err('Dönüştürülen müşteri bulunamadı', 404)
  }

  const updated = await db.lead.update({
    where: { id },
    data: updateData,
    include: {
      owner: { select: { id: true, name: true } },
      convertedCustomer: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'lead',
    entityId: id,
    before: { ...existing, notes: safeJsonParse<unknown[]>(existing.notes, []) },
    after: { ...updated, notes: safeJsonParse<unknown[]>(updated.notes, []) },
  })

  return ok({
    ...updated,
    notes: safeJsonParse<unknown[]>(updated.notes, []),
  })
}
