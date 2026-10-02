import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

const VALID_STATIONS = ['bar', 'kitchen', 'dessert']

// ============================================================
// GET — kafe menüsü (kategoriler + ürünler)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.view')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const categories = await db.menuCategory.findMany({
    where: { cafeId: id },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  return ok({ items: categories })
}

// ============================================================
// POST — kategori veya menü kalemi oluştur
// Body: { type: 'category'|'item', ... }
//   category: { name, icon?, sortOrder? }
//   item: { categoryId, name, description?, price, photo?, prepTime?, station?, recipe?, sortOrder? }
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'cafe.manage')
  if (permErr) return permErr

  const { id } = await params
  const cafe = await db.cafe.findUnique({ where: { id } })
  if (!cafe || cafe.tenantId !== user!.tenantId) return err('Kafe bulunamadı', 404)

  const body = await req.json()
  const { type } = body as { type?: 'category' | 'item' }
  if (type !== 'category' && type !== 'item') {
    return err("type 'category' veya 'item' olmalı", 400)
  }

  if (type === 'category') {
    const { name, icon, sortOrder } = body as {
      name?: string
      icon?: string
      sortOrder?: number
    }
    if (!name || !name.trim()) return err('Kategori adı gerekli', 400)

    const category = await db.menuCategory.create({
      data: {
        cafeId: id,
        name: name.trim(),
        icon: icon?.trim() || null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      },
    })

    await writeAuditLog({
      tenantId: user!.tenantId,
      actorId: user!.id,
      action: 'create',
      entity: 'menu_category',
      entityId: category.id,
      after: { name: category.name },
    })

    return ok(category)
  }

  // type === 'item'
  const {
    categoryId, name, description, price, photo, prepTime, station, recipe, sortOrder,
  } = body as {
    categoryId?: string
    name?: string
    description?: string
    price?: number
    photo?: string
    prepTime?: number
    station?: string
    recipe?: string
    sortOrder?: number
  }

  if (!categoryId) return err('categoryId gerekli', 400)
  if (!name || !name.trim()) return err('Ürün adı gerekli', 400)
  if (typeof price !== 'number' || price < 0) return err('Geçerli fiyat gerekli', 400)
  if (station && !VALID_STATIONS.includes(station)) return err('Geçersiz istasyon', 400)

  // Kategori bu kafeye mi ait?
  const category = await db.menuCategory.findUnique({ where: { id: categoryId } })
  if (!category || category.cafeId !== id) return err('Kategori bulunamadı', 404)

  const item = await db.menuItem.create({
    data: {
      categoryId,
      name: name.trim(),
      description: description?.trim() || null,
      price,
      photo: photo || null,
      prepTime: typeof prepTime === 'number' && prepTime >= 0 ? prepTime : 10,
      station: station ?? 'kitchen',
      recipe: recipe?.trim() || null,
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      isAvailable: true,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'menu_item',
    entityId: item.id,
    after: { name: item.name, price: item.price },
  })

  return ok(item)
}
