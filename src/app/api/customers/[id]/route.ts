import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err, canAccessResource, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { normalizePhone } from '@/lib/format'

// GET — müşteri detayı (360)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { orderBy: { isPrimary: 'desc' } },
      activities: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        take: 50,
      },
      notes: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      },
      deals: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
      },
      _count: { select: { contacts: true, activities: true, deals: true, tasks: true, notes: true, attachments: true } },
    },
  })

  if (!customer) return err('Müşteri bulunamadı', 404)
  if (customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const canAccess = await canAccessResource(user!, customer.ownerId)
  if (!canAccess) return err('Bu müşteriyi görüntüleme yetkiniz yok', 403)

  return ok({
    ...customer,
    tags: safeJsonParse<string[]>(customer.tags, []),
    activities: customer.activities.map((a) => a),
    notes: customer.notes.map((n) => n),
  })
}

// PATCH — müşteri güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'customers.edit')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.customer.findUnique({ where: { id } })
  if (!existing) return err('Müşteri bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const canAccess = await canAccessResource(user!, existing.ownerId)
  if (!canAccess) return err('Bu müşteriyi düzenleme yetkiniz yok', 403)

  const body = await req.json()
  const updateData: Record<string, unknown> = {}
  const allowed = ['name', 'sector', 'segment', 'source', 'address', 'city', 'country', 'lat', 'lng', 'phone', 'email', 'web', 'taxNumber', 'logo', 'status', 'annualRevenue', 'employeeCount', 'kvkkConsent', 'ownerId', 'customerType']

  for (const key of allowed) {
    if (key in body) {
      if (key === 'phone' && body[key]) {
        updateData[key] = normalizePhone(body[key]) || body[key]
      } else if (key === 'tags') {
        updateData[key] = JSON.stringify(body[key] || [])
      } else if (key === 'kvkkConsent') {
        updateData[key] = body[key]
        if (body[key] && !existing.kvkkConsent) updateData.kvkkConsentAt = new Date()
      } else if (key === 'logo') {
        // Logo: data URL (base64) — 2MB sınırı; null ise temizle
        const v = body[key]
        if (v === null || v === '') {
          updateData[key] = null
        } else if (typeof v === 'string' && v.startsWith('data:image/')) {
          if (v.length > 2_700_000) return err('Logo çok büyük (maks 2MB)', 413)
          updateData[key] = v
        }
      } else if (key === 'customerType') {
        const validTypes = ['kafe', 'dis_ticaret', 'musteri_hizmetleri', 'musteri']
        if (validTypes.includes(body[key])) {
          updateData[key] = body[key]
        }
      } else {
        updateData[key] = body[key]
      }
    }
  }
  if (body.tags !== undefined) {
    updateData.tags = JSON.stringify(body.tags || [])
  }

  const updated = await db.customer.update({ where: { id }, data: updateData })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'customer',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok({ ...updated, tags: safeJsonParse<string[]>(updated.tags, []) })
}

// DELETE — müşteri sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'customers.delete')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.customer.findUnique({ where: { id } })
  if (!existing) return err('Müşteri bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  await db.customer.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'customer',
    entityId: id,
    before: existing,
  })

  return ok({ success: true })
}
