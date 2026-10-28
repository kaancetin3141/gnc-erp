import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// GET — sakinin aidatları
export async function GET(req: NextRequest) {
  const residentId = req.headers.get('x-resident-session')
  if (!residentId) return err('Oturum açmanız gerekli', 401)

  const resident = await db.resident.findUnique({
    where: { id: residentId },
    select: { id: true, siteId: true, isActive: true, apartment: { select: { id: true } } },
  })
  if (!resident) return err('Sakin bulunamadı', 404)
  // Devre dışı bırakılan sakin eski oturum token'ıyla erişemez
  if (!resident.isActive) return err('Hesabınız devre dışı — yönetimle iletişime geçin', 403)

  // Daire FK'sı Apartment tarafındadır (Apartment.residentId) → back-relation ile bulunur
  const dues = await db.dues.findMany({
    where: {
      OR: [
        { residentId: resident.id },
        ...(resident.apartment ? [{ apartmentId: resident.apartment.id }] : []),
      ],
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  // BORÇ HESABI (P2): 'gecikti' durumundaki aidatlar da BORÇTUR ve gecikme
  // zammı (lateFee) borca eklenir. Önceki hesap yalnız 'odenmedi' sayıyordu —
  // tüm aidatları gecikmiş bir sakin "Borç yok ✓" görüyordu.
  const totalDebt = dues
    .filter((d) => d.status === 'odenmedi' || d.status === 'gecikti')
    .reduce((s, d) => s + d.amount + (d.lateFee || 0) - (d.paidAmount || 0), 0)
  const totalPaid = dues.filter((d) => d.status === 'odendi').reduce((s, d) => s + (d.paidAmount || d.amount), 0)

  return ok({ items: dues, stats: { total: dues.length, totalDebt, totalPaid } })
}
