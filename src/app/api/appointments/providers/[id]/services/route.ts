import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { getAppointmentContext, hasNoScope } from '@/lib/appointment-perms'

// GET — hizmet listesi (aktif + pasif; yönetici pasifleri tekrar aktifleştirebilmeli)
// Usta/çırak da görür — hangi hizmetleri vereceğini seçmek için (salt okunur)
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

  const services = await db.service.findMany({
    where: { providerId: id },
    orderBy: { sortOrder: 'asc' },
  })
  return ok(services)
}

// POST — hizmet ekle (YALNIZ şirket admini / firma sahibi)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const ctx = await getAppointmentContext(user!, id)
  if (!ctx) return err('İşletme bulunamadı', 404)
  if (!ctx.isProviderAdmin) {
    return err('Hizmet ekleme yalnızca işletme sahibi (şirket admini) tarafından yapılır', 403)
  }

  const body = await req.json()
  const { name, description, duration, price, category, photo } = body

  if (!name) return err('Hizmet adı gerekli', 400)

  const service = await db.service.create({
    data: {
      providerId: id,
      name,
      description: description || null,
      duration: parseInt(duration) || 30,
      price: parseFloat(price) || 0,
      category: category || null,
      photo: photo || null,
    },
  })
  return ok(service)
}
