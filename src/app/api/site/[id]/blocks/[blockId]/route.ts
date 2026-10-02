import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, ok, err } from '@/lib/api-utils'

async function checkBlockForUser(blockId: string, tenantId: string) {
  const block = await db.block.findUnique({
    where: { id: blockId },
    include: { site: true },
  })
  if (!block || block.site.tenantId !== tenantId) return null
  return block
}

// ============================================================
// PATCH — blok güncelle (site.manage)
// ============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { blockId } = await params
  const block = await checkBlockForUser(blockId, user.tenantId)
  if (!block) return err('Blok bulunamadı', 404)

  const body = await req.json()
  const { name, floors } = body as { name?: string; floors?: number }

  const updated = await db.block.update({
    where: { id: blockId },
    data: {
      ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
      ...(typeof floors === 'number' && floors > 0 ? { floors } : {}),
    },
  })

  return ok(updated)
}

// ============================================================
// DELETE — blok sil (site.manage)
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { blockId } = await params
  const block = await checkBlockForUser(blockId, user.tenantId)
  if (!block) return err('Blok bulunamadı', 404)

  await db.block.delete({ where: { id: blockId } })
  return ok({ success: true })
}
