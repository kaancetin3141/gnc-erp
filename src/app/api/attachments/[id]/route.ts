import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// DELETE — remove an attachment
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const attachment = await db.attachment.findUnique({
    where: { id },
    include: { customer: { select: { tenantId: true } } },
  })
  if (!attachment) return err('Dosya bulunamadı', 404)
  if (attachment.customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  await db.attachment.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'attachment',
    entityId: id,
    before: attachment,
  })

  return ok({ success: true })
}
