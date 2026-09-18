import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok, err,
  canAccessResource,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { hasPermission } from '@/lib/rbac'

// PATCH — görev güncelle (status: complete/uncomplete dahil)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.task.findUnique({ where: { id } })
  if (!existing) return err('Görev bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const canManage = hasPermission(user!, 'tasks.manage')
  // Atanan kişi kendisiyse veya tasks.manage yetkisi varsa düzenleyebilir
  if (!canManage && existing.assigneeId !== user!.id) {
    return err('Bu görevi düzenleme yetkiniz yok', 403)
  }

  const body = await req.json()
  const {
    title, description, dueDate, assigneeId, customerId, priority,
    reminderTime, status,
  } = body

  const updateData: Record<string, unknown> = {}

  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description || null
  if (dueDate !== undefined) updateData.dueDate = new Date(dueDate)
  if (customerId !== undefined) updateData.customerId = customerId || null
  if (priority !== undefined) updateData.priority = priority
  if (reminderTime !== undefined) updateData.reminderTime = reminderTime || null

  if (assigneeId !== undefined) {
    // tasks.manage olmadan assigneeId değiştirilemez
    if (!canManage) return err('Atanan kullanıcıyı değiştirme yetkiniz yok', 403)
    if (assigneeId) {
      const newAssignee = await db.user.findFirst({
        where: { id: assigneeId, tenantId: user!.tenantId },
        select: { id: true },
      })
      if (!newAssignee) return err('Atanan kullanıcı bulunamadı', 404)
      updateData.assigneeId = assigneeId
    } else {
      updateData.assigneeId = null
    }
  }

  if (status !== undefined && status !== existing.status) {
    updateData.status = status
    if (status === 'tamamlandi') {
      updateData.completedAt = new Date()
    } else if (status === 'acik') {
      // Tekrar açma: completedAt temizle
      updateData.completedAt = null
    }
  }

  const updated = await db.task.update({
    where: { id },
    data: updateData,
    include: {
      assignee: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'task',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok(updated)
}

// DELETE — görev sil
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const existing = await db.task.findUnique({ where: { id } })
  if (!existing) return err('Görev bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const canManage = hasPermission(user!, 'tasks.manage')
  if (!canManage && existing.assigneeId !== user!.id) {
    return err('Bu görevi silme yetkiniz yok', 403)
  }

  await db.task.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'task',
    entityId: id,
    before: existing,
  })

  return ok({ success: true })
}
