import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// DELETE — hesabı bağlantıyı kes (soft delete: isActive=false)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'social.manage')) return err('Sosyal medya yönetme yetkiniz yok', 403)

  const { id } = await params

  const account = await db.socialAccount.findFirst({
    where: { id, tenantId: user!.tenantId },
  })
  if (!account) return err('Hesap bulunamadı', 404)

  await db.socialAccount.update({
    where: { id },
    data: { isActive: false, disconnectedAt: new Date() },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'social.disconnect',
    entity: 'social_account',
    entityId: id,
    before: { platform: account.platform, handle: account.handle },
  })

  return ok({ success: true })
}
