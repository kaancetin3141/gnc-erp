import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok } from '@/lib/api-utils'

// GET /api/messages/users — mesajlaşma için aynı şirketteki (tenant) aktif kullanıcıları listele
// users.manage yetkisi GEREKMEZ — sadece login yeterli
// Sadece aynı tenant'taki kullanıcıları döndürür
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''

  const where: Record<string, unknown> = {
    tenantId: user!.tenantId,
    status: 'active',
    id: { not: user!.id }, // kendisi hariç
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { title: { contains: search } },
    ]
  }

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      avatarUrl: true,
      phone: true,
    },
    orderBy: { name: 'asc' },
    take: 200,
  })

  return ok({ items: users, total: users.length })
}
