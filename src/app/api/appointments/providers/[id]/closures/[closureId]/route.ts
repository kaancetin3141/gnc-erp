import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// DELETE — işletme tatil kaydını sil (tenant sahiplik guard'lı)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; closureId: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, closureId } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const closure = await db.providerClosure.findUnique({ where: { id: closureId } })
  if (!closure || closure.providerId !== id) return err('Tatil kaydı bulunamadı', 404)

  await db.providerClosure.delete({ where: { id: closureId } })

  return ok({ deleted: true })
}
