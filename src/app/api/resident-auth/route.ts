import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// POST — sakin girişi (telefon + şifre)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { phone, password } = body

  if (!phone || !password) return err('Telefon ve şifre gerekli', 400)

  const resident = await db.resident.findFirst({
    where: { phone, password, isActive: true },
    include: {
      apartment: { include: { block: { select: { name: true, site: { select: { id: true, name: true, address: true, city: true } } } } } },
    },
  })

  if (!resident) return err('Geçersiz telefon veya şifre', 401)

  return ok({
    sessionId: resident.id,
    resident: {
      id: resident.id,
      name: resident.name,
      phone: resident.phone,
      email: resident.email,
      type: resident.type,
      apartment: resident.apartment ? {
        number: resident.apartment.number,
        block: resident.apartment.block.name,
        site: resident.apartment.block.site,
      } : null,
    },
  })
}
