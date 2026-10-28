import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { getAppointmentContext, hasNoScope } from '@/lib/appointment-perms'

async function getProviderForUser(providerId: string, tenantId: string) {
  const provider = await db.serviceProvider.findUnique({ where: { id: providerId } })
  if (!provider || provider.tenantId !== tenantId) return null
  return provider
}

// ============================================================
// GET — sağlayıcı için tüm staff-service bağlantıları
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (hasNoScope(ctx)) return err('Bu işletmede personel kaydınız yok', 403)

  const links = await db.staffService.findMany({
    where: { staff: { providerId: id, ...(ctx.myStaffId ? { id: ctx.myStaffId } : {}) } },
    include: { staff: true, service: true },
  })

  return ok({
    items: links.map((l) => ({
      id: l.id,
      staffId: l.staffId,
      serviceId: l.serviceId,
      staffName: l.staff.name,
      serviceName: l.service.name,
    })),
  })
}

// ============================================================
// POST — personeli hizmete bağla
// Body: { staffId, serviceId }
// Şirket admini: herhangi bir personel. Usta/çırak: YALNIZ kendi kaydı.
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (hasNoScope(ctx)) return err('Bu işletmede personel kaydınız yok', 403)

  const body = await req.json()
  const { staffId, serviceId } = body as { staffId?: string; serviceId?: string }

  if (!staffId || !serviceId) return err('staffId ve serviceId gerekli', 400)

  // Usta/çırak yalnız KENDİ hizmet atamasını değiştirebilir
  if (!ctx.isProviderAdmin && staffId !== ctx.myStaffId) {
    return err('Yalnızca kendi hizmet atamalarınızı yönetebilirsiniz', 403)
  }

  // staff ve service bu sağlayıcıya mı ait?
  const staff = await db.staff.findUnique({ where: { id: staffId } })
  if (!staff || staff.providerId !== id) return err('Personel bulunamadı', 404)
  const service = await db.service.findUnique({ where: { id: serviceId } })
  if (!service || service.providerId !== id) return err('Hizmet bulunamadı', 404)

  // Zaten bağlı mı?
  const existing = await db.staffService.findUnique({
    where: { staffId_serviceId: { staffId, serviceId } },
  })
  if (existing) return ok(existing) // idempotent

  const link = await db.staffService.create({
    data: { staffId, serviceId },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'link',
    entity: 'staff_service',
    entityId: link.id,
    after: { staffId, serviceId, staffName: staff.name, serviceName: service.name },
  })

  return ok(link)
}

// ============================================================
// DELETE — bağlantıyı kaldır
// Body: { staffId, serviceId }
// Şirket admini: herhangi bir personel. Usta/çırak: YALNIZ kendi kaydı.
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await getProviderForUser(id, user!.tenantId)
  if (!provider) return err('İşletme bulunamadı', 404)

  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (hasNoScope(ctx)) return err('Bu işletmede personel kaydınız yok', 403)

  const body = await req.json().catch(() => ({}))
  const { staffId, serviceId } = body as { staffId?: string; serviceId?: string }

  if (!staffId || !serviceId) return err('staffId ve serviceId gerekli', 400)

  // Usta/çırak yalnız KENDİ hizmet atamasını kaldırabilir
  if (!ctx.isProviderAdmin && staffId !== ctx.myStaffId) {
    return err('Yalnızca kendi hizmet atamalarınızı yönetebilirsiniz', 403)
  }

  // Bu bağlantı sağlayıcıya mı ait?
  const staff = await db.staff.findUnique({ where: { id: staffId } })
  if (!staff || staff.providerId !== id) return err('Personel bulunamadı', 404)

  try {
    await db.staffService.delete({
      where: { staffId_serviceId: { staffId, serviceId } },
    })
  } catch {
    // zaten yoksa sessiz geç
  }

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'unlink',
    entity: 'staff_service',
    entityId: `${staffId}_${serviceId}`,
    before: { staffId, serviceId },
  })

  return ok({ success: true })
}
