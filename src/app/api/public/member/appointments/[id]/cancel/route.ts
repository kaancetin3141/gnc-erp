import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { bearerToken, verifyToken, phoneSuffix, rawPhoneDigits } from '@/lib/member-auth'

// ============================================================
// PUBLIC (Bearer token) — RANDEVU İPTALİ (üye kendi randevusunu iptal eder)
// POST /api/public/member/appointments/[id]/cancel
// Kurallar:
// · Randevu üyeye ait olmalı — memberId FK bağlantısı YA DA telefon abone
//   numarası eşleşmesi (geriye dönük uyumluluk: misafirken alınanlar)
// · Sadece 'beklemede' ve 'onaylandi' durumundaki randevular iptal edilebilir
// · Geçmiş randevular iptal edilemez
// ============================================================

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = bearerToken(req)
  const memberId = token ? verifyToken(token) : null
  if (!memberId) return err('Oturum geçersiz veya süresi dolmuş — tekrar giriş yap.', 401)

  const member = await db.member.findUnique({ where: { id: memberId } })
  if (!member || !member.isActive) return err('Üyelik bulunamadı', 401)

  const { id } = await params
  const appointment = await db.appointment.findUnique({
    where: { id },
    include: { provider: { select: { name: true, slug: true, tenantId: true } } },
  })
  if (!appointment) return err('Randevu bulunamadı', 404)

  // Başka birinin randevusunu iptal etmeye çalışıyorsa sessizce 404 (bilgi sızması yok).
  // Sahiplik: memberId FK bağlantısı YA DA telefon abone numarası eşleşmesi.
  const suffix = phoneSuffix(member.phone)
  const owns = appointment.memberId === member.id ||
    (suffix.length >= 10 && rawPhoneDigits(appointment.customerPhone).endsWith(suffix))
  if (!owns) {
    return err('Randevu bulunamadı', 404)
  }

  if (appointment.status === 'iptal') return err('Bu randevu zaten iptal edilmiş', 400)
  if (appointment.status === 'tamamlandi' || appointment.status === 'gelmedi') {
    return err('Tamamlanmış randevular iptal edilemez', 400)
  }
  if (appointment.status !== 'beklemede' && appointment.status !== 'onaylandi') {
    return err('Bu randevu iptal edilemez', 400)
  }
  if (appointment.date.getTime() < Date.now()) {
    return err('Geçmiş randevular iptal edilemez', 400)
  }

  await db.appointment.update({
    where: { id: appointment.id },
    data: { status: 'iptal' },
  })

  try {
    await db.auditLog.create({
      data: {
        tenantId: appointment.provider.tenantId,
        actorId: null,
        action: 'member_cancel',
        entity: 'appointment',
        entityId: appointment.id,
        after: JSON.stringify({
          memberPhone: member.phone,
          providerSlug: appointment.provider.slug,
          status: 'iptal',
        }),
      },
    })
  } catch {
    // sessiz geç
  }

  return ok({ id: appointment.id, status: 'iptal' })
}
