import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

async function getProviderForUser(providerId: string, tenantId: string) {
  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider || provider.tenantId !== tenantId) return null
  return provider
}

async function getServiceForProvider(serviceId: string, providerId: string) {
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!service || service.providerId !== providerId) return null
  return service
}

// ============================================================
// PATCH — hizmet bilgileri güncelle
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, serviceId } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const service = await getServiceForProvider(serviceId, id)
  if (!service) return err('Hizmet bulunamadı', 404)

  const body = await req.json()
  const {
    name, description, duration, price, currency, category, photo, isActive, sortOrder,
  } = body as {
    name?: string
    description?: string
    duration?: number
    price?: number
    currency?: string
    category?: string
    photo?: string | null
    isActive?: boolean
    sortOrder?: number
  }

  if (duration !== undefined && (typeof duration !== 'number' || duration <= 0)) {
    return err('Geçerli süre (dk) gerekli', 400)
  }
  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    return err('Geçerli fiyat gerekli', 400)
  }

  const updated = await db.service.update({
    where: { id: serviceId },
    data: {
      ...(name !== undefined && name.trim() ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(currency !== undefined ? { currency: currency.trim() || 'TRY' } : {}),
      ...(category !== undefined ? { category: category?.trim() || null } : {}),
      ...(photo !== undefined ? { photo: photo || null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'service',
    entityId: serviceId,
    before: { name: service.name, duration: service.duration, price: service.price },
    after: { name: updated.name, duration: updated.duration, price: updated.price },
  })

  return ok(updated)
}

// ============================================================
// DELETE — hizmet sil
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; serviceId: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, serviceId } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const service = await getServiceForProvider(serviceId, id)
  if (!service) return err('Hizmet bulunamadı', 404)

  await db.service.delete({ where: { id: serviceId } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'service',
    entityId: serviceId,
    before: { name: service.name },
  })

  return ok({ success: true })
}
