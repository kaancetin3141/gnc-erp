import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// GET — sakinin aidatları
export async function GET(req: NextRequest) {
  const residentId = req.headers.get('x-resident-session')
  if (!residentId) return err('Oturum açmanız gerekli', 401)

  const resident = await db.resident.findUnique({
    where: { id: residentId },
    select: { id: true, siteId: true, apartmentId: true },
  })
  if (!resident) return err('Sakin bulunamadı', 404)

  const dues = await db.dues.findMany({
    where: {
      OR: [
        { residentId: resident.id },
        { apartmentId: resident.apartmentId || '' },
      ],
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const totalDebt = dues.filter(d => d.status === 'odenmedi').reduce((s, d) => s + d.amount, 0)
  const totalPaid = dues.filter(d => d.status === 'odendi').reduce((s, d) => s + (d.paidAmount || d.amount), 0)

  return ok({ items: dues, stats: { total: dues.length, totalDebt, totalPaid } })
}
