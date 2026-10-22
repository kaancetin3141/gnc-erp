import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
} from '@/lib/api-utils'
import { isSuperAdmin } from '@/lib/rbac'
import { phoneSuffix, rawPhoneDigits } from '@/lib/member-auth'

// ============================================================
// ADMIN — ÜYE YÖNETİMİ (GNC Randevu uç kullanıcı üyelikleri)
// GET    ?q=&limit=&offset= — üye listesi (arama: ad/telefon, sayfalama)
//         · superadmin: platform geneli · admin: kendi tenant'ının
//           işletmelerinde randevusu olan üyeler (Member tenant'sız olduğu
//           için kapsam tenantScope deseniyle randevu → provider üzerinden)
// DELETE ?id= ya da body {id} — üye + randevularını sil
//         (memberId FK + telefon-eki eşleşmesi; /api/public/member/me
//         cascade mantığı ile aynı kural seti)
// Yetki: users.manage (admin/superadmin); kimliksiz → 401
// ============================================================

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const limitRaw = Number(url.searchParams.get('limit') ?? '50')
  const offsetRaw = Number(url.searchParams.get('offset') ?? '0')
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1), 100)
  const offset = Math.max(Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0, 0)

  // tenantScope deseni — Member modeli tenant'sız olduğundan kapsam,
  // üyenin randevu geçmişinin işletme tenant'ı üzerinden uygulanır:
  // superadmin hepsini, admin yalnız kendi tenant'ının işletmelerinde
  // randevusu olan üyeleri görür.
  const scope = isSuperAdmin(user!.role)
    ? {}
    : { appointments: { some: { provider: { tenantId: user!.tenantId } } } }

  const where: Record<string, unknown> = { ...scope }
  if (q) {
    // Telefon araması: üye telefonu 905XXXXXXXXX saklanır; kullanıcının
    // girdiği "0533 444 55 66" / "90533…" / "533…" hepsi eşleşebilsin
    const digits = q.replace(/\D/g, '')
    const phoneQ = digits.replace(/^90/, '').replace(/^0/, '')
    where.OR = [
      { name: { contains: q } },
      ...(phoneQ.length >= 3 ? [{ phone: { contains: phoneQ } }] : []),
    ]
  }

  const [members, total] = await Promise.all([
    db.member.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { appointments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.member.count({ where }),
  ])

  return ok({
    items: members.map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      email: m.email,
      isActive: m.isActive,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      appointmentCount: m._count.appointments,
    })),
    total,
    limit,
    offset,
  })
}

export async function DELETE(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'users.manage')
  if (permErr) return permErr

  const url = new URL(req.url)
  let id = url.searchParams.get('id') || ''
  if (!id) {
    const body = (await req.json().catch(() => null)) as { id?: string } | null
    id = typeof body?.id === 'string' ? body.id : ''
  }
  if (!id) return err('Silinecek üye id gerekli (?id= ya da body {id})', 400)

  const member = await db.member.findUnique({ where: { id } })
  if (!member) return err('Üye bulunamadı', 404)

  // Tenant kapsamı: admin yalnız kendi tenant'ının işletmelerinde randevusu
  // olan üyeleri yönetebilir (GET ile aynı kapsam; bilgi sızması yok — 404)
  if (!isSuperAdmin(user!.role)) {
    const inTenant = await db.appointment.findFirst({
      where: { memberId: member.id, provider: { tenantId: user!.tenantId } },
      select: { id: true },
    })
    if (!inTenant) return err('Üye bulunamadı', 404)
  }

  // Cascade — me/route.ts (KVKK hesap silme) mantığı ile aynı kural seti:
  // 1) memberId FK ile bağlanan randevular
  // 2) telefon abone numarası eşleşmesi (ham SQL aday + JS endsWith savunma)
  const suffix = phoneSuffix(member.phone)
  const apptIds = new Set<string>(
    (
      await db.appointment.findMany({
        where: { memberId: member.id },
        select: { id: true },
      })
    ).map((r) => r.id),
  )
  if (suffix.length >= 10) {
    let candidates: Array<{ id: string; customerPhone: string }>
    try {
      candidates = await db.$queryRaw<Array<{ id: string; customerPhone: string }>>`
        SELECT a.id, a."customerPhone"
        FROM "Appointment" a
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(a."customerPhone", ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') LIKE ${'%' + suffix}
        LIMIT 500
      `
    } catch {
      return err('Üye silme şu anda tamamlanamıyor — birkaç saniye sonra tekrar dene.', 502)
    }
    candidates
      .filter((r) => rawPhoneDigits(r.customerPhone).endsWith(suffix))
      .forEach((r) => apptIds.add(r.id))
  }

  try {
    await db.$transaction([
      db.appointment.deleteMany({ where: { id: { in: [...apptIds] } } }),
      db.member.delete({ where: { id: member.id } }),
    ])
  } catch {
    return err('Üye silme sırasında bir sorun oluştu — veriler değişmedi.', 500)
  }

  // Audit log (sessiz geç — silme zaten tamamlandı)
  try {
    await db.auditLog.create({
      data: {
        tenantId: user!.tenantId,
        actorId: user!.id,
        action: 'delete',
        entity: 'member',
        entityId: member.id,
        before: JSON.stringify({ name: member.name, phone: member.phone }),
        after: JSON.stringify({
          deletedBy: user!.email,
          deletedAppointments: apptIds.size,
        }),
      },
    })
  } catch {
    // sessiz geç
  }

  return ok({ ok: true, deletedMember: member.id, deletedAppointments: apptIds.size })
}
