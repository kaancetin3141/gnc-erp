import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// DELETE — personel izin kaydını sil
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; timeOffId: string }> },
) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id, timeOffId } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId) return err('Erişim reddedildi', 403)

  const existing = await db.staffTimeOff.findUnique({ where: { id: timeOffId } })
  if (!existing || existing.providerId !== id) return err('İzin kaydı bulunamadı', 404)

  await db.staffTimeOff.delete({ where: { id: timeOffId } })

  return ok({ success: true })
}
