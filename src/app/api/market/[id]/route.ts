import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

async function getMarketForUser(marketId: string, tenantId: string) {
  const market = await db.market.findUnique({ where: { id: marketId } })
  if (!market || market.tenantId !== tenantId) return null
  return market
}

// ============================================================
// GET — tekil market (özet bilgileriyle)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requirePermission(user, 'market.view')
  if (authErr) return authErr

  const { id } = await params
  const market = await getMarketForUser(id, user!.tenantId)
  if (!market) return err('Market bulunamadı', 404)

  const detailed = await db.market.findUnique({
    where: { id },
    include: {
      _count: {
        select: { shelves: true, posShifts: true, sales: true, barcodes: true, purchases: true, stockCounts: true },
      },
    },
  })

  return ok(detailed)
}

// ============================================================
// PATCH — market bilgileri (market.manage)
// ============================================================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.manage')
  if (permErr) return permErr

  const { id } = await params
  const market = await getMarketForUser(id, user!.tenantId)
  if (!market) return err('Market bulunamadı', 404)

  const body = await req.json()
  const { name, address, phone, isActive } = body as {
    name?: string
    address?: string
    phone?: string
    isActive?: boolean
  }

  const updated = await db.market.update({
    where: { id },
    data: {
      ...(name !== undefined && name.trim() ? { name: name.trim() } : {}),
      ...(address !== undefined ? { address: address?.trim() || null } : {}),
      ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'market',
    entityId: id,
    before: { name: market.name, address: market.address, phone: market.phone, isActive: market.isActive },
    after: { name: updated.name, address: updated.address, phone: updated.phone, isActive: updated.isActive },
  })

  return ok(updated)
}

// ============================================================
// DELETE — market sil (market.manage)
// ============================================================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'market.manage')
  if (permErr) return permErr

  const { id } = await params
  const market = await getMarketForUser(id, user!.tenantId)
  if (!market) return err('Market bulunamadı', 404)

  await db.market.delete({ where: { id } })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'market',
    entityId: id,
    before: { name: market.name },
  })

  return ok({ success: true })
}
