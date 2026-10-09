import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — sadakat hesapları (puan sıralı)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''

  const where: Record<string, unknown> = user!.role === 'superadmin' ? {} : { tenantId: user!.tenantId }
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { phone: { contains: q } },
    ]
  }

  const accounts = await db.loyaltyAccount.findMany({
    where,
    include: { _count: { select: { transactions: true } } },
    orderBy: { points: 'desc' },
    take: 300,
  })

  const totalPoints = accounts.reduce((s, a) => s + a.points, 0)
  return ok({ items: accounts, totalPoints })
}

// POST — manuel hesap aç (duzeltme puanıyla)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'market.pos')
  if (permErr) return permErr

  const body = await req.json().catch(() => null)
  if (!body?.name?.trim()) return err('Müşteri adı zorunludur')
  const name = String(body.name).trim()

  const existing = await db.loyaltyAccount.findFirst({
    where: { tenantId: user!.tenantId, name },
  })
  if (existing) return err('Bu isimde bir sadakat hesabı zaten var', 409)

  const account = await db.loyaltyAccount.create({
    data: {
      tenantId: user!.tenantId,
      name,
      phone: body.phone?.trim() || null,
      points: 0,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'loyalty_account',
    entityId: account.id,
    after: { name },
  })

  return ok(account, 201)
}
