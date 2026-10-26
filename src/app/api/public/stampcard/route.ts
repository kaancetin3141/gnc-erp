import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { bearerToken, verifyToken } from '@/lib/member-auth'

// ============================================================
// PUBLIC (Bearer token) — DAMGA KARTLARIM
// GET /api/public/stampcard
// Üyenin tüm damga kartları: yalnız AKTİF StampCardSetting'i
// olan işletmelerin kartları döner (ayarı olmayan/pasif işletme
// damga programına dahil değildir).
// Returns: { items: [{ id, providerSlug, providerName, stamps,
//           requiredStamps, rewardDescription, redeemedCount,
//           kalanDamga, lastStampAt }] }
// (POST yok — damga admin/randevu tarafında basılır)
// ============================================================

export async function GET(req: NextRequest) {
  const token = bearerToken(req)
  const memberId = token ? verifyToken(token) : null
  if (!memberId) return err('Oturum geçersiz veya süresi dolmuş — tekrar giriş yap.', 401)

  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { id: true, isActive: true },
  })
  if (!member || !member.isActive) return err('Üyelik bulunamadı', 401)

  const cards = await db.stampCard.findMany({
    where: {
      memberId: member.id,
      provider: { isActive: true, stampCardSetting: { isActive: true } },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      stamps: true,
      redeemedCount: true,
      lastStampAt: true,
      updatedAt: true,
      provider: {
        select: {
          name: true,
          slug: true,
          stampCardSetting: { select: { requiredStamps: true, rewardDescription: true } },
        },
      },
    },
  })

  const items = cards
    // Çift güvenlik: ayar boş geldiyse (silinmiş/pasif) kartı listeleme
    .filter((c) => !!c.provider.stampCardSetting)
    .map((c) => {
      const s = c.provider.stampCardSetting!
      return {
        id: c.id,
        providerSlug: c.provider.slug,
        providerName: c.provider.name,
        stamps: c.stamps,
        requiredStamps: s.requiredStamps,
        rewardDescription: s.rewardDescription,
        redeemedCount: c.redeemedCount,
        kalanDamga: Math.max(s.requiredStamps - c.stamps, 0),
        lastStampAt: c.lastStampAt,
      }
    })

  return ok({ items })
}
