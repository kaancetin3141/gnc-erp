import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err } from '@/lib/api-utils'
import { bearerToken, verifyToken } from '@/lib/member-auth'

// ============================================================
// PUBLIC (Bearer token) — ÜYE PROFİLİ
// Authorization: Bearer <token>
// Returns: { member: { id, name, phone, email, createdAt } }
// ============================================================

export async function GET(req: NextRequest) {
  const token = bearerToken(req)
  const memberId = token ? verifyToken(token) : null
  if (!memberId) return err('Oturum geçersiz veya süresi dolmuş — tekrar giriş yap.', 401)

  const member = await db.member.findUnique({ where: { id: memberId } })
  if (!member || !member.isActive) return err('Üyelik bulunamadı', 401)

  return ok({
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      email: member.email,
      createdAt: member.createdAt,
    },
  })
}
