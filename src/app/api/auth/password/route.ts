import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { revokeUserSessions, writeAuditLog } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// POST /api/auth/password — kullanıcının KENDİ şifresini değiştirmesi
// Body: { currentPassword, newPassword }
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({}))
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!currentPassword || !newPassword) {
    return err('Mevcut şifre ve yeni şifre gerekli', 400)
  }
  if (newPassword.length < 4) {
    return err('Yeni şifre en az 4 karakter olmalı', 400)
  }
  if (newPassword === currentPassword) {
    return err('Yeni şifre mevcut şifreyle aynı olamaz', 400)
  }

  const dbUser = await db.user.findUnique({
    where: { id: user!.id },
    select: { id: true, tenantId: true, passwordHash: true },
  })
  if (!dbUser) return err('Kullanıcı bulunamadı', 404)

  if (dbUser.passwordHash) {
    const ok = await bcrypt.compare(currentPassword, dbUser.passwordHash)
    if (!ok) return err('Mevcut şifre hatalı', 401)
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await db.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: hash },
  })

  // Diğer cihazlardaki oturumları kapat (bu oturum hariç)
  const token = req.headers.get('x-gnc-session') || undefined
  await revokeUserSessions(dbUser.id, token)

  await writeAuditLog({
    tenantId: dbUser.tenantId,
    actorId: dbUser.id,
    action: 'update',
    entity: 'user_password',
    entityId: dbUser.id,
  })

  return ok({ success: true, message: 'Şifre güncellendi' })
}
