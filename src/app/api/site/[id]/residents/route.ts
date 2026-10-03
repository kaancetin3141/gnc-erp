import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// GÜVENLİK (sızma testi bulgusu): eski sha256 hash yerine bcrypt (salted) kullanılır.
// Yeni şifreler passwordHash alanına yazılır; legacy password alanı null'a çekilir.

async function checkSite(siteId: string, tenantId: string) {
  const site = await db.site.findUnique({ where: { id: siteId } })
  if (!site || site.tenantId !== tenantId) return null
  return site
}

// ============================================================
// GET — site sakinleri listesi
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.view')) return err('Bu modül için yetkiniz yok', 403)

  const { id } = await params
  const site = await checkSite(id, user.tenantId)
  if (!site) return err('Site bulunamadı', 404)

  const residents = await db.resident.findMany({
    where: { siteId: id },
    orderBy: { name: 'asc' },
    include: {
      apartment: {
        select: { id: true, number: true, block: { select: { id: true, name: true } } },
      },
      _count: { select: { dues: true, complaints: true } },
    },
  })

  // Şifre hariç tut
  const safe = residents.map((r) => {
    const { password, passwordHash, ...rest } = r
    return { ...rest, hasPassword: !!passwordHash || !!password }
  })

  return ok({ items: safe })
}

// ============================================================
// POST — yeni sakin ekle (site.manage)
// Body: name, email, phone, password, type, apartmentId
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user || !user.permissions.includes('site.manage')) return err('Bu işlem için yetkiniz yok', 403)

  const { id } = await params
  const site = await checkSite(id, user.tenantId)
  if (!site) return err('Site bulunamadı', 404)

  const body = await req.json()
  const { name, email, phone, password, type, apartmentId } = body as {
    name?: string; email?: string; phone?: string
    password?: string; type?: string; apartmentId?: string
  }

  if (!name || !name.trim()) return err('Sakin adı gerekli', 400)

  // Email benzersiz mi?
  if (email && email.trim()) {
    const existing = await db.resident.findFirst({
      where: { email: email.trim(), siteId: id },
    })
    if (existing) return err('Bu e-posta adresiyle kayıtlı sakin var', 400)
  }

  // Telefon benzersiz mi?
  if (phone && phone.trim()) {
    const existing = await db.resident.findFirst({
      where: { phone: phone.trim(), siteId: id },
    })
    if (existing) return err('Bu telefon ile kayıtlı sakin var', 400)
  }

  // Eğer daire seçildiyse, o daire boşta olmalı ve bu siteye ait olmalı
  if (apartmentId) {
    const apt = await db.apartment.findUnique({ where: { id: apartmentId } })
    if (!apt || apt.siteId !== id) return err('Daire bu siteye ait değil', 400)
    if (apt.residentId) return err('Bu dairede zaten bir sakin var', 400)
  }

  const newPwHash = password && password.trim() ? bcrypt.hashSync(password, 10) : null
  const resident = await db.resident.create({
    data: {
      tenantId: user.tenantId,
      siteId: id,
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      password: null, // legacy alan artık kullanılmıyor
      passwordHash: newPwHash,
      type: type === 'kiraci' ? 'kiraci' : 'mal_sahibi',
      isOwner: type !== 'kiraci',
    },
    include: {
      apartment: { select: { id: true, number: true, block: { select: { id: true, name: true } } } },
    },
  })

  // Daireye ata
  if (apartmentId) {
    await db.apartment.update({
      where: { id: apartmentId },
      data: { residentId: resident.id },
    })
  }

  await writeAuditLog({
    tenantId: user.tenantId, actorId: user.id, action: 'create',
    entity: 'resident', entityId: resident.id,
    after: { name: resident.name, siteId: id },
  })

  const { password: _pw, passwordHash: _pwh, ...safe } = resident
  return ok({ ...safe, hasPassword: !!newPwHash })
}
