import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { revokeUserSessions, writeAuditLog } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// POST /api/users/password-reset — admin/manager: personelin şifresini sıfırla
// Body: { userId, newPassword }
// Yetki: admin veya superadmin (manager sadece kendi astları için)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => ({}))
  const targetId = typeof body.userId === 'string' ? body.userId : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!targetId || !newPassword) {
    return err('userId ve newPassword gerekli', 400)
  }
  if (newPassword.length < 4) {
    return err('Şifre en az 4 karakter olmalı', 400)
  }

  // Rol kontrolü: admin/superadmin herkesi, manager sadece astlarını sıfırlayabilir
  const role = user!.role
  if (!['admin', 'superadmin', 'manager'].includes(role)) {
    return err('Bu işlem için yetkiniz yok', 403)
  }

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, tenantId: true, name: true, managerId: true },
  })
  if (!target) return err('Kullanıcı bulunamadı', 404)

  // Tenant izolasyonu
  if (target.tenantId !== user!.tenantId && user!.role !== 'superadmin') {
    return err('Başka şirketin kullanıcısına erişemezsiniz', 403)
  }
  if (role === 'manager' && target.managerId !== user!.id) {
    return err('Sadece kendi ekibinizdeki kişilerin şifresini sıfırlayabilirsiniz', 403)
  }
  if (targetId === user!.id) {
    return err('Kendi şifrenizi Ayarlar > Şifre Değiştir\'den güncelleyin', 400)
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await db.user.update({
    where: { id: targetId },
    data: { passwordHash: hash },
  })

  // Hedef kullanıcının tüm oturumlarını kapat
  await revokeUserSessions(targetId)

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'user_password_reset',
    entityId: targetId,
    after: { targetName: target.name },
  })

  return ok({ success: true, message: `${target.name} için şifre sıfırlandı` })
}
