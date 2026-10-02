import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, ok, err } from '@/lib/api-utils'

async function checkSite(siteId: string, tenantId: string) {
  const site = await db.site.findUnique({ where: { id: siteId } })
  if (!site || site.tenantId !== tenantId) return null
  return site
}

// ============================================================
// GET — sitenin blokları
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.view')) return err('Bu modül için yetkiniz yok', 403)

  const { id } = await params
  const site = await checkSite(id, user.tenantId)
  if (!site) return err('Site bulunamadı', 404)

  const blocks = await db.block.findMany({
    where: { siteId: id },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { apartments: true } },
      apartments: {
        orderBy: { number: 'asc' },
        include: {
          resident: { select: { id: true, name: true, phone: true, type: true } },
        },
      },
    },
  })

  return ok({ items: blocks })
}

// ============================================================
// POST — yeni blok ekle (site.manage)
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { id } = await params
  const site = await checkSite(id, user.tenantId)
  if (!site) return err('Site bulunamadı', 404)

  const body = await req.json()
  const { name, floors } = body as { name?: string; floors?: number }

  if (!name || !name.trim()) return err('Blok adı gerekli', 400)

  const block = await db.block.create({
    data: {
      siteId: id,
      name: name.trim(),
      floors: typeof floors === 'number' && floors > 0 ? floors : 5,
    },
  })

  return ok(block)
}
