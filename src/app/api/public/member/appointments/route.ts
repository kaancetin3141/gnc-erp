import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { bearerToken, verifyToken, phoneSuffix, rawPhoneDigits } from '@/lib/member-auth'

// ============================================================
// PUBLIC (Bearer token) — RANDEVULARIM
// Eşleştirme iki katman:
// 1) memberId FK — üye girişliyken oluşturulan randevular kalıcı bağlıdır
// 2) telefon abone numarası (son 10 hane) — geriye dönük uyumluluk
//    (misafirken alınmış, tüm biçimlerde: 0555…, +90555…, 90555…)
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

  // Telefon eşleşmesi (geriye dönük): ayraç temizlenmiş ham telefon,
  // abone numarasıyla bitmelidir. (SQLite REPLACE zinciri: boşluk, tire,
  // parantez, nokta, +)
  let phoneIds: string[] = []
  if (suffix.length >= 10) {
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
      phoneIds = rows.map((r) => r.id)
    } catch {
      return err('Randevular şu anda alınamıyor — birkaç saniye sonra tekrar dene.', 502)
    }
  }

  const include = {
    provider: { select: { name: true, slug: true, city: true, district: true, type: true } },
    service: { select: { name: true, currency: true } },
    staff: { select: { name: true, title: true } },
  }
  const baseWhere = {
    status: { notIn: ['iptal', 'reddedildi'] as string[] },
    provider: { isActive: true },
  }

  // 1) FK bağlantısı · 2) telefon eki eşleşmesi — birleştir, tekilleştir
  const [byMember, byPhone] = await Promise.all([
    db.appointment.findMany({
      where: { ...baseWhere, memberId: member.id },
      orderBy: { date: 'desc' },
      take: 80,
      include,
    }),
    phoneIds.length
      ? db.appointment.findMany({
          where: { ...baseWhere, id: { in: phoneIds } },
          orderBy: { date: 'desc' },
          take: 80,
          include,
        })
      : Promise.resolve([]),
  ])

  const seen = new Set<string>()
  const items = [...byMember, ...byPhone]
    .filter((a) => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      // Son savunma katmanı: FK eşleşmesi kesin; telefon eşleşmesinde ham
      // telefon rakamları gerçekten abone numarasıyla bitmeli
      return a.memberId === member.id || rawPhoneDigits(a.customerPhone).endsWith(suffix)
    })
    .sort((x, y) => y.date.getTime() - x.date.getTime())
    .slice(0, 80)
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
