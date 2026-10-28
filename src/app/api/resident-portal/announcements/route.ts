import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// GET — sakinin sitesinin duyuruları
export async function GET(req: NextRequest) {
  const residentId = req.headers.get('x-resident-session')
  if (!residentId) return err('Oturum açmanız gerekli', 401)

  const resident = await db.resident.findUnique({
    where: { id: residentId },
    select: { siteId: true, isActive: true },
  })
  if (!resident) return err('Sakin bulunamadı', 404)
  // P1: devre dışı bırakılan sakin eski oturum token'ıyla erişemez
  if (!resident.isActive) return err('Hesabınız devre dışı — yönetimle iletişime geçin', 403)

  // Süresi geçmiş duyurular gösterilmez (S18 — expiryDate artık filtreleniyor)
  const now = new Date()
  const announcements = await db.announcement.findMany({
    where: {
      siteId: resident.siteId,
      OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
    },
    orderBy: [{ isPinned: 'desc' }, { publishDate: 'desc' }],
    take: 20,
  })
  return ok(announcements)
}
