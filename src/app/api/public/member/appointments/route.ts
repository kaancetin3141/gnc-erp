import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { bearerToken, verifyToken, phoneSuffix, rawPhoneDigits } from '@/lib/member-auth'

// ============================================================
// PUBLIC (Bearer token) — RANDEVULARIM
// Üyenin telefonuyla (tüm biçimlerde: 0555…, +90555…, 90555…) alınmış
// tüm işletmelerdeki randevuları döner. Eşleştirme abone numarası
// (son 10 hane) üzerinden yapılır; ayraçlar/ülke kodu fark etmez.
// Returns: { items: [{ id, providerName, providerSlug, serviceName,
//           staffName, status, date, endTime, price, currency, code }] }
// ============================================================

export async function GET(req: NextRequest) {
  const token = bearerToken(req)
  const memberId = token ? verifyToken(token) : null
  if (!memberId) return err('Oturum geçersiz veya süresi dolmuş — tekrar giriş yap.', 401)

  const member = await db.member.findUnique({ where: { id: memberId } })
  if (!member || !member.isActive) return err('Üyelik bulunamadı', 401)

  const suffix = phoneSuffix(member.phone)
  if (suffix.length < 10) return ok({ items: [] })

  // Telefon eşleşmesi: ayraç temizlenmiş ham telefon, abone numarasıyla bitmelidir.
  // (SQLite REPLACE zinciri: boşluk, tire, parantez, nokta, +)
  let ids: string[]
  try {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT a.id
      FROM "Appointment" a
      JOIN "ServiceProvider" p ON p.id = a."providerId" AND p."isActive" = 1
      WHERE a.status NOT IN ('iptal', 'reddedildi')
        AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(a."customerPhone", ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') LIKE ${'%' + suffix}
      ORDER BY a."date" DESC
      LIMIT 80
    `
    ids = rows.map((r) => r.id)
  } catch {
    return err('Randevular şu anda alınamıyor — birkaç saniye sonra tekrar dene.', 502)
  }
  if (ids.length === 0) return ok({ items: [] })

  const appts = await db.appointment.findMany({
    where: { id: { in: ids } },
    orderBy: { date: 'desc' },
    include: {
      provider: { select: { name: true, slug: true, city: true, district: true, type: true } },
      service: { select: { name: true, currency: true } },
      staff: { select: { name: true, title: true } },
    },
  })

  // Son savunma katmanı: ham telefon rakamları gerçekten abone numarasıyla bitmeli
  const items = appts
    .filter((a) => rawPhoneDigits(a.customerPhone).endsWith(suffix))
    .map((a) => ({
      id: a.id,
      code: a.id.slice(-8).toUpperCase(),
      providerName: a.provider.name,
      providerSlug: a.provider.slug,
      providerCity: a.provider.city,
      serviceId: a.serviceId,
      serviceName: a.service?.name ?? null,
      currency: a.service?.currency ?? 'TRY',
      staffName: a.staff?.name ?? null,
      status: a.status,
      date: a.date,
      endTime: a.endTime,
      price: a.price,
      customerName: a.customerName,
    }))

  return ok({ items })
}
