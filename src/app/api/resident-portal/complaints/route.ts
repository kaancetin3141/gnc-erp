import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// P1: devre dışı sakin kontrolü — ortak yardımcı
async function getActiveResident(residentId: string) {
  const resident = await db.resident.findUnique({
    where: { id: residentId },
    select: { id: true, siteId: true, isActive: true },
  })
  if (!resident) return { error: err('Sakin bulunamadı', 404) }
  if (!resident.isActive) return { error: err('Hesabınız devre dışı — yönetimle iletişime geçin', 403) }
  return { resident }
}

// GET — sakinin şikayetleri
export async function GET(req: NextRequest) {
  const residentId = req.headers.get('x-resident-session')
  if (!residentId) return err('Oturum açmanız gerekli', 401)

  const { resident, error } = await getActiveResident(residentId)
  if (error || !resident) return error!

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

  const { resident, error } = await getActiveResident(residentId)
  if (error || !resident) return error!

  const body = await req.json()
  if (!body.title || !body.description) return err('Başlık ve açıklama gerekli', 400)
  if (String(body.title).length > 200) return err('Başlık en fazla 200 karakter olabilir', 400)
  if (String(body.description).length > 2000) return err('Açıklama en fazla 2000 karakter olabilir', 400)

  const complaint = await db.complaint.create({
    data: {
      siteId: resident.siteId,
      residentId,
      title: String(body.title).trim(),
      description: String(body.description).trim(),
      category: body.category || 'diger',
      priority: 'normal', // sakin öncelik seçemez — yönetim belirler
    },
  })
  return ok(complaint)
}
