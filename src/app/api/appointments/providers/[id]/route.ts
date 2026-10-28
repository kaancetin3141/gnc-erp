import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err, safeJsonParse } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { getAppointmentContext } from '@/lib/appointment-perms'

// GET — tek hizmet veren (staff + services + appointments dahil)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({
    where: { id },
    include: {
      staff: { orderBy: { sortOrder: 'asc' } },
      services: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      _count: { select: { appointments: true } },
    },
  })

  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  return ok({ ...provider, workingHoursParsed: safeJsonParse(provider.workingHours, {}) })
}

// PATCH — güncelle (İŞLETME AYARLARI — yalnız şirket admini / firma sahibi)
// Usta/çırak işletme ayarlarını (çalışma saatleri, otomatik onay vb.) değiştiremez.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.serviceProvider.findUnique({ where: { id } })
  if (!existing) return err('İşletme bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (!ctx.isProviderAdmin) {
    return err('İşletme ayarları yalnızca işletme sahibi (şirket admini) tarafından değiştirilir', 403)
  }

  const body = await req.json()
  const updateData: Record<string, unknown> = {}
  const allowed = ['name', 'type', 'address', 'city', 'district', 'phone', 'email', 'photo', 'about', 'workingHours', 'isActive', 'autoApprove']
  for (const key of allowed) {
    if (key in body) updateData[key] = body[key]
  }
  // workingHours — obje gelirse JSON string'e çevir (DB kolonu String)
  if (updateData.workingHours && typeof updateData.workingHours === 'object') {
    updateData.workingHours = JSON.stringify(updateData.workingHours)
  }

  const updated = await db.serviceProvider.update({ where: { id }, data: updateData })
  return ok(updated)
}

// DELETE (işletme silme — yalnız şirket admini)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.serviceProvider.findUnique({ where: { id } })
  if (!existing) return err('İşletme bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (!ctx.isProviderAdmin) {
    return err('İşletme silme yalnızca işletme sahibi (şirket admini) tarafından yapılır', 403)
  }

  await db.serviceProvider.delete({ where: { id } })
  return ok({ success: true })
}
