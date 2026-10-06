import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_STATUSES = ['acik', 'inceleniyor', 'cozuldu', 'reddedildi']
const VALID_PRIORITIES = ['dusuk', 'normal', 'yuksek', 'acil']

// ============================================================
// PATCH — şikayet/arıza talebi güncelle
// (durum, öncelik, personel atama, maliyet, hedef tarih, cevap)
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; complaintId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, complaintId } = await params
  const site = await db.site.findUnique({ where: { id } })
  if (!site || site.tenantId !== user!.tenantId) return err('Site bulunamadı', 404)

  const complaint = await db.complaint.findUnique({ where: { id: complaintId } })
  if (!complaint || complaint.siteId !== id) return err('Talep bulunamadı', 404)

  const body = await req.json()
  const { status, priority, category, assignedStaffId, estimatedCost, actualCost, dueDate, response, title, description } = body as {
    status?: string; priority?: string; category?: string; assignedStaffId?: string | null
    estimatedCost?: number | null; actualCost?: number | null; dueDate?: string | null
    response?: string; title?: string; description?: string
  }

  const data: Record<string, unknown> = {}

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) return err('Geçersiz durum', 400)
    data.status = status
    if (status === 'cozuldu') data.resolvedAt = new Date()
    else data.resolvedAt = null
  }
  if (priority !== undefined) {
    if (!VALID_PRIORITIES.includes(priority)) return err('Geçersiz öncelik', 400)
    data.priority = priority
  }
  if (category !== undefined) data.category = category
  if (title !== undefined && title.trim()) data.title = title.trim()
  if (description !== undefined && description.trim()) data.description = description.trim()

  if (assignedStaffId !== undefined) {
    if (assignedStaffId) {
      const staff = await db.siteStaff.findUnique({ where: { id: assignedStaffId } })
      if (!staff || staff.siteId !== id) return err('Personel bulunamadı', 404)
      data.assignedStaffId = assignedStaffId
      // atanınca durum acik → inceleniyor (otomatik ilerleme)
      if (complaint.status === 'acik' && status === undefined) data.status = 'inceleniyor'
    } else {
      data.assignedStaffId = null
    }
  }

  if (estimatedCost !== undefined) data.estimatedCost = estimatedCost == null ? null : Math.max(0, Number(estimatedCost))
  if (actualCost !== undefined) data.actualCost = actualCost == null ? null : Math.max(0, Number(actualCost))
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (response !== undefined) {
    data.response = response?.trim() || null
    data.respondedAt = response?.trim() ? new Date() : null
  }

  const updated = await db.complaint.update({
    where: { id: complaintId },
    data,
    include: {
      resident: { select: { name: true, phone: true } },
      assignedStaff: { select: { id: true, name: true, role: true, phone: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'complaint',
    entityId: complaintId,
    after: { status: updated.status, priority: updated.priority, assignedStaffId: updated.assignedStaffId },
  })

  return ok(updated)
}

// DELETE — talep sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; complaintId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, complaintId } = await params
  const site = await db.site.findUnique({ where: { id } })
  if (!site || site.tenantId !== user!.tenantId) return err('Site bulunamadı', 404)

  const complaint = await db.complaint.findUnique({ where: { id: complaintId } })
  if (!complaint || complaint.siteId !== id) return err('Talep bulunamadı', 404)

  await db.complaint.delete({ where: { id: complaintId } })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'complaint',
    entityId: complaintId,
    before: { title: complaint.title },
  })
  return ok({ deleted: true })
}
