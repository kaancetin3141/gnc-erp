import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { getAppointmentContext, hasNoScope } from '@/lib/appointment-perms'

// GET — personel listesi (aktif + pasif; yönetici pasifleri tekrar aktifleştirebilmeli)
// Usta/çırak: yalnız KENDİ kaydını görür (takvim/randevu seçimleri kendi üzerinden döner)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const provider = await db.serviceProvider.findUnique({ where: { id }, select: { tenantId: true } })
  if (!provider) return err('İşletme bulunamadı', 404)
  if (provider.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Erişim reddedildi', 403)

  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (hasNoScope(ctx)) return err('Bu işletmede personel kaydınız yok', 403)

  const staff = await db.staff.findMany({
    where: { providerId: id, ...(ctx.myStaffId ? { id: ctx.myStaffId } : {}) },
    include: { staffServices: { include: { service: true } } },
    orderBy: { sortOrder: 'asc' },
  })

  // Client-friendly: staffServices → services düzleştirme
  const mapped = staff.map((s) => ({
    ...s,
    services: s.staffServices.map((ss) => ({
      id: ss.service.id,
      name: ss.service.name,
      category: ss.service.category,
    })),
  }))

  return ok(mapped)
}

// POST — personel ekle (YALNIZ şirket admini / firma sahibi)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (!ctx.isProviderAdmin) {
    return err('Personel ekleme yalnızca işletme sahibi (şirket admini) tarafından yapılır', 403)
  }

  const body = await req.json()
  const { name, title, photo, phone, bio } = body

  if (!name) return err('Personel adı gerekli', 400)

  const staff = await db.staff.create({
    data: { providerId: id, name, title: title || null, photo: photo || null, phone: phone || null, bio: bio || null },
  })
  return ok(staff)
}
