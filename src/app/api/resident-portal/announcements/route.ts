import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// GET — sakinin sitesinin duyuruları
export async function GET(req: NextRequest) {
  const residentId = req.headers.get('x-resident-session')
  if (!residentId) return err('Oturum açmanız gerekli', 401)

  const resident = await db.resident.findUnique({ where: { id: residentId }, select: { siteId: true } })
  if (!resident) return err('Sakin bulunamadı', 404)

  const announcements = await db.announcement.findMany({
    where: { siteId: resident.siteId },
    orderBy: [{ isPinned: 'desc' }, { publishDate: 'desc' }],
    take: 20,
  })
  return ok(announcements)
}
