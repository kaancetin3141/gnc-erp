import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { isSuperAdmin, hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — DAMGA KARTI (tek kart)
// PATCH { action: "add_stamp" | "redeem" | "reset" }
//   · add_stamp → stamps+1; requiredStamps'e ulaşırsa kart
//     otomatik sıfırlanır + redeemedCount+1 → yanıt "ödül kazanıldı"
//   · redeem   → manuel ödül teslimi: redeemedCount+1 + stamps=0
//   · reset    → stamps=0 (ödül sayısı korunur)
// Yetki: appointments.view VEYA users.manage · kapsam:
//   superadmin tümü, admin kendi tenant'ının işletmeleri
//   (provider.tenantId) — aksi halde 404 (bilgi sızması yok).
// ============================================================

const PERM_A = 'appointments.view'
const PERM_B = 'users.manage'

async function getScopedCard(id: string, user: { role: string; tenantId: string }) {
  const card = await db.stampCard.findUnique({
    where: { id },
    include: {
      provider: {
        select: {
          id: true, name: true, tenantId: true,
          stampCardSetting: { select: { requiredStamps: true, rewardDescription: true, isActive: true } },
        },
      },
      member: { select: { id: true, name: true, phone: true } },
    },
  })
  if (!card) return null
  if (!isSuperAdmin(user.role) && card.provider.tenantId !== user.tenantId) {
    // Bilgi sızması olmasın — var ama yetki dışıysa da 404
    return null
  }
  return card
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, PERM_A) && !hasPermission(user!, PERM_B)) {
    return err('Bu işlem için yetkiniz yok', 403)
  }
  const { id } = await params

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null
  if (!body) return err('İstek gövdesi okunamadı.', 400)
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  if (action !== 'add_stamp' && action !== 'redeem' && action !== 'reset') {
    return err('action yalnız "add_stamp", "redeem" ya da "reset" olabilir.', 400)
  }

  const card = await getScopedCard(id, user!)
  if (!card) return err('Damga kartı bulunamadı', 404)

  const required = card.provider.stampCardSetting?.requiredStamps ?? 10
  const now = new Date()

  let updated: { id: string; stamps: number; redeemedCount: number; lastStampAt: Date | null }
  let rewardWon = false

  if (action === 'add_stamp') {
    const next = card.stamps + 1
    rewardWon = next >= required
    updated = await db.stampCard.update({
      where: { id: card.id },
      data: {
        // requiredStamps'e ulaşırsa kart sıfırlanır + ödül sayacı artar
        stamps: rewardWon ? 0 : next,
        redeemedCount: rewardWon ? { increment: 1 } : undefined,
        lastStampAt: now,
      },
      select: { id: true, stamps: true, redeemedCount: true, lastStampAt: true },
    })
  } else if (action === 'redeem') {
    // Manuel ödül teslimi — damgaları tamamlanıp teslim edilmiş say
    updated = await db.stampCard.update({
      where: { id: card.id },
      data: {
        stamps: 0,
        redeemedCount: { increment: 1 },
      },
      select: { id: true, stamps: true, redeemedCount: true, lastStampAt: true },
    })
  } else {
    // reset — damgaları sıfırla, kazanılan ödül sayısı korunur
    updated = await db.stampCard.update({
      where: { id: card.id },
      data: { stamps: 0 },
      select: { id: true, stamps: true, redeemedCount: true, lastStampAt: true },
    })
  }

  try {
    await writeAuditLog({
      tenantId: card.provider.tenantId,
      actorId: user!.id,
      action: 'update',
      entity: 'stampcard',
      entityId: card.id,
      before: JSON.stringify({
        member: card.member.name,
        stamps: card.stamps,
        redeemedCount: card.redeemedCount,
      }),
      after: JSON.stringify({
        action,
        stamps: updated.stamps,
        redeemedCount: updated.redeemedCount,
        rewardWon,
      }),
    })
  } catch {
    // audit başarısızlığı işlemi bozmasın
  }

  return ok({
    ok: true,
    card: updated,
    rewardWon,
    requiredStamps: required,
    rewardDescription: card.provider.stampCardSetting?.rewardDescription ?? null,
    message: rewardWon
      ? `🎉 Ödül kazanıldı! ${card.member.name} artık "${card.provider.stampCardSetting?.rewardDescription ?? 'ödül'}" kazanmaya hak kazandı — kart sıfırlandı.`
      : action === 'redeem'
        ? `Ödül teslim edildi — kart sıfırlandı.`
        : action === 'reset'
          ? 'Kart sıfırlandı.'
          : 'Damga eklendi.',
  })
}
