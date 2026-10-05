import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — İşletme konumu bulma (GERÇEK geocoding)
// POST /api/admin/domains/geocode  body: { providerId?: string, allMissing?: boolean }
// - OSM Nominatim kullanır (ücretsiz, anahtar gerektirmez)
// - Kibarlık kuralı: istekler arasında ≥1.1 sn, çağrı başına en fazla 8 işletme
// - Adres bulunamazsa { ok:false, error } döner — sessiz mock YOK
// Yetki: admin.access + rol admin|superadmin; admin kendi tenant'ı ile sınırlı
// ============================================================

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'GNC-CRM/1.0 (GNC Randevu konum servisi)'
const MAX_PER_CALL = 8
const MIN_DELAY_MS = 1100

interface GeoItem {
  providerId: string
  name: string
  ok: boolean
  lat?: number
  lng?: number
  label?: string
  error?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function geocodeOne(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=tr&q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'tr' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  if (!Array.isArray(rows) || rows.length === 0) return null
  const lat = Number.parseFloat(rows[0].lat)
  const lng = Number.parseFloat(rows[0].lon)
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  return { lat, lng, label: rows[0].display_name }
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin' && user!.role !== 'admin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }
  const isSuper = user!.role === 'superadmin'

  const body = (await req.json().catch(() => null)) as {
    providerId?: string
    allMissing?: boolean
  } | null
  if (!body) return err('Geçersiz istek gövdesi', 400)

  // Kapsam belirle
  let providers: Array<{
    id: string; name: string; address: string | null
    city: string | null; district: string | null; tenantId: string
    lat: number | null; lng: number | null
  }> = []

  if (body.providerId) {
    const p = await db.serviceProvider.findUnique({
      where: { id: body.providerId },
      select: { id: true, name: true, address: true, city: true, district: true, tenantId: true, lat: true, lng: true },
    })
    if (!p) return err('İşletme bulunamadı', 404)
    if (!isSuper && p.tenantId !== user!.tenantId) {
      return err('Başka bir işletmenin konumunu düzenleme yetkiniz yok', 403)
    }
    providers = [p]
  } else if (body.allMissing) {
    providers = await db.serviceProvider.findMany({
      where: {
        ...(isSuper ? {} : { tenantId: user!.tenantId }),
        OR: [{ lat: null }, { lng: null }],
        isActive: true,
      },
      select: { id: true, name: true, address: true, city: true, district: true, tenantId: true, lat: true, lng: true },
      take: MAX_PER_CALL,
      orderBy: { name: 'asc' },
    })
  } else {
    return err('providerId veya allMissing:true gerekli', 400)
  }

  // Adresi hiç olmayanları işaretle, diğerlerini sırayla geocode et
  const results: GeoItem[] = []
  let processed = 0
  for (const p of providers) {
    if (processed >= MAX_PER_CALL) {
      results.push({ providerId: p.id, name: p.name, ok: false, error: 'Bu çağrının limiti doldu (8) — tekrar deneyin' })
      continue
    }
    const parts = [p.address, p.district, p.city, 'Türkiye'].filter(Boolean)
    if (parts.length <= 1) {
      // adres yoksa da geoCheckedAt işaretle — tekrar denenmesin
      await db.serviceProvider.update({ where: { id: p.id }, data: { geoCheckedAt: new Date() } })
      results.push({ providerId: p.id, name: p.name, ok: false, error: 'Adres bilgisi yok — önce işletme ayarlarından adres girin' })
      continue
    }
    try {
      const hit = await geocodeOne(parts.join(', '))
      if (hit) {
        await db.serviceProvider.update({
          where: { id: p.id },
          data: { lat: hit.lat, lng: hit.lng, geoCheckedAt: new Date() },
        })
        results.push({ providerId: p.id, name: p.name, ok: true, lat: hit.lat, lng: hit.lng, label: hit.label })
      } else {
        await db.serviceProvider.update({ where: { id: p.id }, data: { geoCheckedAt: new Date() } })
        results.push({ providerId: p.id, name: p.name, ok: false, error: 'Adres bulunamadı' })
      }
    } catch (e) {
      results.push({
        providerId: p.id, name: p.name, ok: false,
        error: e instanceof Error ? e.message : 'Konum servisine ulaşılamadı',
      })
    }
    processed++
    if (processed < providers.length) await sleep(MIN_DELAY_MS) // Nominatim kibarlık kuralı
  }

  const successCount = results.filter((r) => r.ok).length
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'domain.geocode',
    entity: 'ServiceProvider',
    entityId: null,
    after: { processed, successCount },
  })

  return ok({ results, processed, successCount })
}
