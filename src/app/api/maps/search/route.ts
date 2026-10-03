import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, requirePermission, ok, err,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { geocodePlace, searchBusinesses, searchBusinessesGoogle } from '@/lib/maps-osm'
import { mockMapsSearch, CITY_COORDS } from '@/lib/maps-mock'
import type { MapsResult } from '@/types'

// GET — son harita aramaları (geçmiş)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') || '20')

  const searches = await db.mapsSearch.findMany({
    where: { tenantId: user!.tenantId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return ok({ items: searches })
}

// POST — yeni harita araması (GERÇEK OpenStreetMap verisi + çevrimdışı fallback)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'maps.search')
  if (permErr) return permErr

  const body = await req.json()
  const { query, city, country, radius, category } = body

  if (!query) return err('Arama sorgusu gerekli', 400)
  if (!city) return err('Şehir gerekli', 400)

  const radiusM = Math.min(100_000, Math.max(300, Number(radius) || 2000))

  // Mevcut placeId'leri topla (lead + customer) — existsInCrm işaretle
  const [existingLeads, existingCustomers] = await Promise.all([
    db.lead.findMany({
      where: { tenantId: user!.tenantId, placeId: { not: null } },
      select: { placeId: true },
    }),
    db.customer.findMany({
      where: { tenantId: user!.tenantId, placeId: { not: null } },
      select: { placeId: true },
    }),
  ])
  const existingPlaceIds = new Set<string>([
    ...existingLeads.map((l) => l.placeId).filter(Boolean) as string[],
    ...existingCustomers.map((c) => c.placeId).filter(Boolean) as string[],
  ])
  const existingArr = Array.from(existingPlaceIds)

  // ---- GERÇEK ARAMA: Google (anahtar varsa) → OSM → mock fallback ----
  let results: MapsResult[]
  let provider: 'google' | 'osm' | 'fallback' = 'osm'
  let geocoded: { lat: number; lng: number; displayName: string } | null = null
  let resolvedCountry: string | null = null
  let searchError: string | null = null

  try {
    // 1) Konum çözümleme: "sorgu, şehir" → bulunamazsa sadece şehir
    //    (Nominatim KÜRESELDİR — Berlin, Paris, Dubai… hepsi çözülür)
    const geo =
      (await geocodePlace(`${query}, ${city}`)) ??
      (await geocodePlace(city))
    if (!geo) throw new Error('Konum çözümlenemedi (Nominatim boş döndü)')

    geocoded = { lat: geo.lat, lng: geo.lng, displayName: geo.displayName }
    resolvedCountry = geo.countryCode?.toUpperCase() ?? null

    // 2) Veri kaynağı: Google anahtarı varsa önce Google, hata olursa OSM
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        results = await searchBusinessesGoogle({
          query,
          lat: geo.lat,
          lng: geo.lng,
          radiusM,
          existingPlaceIds: existingArr,
          categoryLabel: category || undefined,
        })
        provider = 'google'
      } catch (gErr) {
        console.error(`[maps/search] Google Places başarısız, OSM'e geçiliyor:`, gErr)
        const osmResults = await searchBusinesses({
          query,
          category: category || undefined,
          lat: geo.lat,
          lng: geo.lng,
          radiusM,
          existingPlaceIds: existingArr,
        })
        results = osmResults
        provider = 'osm'
      }
    } else {
      const osmResults = await searchBusinesses({
        query,
        category: category || undefined,
        lat: geo.lat,
        lng: geo.lng,
        radiusM,
        existingPlaceIds: existingArr,
      })
      results = osmResults
      provider = 'osm'
    }
  } catch (e) {
    // FALLBACK: sandbox ağ engeli / servis erişilemez → mock veri
    searchError = e instanceof Error ? e.message : String(e)
    console.error('[maps/search] OSM araması başarısız, fallback kullanılıyor:', searchError)
    provider = 'fallback'
    const cityCoord = CITY_COORDS[city] ?? { lat: 39.0, lng: 35.0 }
    geocoded = {
      lat: cityCoord.lat,
      lng: cityCoord.lng,
      displayName: `${city} (yaklaşık merkez)`,
    }
    results = mockMapsSearch({
      query,
      city,
      country: country || 'TR',
      radius: radiusM,
      existingPlaceIds: existingArr,
    })
  }

  // MapsSearch kaydı oluştur — ülke kodu geocoding'den türetilir (küresel arama)
  const search = await db.mapsSearch.create({
    data: {
      tenantId: user!.tenantId,
      userId: user!.id,
      query,
      city,
      country: resolvedCountry || country || 'TR',
      radius: radiusM,
      resultCount: results.length,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'maps_search',
    entityId: search.id,
    after: { query, city, resultCount: results.length, provider },
  })

  return ok({
    results,
    searchId: search.id,
    search,
    provider,
    geocoded,
    ...(searchError ? { notice: 'OpenStreetMap servisine ulaşılamadı, örnek veri gösteriliyor' } : {}),
  })
}
