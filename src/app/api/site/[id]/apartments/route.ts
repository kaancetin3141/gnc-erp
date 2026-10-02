import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

async function checkSite(siteId: string, tenantId: string) {
  const site = await db.site.findUnique({ where: { id: siteId } })
  if (!site || site.tenantId !== tenantId) return null
  return site
}

// ============================================================
// GET — daire listesi (sakin bilgisiyle)
// Query: blockId, type, q (no search)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.view')) return err('Bu modül için yetkiniz yok', 403)

  const { id } = await params
  const site = await checkSite(id, user.tenantId)
  if (!site) return err('Site bulunamadı', 404)

  const url = new URL(req.url)
  const blockId = url.searchParams.get('blockId')
  const apartmentType = url.searchParams.get('type')

  const apartments = await db.apartment.findMany({
    where: {
      siteId: id,
      ...(blockId ? { blockId } : {}),
      ...(apartmentType ? { type: apartmentType } : {}),
    },
    orderBy: [{ block: { name: 'asc' } }, { number: 'asc' }],
    include: {
      block: { select: { id: true, name: true } },
      resident: { select: { id: true, name: true, phone: true, email: true, type: true, isActive: true } },
      _count: { select: { dues: true } },
    },
  })

  return ok({ items: apartments })
}

// Gönderilen tarih string'ini DateTime'a çevir; boşsa null
function parseDate(v?: string | null): Date | null {
  if (!v || typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

interface ResidentInputPayload {
  name?: string
  phone?: string
  email?: string
  tcKimlikNo?: string
  notes?: string
  moveInDate?: string
  leaseEndDate?: string
}

// ============================================================
// POST — yeni daire ekle (site.manage)
// Body: blockId, number, floor, type, area,
//       owner?: { name, phone, email, tcKimlikNo, notes } (opsiyonel — ismi varsa mal sahibi oluştur)
//       tenant?: { name, phone, email, moveInDate, leaseEndDate, notes } (opsiyonel — ismi varsa kiracı oluştur)
// Daire oluştuktan sonra apartment.residentId önce kiracıya (varsa), yoksa mal sahibine bağlanır.
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { id } = await params
  const site = await checkSite(id, user.tenantId)
  if (!site) return err('Site bulunamadı', 404)

  const body = await req.json()
  const { blockId, number, floor, type, area, owner, tenant } = body as {
    blockId?: string
    number?: string
    floor?: number
    type?: string
    area?: number
    owner?: ResidentInputPayload
    tenant?: ResidentInputPayload
  }

  if (!blockId) return err('Blok seçimi gerekli', 400)
  if (!number || !number.trim()) return err('Daire numarası gerekli', 400)

  // Blok bu siteye mi ait?
  const block = await db.block.findUnique({ where: { id: blockId } })
  if (!block || block.siteId !== id) return err('Blok bu siteye ait değil', 400)

  // Aynı blokta aynı numara var mı?
  const existing = await db.apartment.findFirst({
    where: { blockId, number: number.trim() },
  })
  if (existing) return err('Bu blokta aynı numaraya sahip daire zaten var', 400)

  // Sakinleri hazırla (boş isim → yoksay)
  const ownerName = owner?.name?.trim()
  const tenantName = tenant?.name?.trim()

  // Email/telefon benzersizlik kontrolü
  const ownerEmail = owner?.email?.trim() || null
  const ownerPhone = owner?.phone?.trim() || null
  const tenantEmail = tenant?.email?.trim() || null
  const tenantPhone = tenant?.phone?.trim() || null

  if (ownerEmail) {
    const conflict = await db.resident.findFirst({ where: { email: ownerEmail, siteId: id } })
    if (conflict) return err('Bu e-posta adresiyle kayıtlı sakin var (mal sahibi)', 400)
  }
  if (ownerPhone) {
    const conflict = await db.resident.findFirst({ where: { phone: ownerPhone, siteId: id } })
    if (conflict) return err('Bu telefon ile kayıtlı sakin var (mal sahibi)', 400)
  }
  if (tenantEmail) {
    const conflict = await db.resident.findFirst({ where: { email: tenantEmail, siteId: id } })
    if (conflict) return err('Bu e-posta adresiyle kayıtlı sakin var (kiracı)', 400)
  }
  if (tenantPhone) {
    const conflict = await db.resident.findFirst({ where: { phone: tenantPhone, siteId: id } })
    if (conflict) return err('Bu telefon ile kayıtlı sakin var (kiracı)', 400)
  }

  // Transaction: daire + sakin(ler) + bağlama birlikte
  const result = await db.$transaction(async (tx) => {
    // 1) Daire oluştur
    const apartment = await tx.apartment.create({
      data: {
        siteId: id,
        blockId,
        number: number.trim(),
        floor: typeof floor === 'number' ? floor : null,
        type: type || 'daire',
        area: typeof area === 'number' ? area : null,
      },
      include: {
        block: { select: { id: true, name: true } },
      },
    })

    let ownerResident: { id: string; name: string; type: string } | null = null
    let tenantResident: { id: string; name: string; type: string } | null = null

    // 2) Mal sahibi oluştur (isim varsa)
    if (ownerName) {
      const created = await tx.resident.create({
        data: {
          tenantId: user.tenantId,
          siteId: id,
          name: ownerName,
          email: ownerEmail,
          phone: ownerPhone,
          type: 'mal_sahibi',
          isOwner: true,
          isActive: true,
          tcKimlikNo: owner?.tcKimlikNo?.trim() || null,
          notes: owner?.notes?.trim() || null,
        },
        select: { id: true, name: true, type: true },
      })
      ownerResident = created
    }

    // 3) Kiracı oluştur (isim varsa)
    if (tenantName) {
      const created = await tx.resident.create({
        data: {
          tenantId: user.tenantId,
          siteId: id,
          name: tenantName,
          email: tenantEmail,
          phone: tenantPhone,
          type: 'kiraci',
          isOwner: false,
          isActive: true,
          moveInDate: parseDate(tenant?.moveInDate),
          leaseEndDate: parseDate(tenant?.leaseEndDate),
          notes: tenant?.notes?.trim() || null,
        },
        select: { id: true, name: true, type: true },
      })
      tenantResident = created
    }

    // 4) Daireyi sakinle bağla: önce kiracı, yoksa mal sahibi
    const linkedResidentId = tenantResident?.id ?? ownerResident?.id ?? null
    if (linkedResidentId) {
      await tx.apartment.update({
        where: { id: apartment.id },
        data: { residentId: linkedResidentId },
      })
    }

    return { apartment, ownerResident, tenantResident, residentId: linkedResidentId }
  })

  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'create',
    entity: 'apartment',
    entityId: result.apartment.id,
    after: {
      number: result.apartment.number,
      blockId,
      siteId: id,
      owner: result.ownerResident ? { id: result.ownerResident.id, name: result.ownerResident.name } : null,
      tenant: result.tenantResident ? { id: result.tenantResident.id, name: result.tenantResident.name } : null,
    },
  })

  return ok({
    ...result.apartment,
    residentId: result.residentId,
    resident: result.tenantResident ?? result.ownerResident,
    owner: result.ownerResident,
    tenant: result.tenantResident,
  })
}
