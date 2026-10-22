import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  getSession, requirePermission, ok, err,
} from '@/lib/api-utils'
import { isSuperAdmin } from '@/lib/rbac'

// ============================================================
// GET /api/reports/summary — Randevu özet metrikleri (grafik kartları)
// · days: son N gün penceresi (default 30, max 90)
// · tenantId: yalnızca SUPERADMIN opsiyonel filtre; diğer roller kendi tenantı
// · Hafif SQL: gün gruplama raw (SQLite strftime/unixepoch, index [providerId, date]),
//   durum/hizmet/personel Prisma groupBy — N=90'da bile tek tur aggregation
// · Not: Appointment'ta tenantId yok — provider üzerinden tenant kapsanır
// ============================================================

// Telefonu Member.phone formatına normalize et (905xxxxxxxxx)
function toMemberPhone(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('90') && d.length === 12) return d // 905xx…
  if (d.startsWith('0') && d.length === 11) return '90' + d.slice(1) // 0555… → 90555…
  if (d.length === 10) return '90' + d
  return null
}

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'reports.view')
  if (permErr) return permErr

  // PRIVACY-TEMPLATES (#3): depo rolü satış/müşteri raporlarını GÖREMEZ (/api/reports ile aynı)
  if (user!.role === 'stock') {
    return err('Depo rolü için raporlara erişim kısıtlıdır', 403)
  }

  const url = new URL(req.url)
  const daysRaw = parseInt(url.searchParams.get('days') || '30', 10)
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30

  // Kapsam: superadmin platform geneli (+opsiyonel tenantId filtresi), diğerleri kendi tenantı
  const isSA = isSuperAdmin(user!.role)
  const requestedTenantId = (url.searchParams.get('tenantId') || '').trim()
  if (requestedTenantId && !isSA) {
    return err('tenantId filtresi yalnızca Program Admini tarafından kullanılabilir', 403)
  }
  const scopeTenantId = isSA
    ? (requestedTenantId || null)
    : user!.tenantId

  // UTC gün sınırları — strftime bucket'ları ve sıfır doldurma ile aynı referans
  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const rangeStart = new Date(todayUtc.getTime() - (days - 1) * 86_400_000)
  const rangeStartMs = rangeStart.getTime()

  // Kapsamdaki işletmeler (provider → tenant bağlantısı)
  const providers = await db.serviceProvider.findMany({
    where: scopeTenantId ? { tenantId: scopeTenantId } : {},
    select: { id: true },
  })
  const providerIds = providers.map((p) => p.id)

  if (providerIds.length === 0) {
    // Kapsamda işletme yok — boş ama geçerli özet
    const totalMembers = isSA && !requestedTenantId
      ? await db.member.count()
      : 0
    return ok({
      days,
      scope: { platformWide: isSA && !requestedTenantId, tenantId: scopeTenantId },
      appointmentsByDay: [],
      statusDistribution: { onaylandi: 0, bekliyor: 0, iptal: 0, tamamlandi: 0, reddedildi: 0, gelmedi: 0 },
      topServices: [],
      topStaff: [],
      totalMembers,
      totalAppointments: 0,
      upcomingCount: 0,
    })
  }

  const providerIn = Prisma.join(providerIds)
  const activeStatusFilter = { notIn: ['iptal', 'reddedildi'] } // "talep edilen" = iptal/reddedildi hariç

  const [byDayRows, statusGroups, serviceGroups, staffGroups, totalAppointments, upcomingCount, memberPhones, apptPhones] = await Promise.all([
    // Gün bazlı trend — raw SQL (SQLite DateTime tam sayı ms saklar → unixepoch)
    db.$queryRaw<Array<{ day: string; total: bigint; onaylandi: bigint; iptal: bigint }>>(
      Prisma.sql`SELECT strftime('%Y-%m-%d', "date" / 1000, 'unixepoch') as day,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'onaylandi' THEN 1 ELSE 0 END) as onaylandi,
          SUM(CASE WHEN status = 'iptal' THEN 1 ELSE 0 END) as iptal
        FROM "Appointment"
        WHERE "providerId" IN (${providerIn}) AND "date" >= ${rangeStartMs}
        GROUP BY day
        ORDER BY day ASC`
    ),
    // Durum dağılımı (pencere içi) — DB'deki gerçek status değerleri:
    // beklemede | onaylandi | reddedildi | tamamlandi | iptal | gelmedi
    db.appointment.groupBy({
      by: ['status'],
      where: { providerId: { in: providerIds }, date: { gte: rangeStart } },
      _count: { _all: true },
    }),
    // En çok talep edilen hizmetler (pencere içi, iptal/reddedildi hariç)
    db.appointment.groupBy({
      by: ['serviceId'],
      where: {
        providerId: { in: providerIds }, date: { gte: rangeStart },
        serviceId: { not: null }, status: activeStatusFilter,
      },
      _count: { _all: true },
    }),
    // En aktif personel (pencere içi, iptal/reddedildi hariç)
    db.appointment.groupBy({
      by: ['staffId'],
      where: {
        providerId: { in: providerIds }, date: { gte: rangeStart },
        staffId: { not: null }, status: activeStatusFilter,
      },
      _count: { _all: true },
    }),
    // Toplam randevu (kapsam geneli, tüm zamanlar)
    db.appointment.count({ where: { providerId: { in: providerIds } } }),
    // Yaklaşan: bugün + gelecek, iptal/reddedildi hariç
    db.appointment.count({
      where: { providerId: { in: providerIds }, date: { gte: now }, status: activeStatusFilter },
    }),
    // Üyeler — platform geneli: toplam üye sayısı; tenant kapsamı: bu işletmelerde
    // randevusu olan üyeler (telefon eşleşmesi; Member tenant-bağlantısızdır)
    isSA && !requestedTenantId
      ? db.member.count()
      : db.member.findMany({ select: { phone: true } }),
    isSA && !requestedTenantId
      ? Promise.resolve([] as Array<{ customerPhone: string }>)
      : db.appointment.findMany({
          where: { providerId: { in: providerIds } },
          select: { customerPhone: true },
          distinct: ['customerPhone'],
        }),
  ])

  // appointmentsByDay — boş günler 0 ile doldurulur
  const byDayMap = new Map<string, { total: number; onaylandi: number; iptal: number }>()
  for (const r of byDayRows) {
    if (!r.day) continue
    byDayMap.set(r.day, {
      total: Number(r.total),
      onaylandi: Number(r.onaylandi),
      iptal: Number(r.iptal),
    })
  }
  const appointmentsByDay: Array<{ date: string; total: number; onaylandi: number; iptal: number }> = []
  for (let i = 0; i < days; i++) {
    const key = new Date(rangeStartMs + i * 86_400_000).toISOString().slice(0, 10)
    const hit = byDayMap.get(key)
    appointmentsByDay.push({
      date: key,
      total: hit?.total ?? 0,
      onaylandi: hit?.onaylandi ?? 0,
      iptal: hit?.iptal ?? 0,
    })
  }

  // statusDistribution — DB değerleri → sözleşme anahtarları (beklemede → bekliyor)
  const dist = { onaylandi: 0, bekliyor: 0, iptal: 0, tamamlandi: 0, reddedildi: 0, gelmedi: 0 }
  for (const g of statusGroups) {
    const n = Number(g._count?._all ?? 0)
    if (g.status === 'onaylandi') dist.onaylandi = n
    else if (g.status === 'beklemede') dist.bekliyor = n
    else if (g.status === 'iptal') dist.iptal = n
    else if (g.status === 'tamamlandi') dist.tamamlandi = n
    else if (g.status === 'reddedildi') dist.reddedildi = n
    else if (g.status === 'gelmedi') dist.gelmedi = n
  }

  // Top 5 listeler — isim çözümleme (yalnız ilk 5 id için tek sorgu)
  const serviceRanked = serviceGroups
    .map((g) => ({ id: g.serviceId as string, count: g._count._all }))
    .filter((g) => g.id)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const staffRanked = staffGroups
    .map((g) => ({ id: g.staffId as string, count: g._count._all }))
    .filter((g) => g.id)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const [services, staff] = await Promise.all([
    serviceRanked.length > 0
      ? db.service.findMany({ where: { id: { in: serviceRanked.map((s) => s.id) } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    staffRanked.length > 0
      ? db.staff.findMany({ where: { id: { in: staffRanked.map((s) => s.id) } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ])
  const serviceName = new Map(services.map((s) => [s.id, s.name]))
  const staffName = new Map(staff.map((s) => [s.id, s.name]))
  const topServices = serviceRanked.map((s) => ({ name: serviceName.get(s.id) ?? 'Bilinmiyor', count: s.count }))
  const topStaff = staffRanked.map((s) => ({ name: staffName.get(s.id) ?? 'Bilinmiyor', count: s.count }))

  // totalMembers — tenant kapsamında: randevu telefonlarıyla eşleşen üyeler
  let totalMembers: number
  if (isSA && !requestedTenantId) {
    totalMembers = memberPhones as unknown as number
  } else {
    const memberSet = new Set(
      (memberPhones as unknown as Array<{ phone: string }>)
        .map((m) => toMemberPhone(m.phone))
        .filter((p): p is string => Boolean(p)),
    )
    totalMembers = 0
    for (const ap of apptPhones as unknown as Array<{ customerPhone: string }>) {
      const norm = toMemberPhone(ap.customerPhone)
      if (norm && memberSet.has(norm)) {
        totalMembers += 1
        memberSet.delete(norm) // tekil sayım
      }
    }
  }

  return ok({
    days,
    scope: { platformWide: isSA && !requestedTenantId, tenantId: scopeTenantId },
    appointmentsByDay,
    statusDistribution: dist,
    topServices,
    topStaff,
    totalMembers,
    totalAppointments,
    upcomingCount,
  })
}
