import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requirePermission, ok, err, safeJsonParse,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { normalizePhone } from '@/lib/format'
import type { PermissionKey } from '@/types'

// PATCH — kullanıcı güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return err('Kullanıcı bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const body = await req.json()
  const { role, permissions, managerId, status, title, phone, name, email } = body

  const updateData: Record<string, unknown> = {}

  if (name !== undefined) updateData.name = name
  if (email !== undefined) {
    // Email unique kontrol (kendisi hariç)
    const dup = await db.user.findFirst({
      where: { email, NOT: { id } },
      select: { id: true },
    })
    if (dup) return err('Bu e-posta başka bir kullanıcıda kayıtlı', 409)
    updateData.email = email
  }
  if (role !== undefined) updateData.role = role
  if (status !== undefined) updateData.status = status
  if (title !== undefined) updateData.title = title || null
  if (phone !== undefined) updateData.phone = phone ? normalizePhone(phone) || phone : null

  // Permissions validate: actor yalnızca kendi sahip olduğu yetkileri verebilir
  if (permissions !== undefined) {
    const actorPerms = user!.permissions
    const newPerms = Array.isArray(permissions) ? permissions : []
    const invalid = newPerms.filter((p: string) => !actorPerms.includes(p as PermissionKey))
    if (invalid.length > 0) {
      return err(`Yetkiniz olmayan yetkiler: ${invalid.join(', ')}`, 403)
    }
    updateData.permissions = JSON.stringify(newPerms)
  }

  // managerId cycle kontrolü: id, managerId'nin yönetici hiyerarşisinde olmamalı
  if (managerId !== undefined) {
    if (managerId === id) {
      return err('Kullanıcı kendisinin yöneticisi olamaz', 400)
    }
    if (managerId !== null) {
      const manager = await db.user.findFirst({
        where: { id: managerId, tenantId: user!.tenantId },
        select: { id: true },
      })
      if (!manager) return err('Yönetici bulunamadı', 404)

      // Cycle kontrol: managerId'nin yönetici zincirinde id var mı?
      // Tüm tenant kullanıcılarını çek ve managerId'nin üstlerini takip et
      const users = await db.user.findMany({
        where: { tenantId: user!.tenantId },
        select: { id: true, managerId: true },
      })
      const managerMap = new Map<string, string | null>()
      for (const u of users) managerMap.set(u.id, u.managerId)

      let current: string | null = managerId
      while (current) {
        if (current === id) {
          return err('Bu atama döngü oluşturur (yönetici hiyerarşisi)', 400)
        }
        current = managerMap.get(current) ?? null
      }
      updateData.managerId = managerId
    } else {
      updateData.managerId = null
    }
  }

  const updated = await db.user.update({
    where: { id },
    data: updateData,
    include: {
      manager: { select: { id: true, name: true } },
      _count: {
        select: {
          ownedCustomers: true,
          ownedLeads: true,
          ownedDeals: true,
          subordinates: true,
        },
      },
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'user',
    entityId: id,
    before: { ...existing, permissions: safeJsonParse<PermissionKey[]>(existing.permissions, []) },
    after: { ...updated, permissions: safeJsonParse<PermissionKey[]>(updated.permissions, []) },
  })

  return ok({
    ...updated,
    permissions: safeJsonParse<PermissionKey[]>(updated.permissions, []),
  })
}

// DELETE — soft delete (status='passive')
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const { id } = await params
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return err('Kullanıcı bulunamadı', 404)
  if (existing.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)
  if (existing.id === user!.id) return err('Kendinizi pasifleştiremezsiniz', 400)

  const updated = await db.user.update({
    where: { id },
    data: { status: 'passive' },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'user',
    entityId: id,
    before: existing,
    after: updated,
  })

  return ok({ success: true, status: updated.status })
}
