import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — tüm aktif sağlayıcıları listele
// Query: type?, city?
// Bu endpoint tüm tenant'lardaki aktif sağlayıcıları döner.
// Gerçek uygulamada subdomain/alan adı ile tenant filtrelenir.
// Demo için: ilk tenant'ı varsayılan olarak kullanırız (query tenantId ile değiştirilebilir).
// ============================================================
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || undefined
  const city = searchParams.get('city') || undefined
  const tenantId = searchParams.get('tenantId') || undefined

  const where: {
    isActive: boolean
    type?: string
    city?: string
    tenantId?: string
  } = { isActive: true }
  if (type) where.type = type
  if (city) where.city = city
  if (tenantId) where.tenantId = tenantId

  const providers = await db.serviceProvider.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      address: true,
      city: true,
      district: true,
      phone: true,
      email: true,
      photo: true,
      workingHours: true,
      tenantId: true,
    },
  })

  return ok({ items: providers })
}
