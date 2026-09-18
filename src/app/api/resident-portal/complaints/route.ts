import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// GET — sakinin şikayetleri
export async function GET(req: NextRequest) {
  const residentId = req.headers.get('x-resident-session')
  if (!residentId) return err('Oturum açmanız gerekli', 401)

  const complaints = await db.complaint.findMany({
    where: { residentId },
    orderBy: { createdAt: 'desc' },
  })
  return ok(complaints)
}

// POST — yeni şikayet
export async function POST(req: NextRequest) {
  const residentId = req.headers.get('x-resident-session')
  if (!residentId) return err('Oturum açmanız gerekli', 401)

  const resident = await db.resident.findUnique({ where: { id: residentId }, select: { siteId: true } })
  if (!resident) return err('Sakin bulunamadı', 404)

  const body = await req.json()
  if (!body.title || !body.description) return err('Başlık ve açıklama gerekli', 400)

  const complaint = await db.complaint.create({
    data: {
      siteId: resident.siteId,
      residentId,
      title: body.title,
      description: body.description,
      category: body.category || 'diger',
      priority: body.priority || 'normal',
    },
  })
  return ok(complaint)
}
