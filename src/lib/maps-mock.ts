// Mock Google Places API — gerçekçi Türk işletme verisi üretir
// Gerçek API ile değiştirilebilir arayüz.

import { MAPS_CATEGORIES, CITIES } from './constants'
import type { MapsResult } from '@/types'

// Türkiye şehir merkez koordinatları (yaklaşık)
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'İstanbul': { lat: 41.0082, lng: 28.9784 },
  'Ankara': { lat: 39.9334, lng: 32.8597 },
  'İzmir': { lat: 38.4237, lng: 27.1428 },
  'Bursa': { lat: 40.1885, lng: 29.0610 },
  'Antalya': { lat: 36.8969, lng: 30.7133 },
  'Adana': { lat: 37.0000, lng: 35.3213 },
  'Konya': { lat: 37.8714, lng: 32.4847 },
  'Gaziantep': { lat: 37.0662, lng: 37.3833 },
  'Mersin': { lat: 36.8121, lng: 34.6415 },
  'Kayseri': { lat: 38.7312, lng: 35.4787 },
  'Eskişehir': { lat: 39.7767, lng: 30.5206 },
  'Diyarbakır': { lat: 37.9144, lng: 40.2306 },
  'Samsun': { lat: 41.2867, lng: 36.3300 },
  'Denizli': { lat: 37.7765, lng: 29.0864 },
  'Şanlıurfa': { lat: 37.1674, lng: 38.7955 },
  'Trabzon': { lat: 41.0027, lng: 39.7168 },
  'Malatya': { lat: 38.3552, lng: 38.3095 },
  'Erzurum': { lat: 39.9043, lng: 41.2679 },
  'Van': { lat: 38.4942, lng: 43.3800 },
  'Sakarya': { lat: 40.7569, lng: 30.3781 },
  'Manisa': { lat: 38.6191, lng: 27.4289 },
  'Kahramanmaraş': { lat: 37.5858, lng: 36.9371 },
  'Balıkesir': { lat: 39.6484, lng: 27.8826 },
  'Aydın': { lat: 37.8394, lng: 27.8456 },
  'Hatay': { lat: 36.4018, lng: 36.3498 },
  'Tekirdağ': { lat: 40.9833, lng: 27.5167 },
}

// Mahalle/sokak isimleri
const STREET_NAMES = [
  'Atatürk Bulvarı', 'Cumhuriyet Caddesi', 'Gazi Caddesi', 'İnönü Caddesi',
  'Fatih Caddesi', 'Yeni Caddesi', 'Çarşı Caddesi', 'Mithatpaşa Caddesi',
  'Halitpaşa Caddesi', 'Hükümet Caddesi', 'Zafer Caddesi', 'Lale Sokak',
  'Gül Sokak', 'Çınar Sokak', 'Defne Sokak', 'Manolya Sokak', 'Zambak Sokak',
]

const NAMES_SUFFIX = ['A.Ş.', 'Ltd. Şti.', 'Klinik', 'Merkezi', 'Salonu', 'Bürosu', 'Evi', 'Servis']

// Deterministik rastgele (seed tabanlı) — aynı sorgu aynı sonucu üretir
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export interface SearchParams {
  query: string
  city: string
  country?: string
  radius?: number
  existingPlaceIds?: string[]
}

export function mockMapsSearch(params: SearchParams): MapsResult[] {
  const { query, city, existingPlaceIds = [] } = params
  const cityCoord = CITY_COORDS[city] ?? { lat: 39.0, lng: 35.0 }

  // Kategori eşleştir
  const categoryMatch = MAPS_CATEGORIES.find(
    (c) => query.toLowerCase().includes(c.query) || c.query.includes(query.toLowerCase()),
  )
  const category = categoryMatch?.category ?? 'İşletme'
  const namePrefixes = categoryMatch?.namePrefixes ?? ['İşletme']

  const seed = hashString(`${query}-${city}`)
  const rand = seededRandom(seed)

  const count = 12 + Math.floor(rand() * 18) // 12-30 sonuç
  const results: MapsResult[] = []

  const existingSet = new Set(existingPlaceIds)

  for (let i = 0; i < count; i++) {
    const prefix = namePrefixes[Math.floor(rand() * namePrefixes.length)]
    const personFirst = ['Mehmet', 'Ahmet', 'Ayşe', 'Fatma', 'Mustafa', 'Emine', 'Ali', 'Hatice', 'Hüseyin', 'Zeynep']
    const personLast = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir']
    const ownerName = Math.random() > 0.5
      ? `${personFirst[Math.floor(rand() * personFirst.length)]} ${personLast[Math.floor(rand() * personLast.length)]}`
      : null

    const name = ownerName
      ? `${prefix} ${ownerName}`
      : `${prefix} ${cityMatchBrand(rand)}`

    const street = STREET_NAMES[Math.floor(rand() * STREET_NAMES.length)]
    const no = Math.floor(rand() * 200) + 1
    const address = `${street} No:${no}, ${city}`

    // Koordinat: şehir merkezi etrafında dağıl
    const latOffset = (rand() - 0.5) * 0.15
    const lngOffset = (rand() - 0.5) * 0.15
    const lat = cityCoord.lat + latOffset
    const lng = cityCoord.lng + lngOffset

    const placeId = `mock_${hashString(name + address)}`

    const hasPhone = rand() > 0.2
    const phone = hasPhone ? `+90 5${Math.floor(rand() * 9) + 1}${String(Math.floor(rand() * 10)).padStart(1, '0')} ${String(Math.floor(rand() * 1000)).padStart(3, '0')} ${String(Math.floor(rand() * 100)).padStart(2, '0')} ${String(Math.floor(rand() * 100)).padStart(2, '0')}` : null

    const hasWeb = rand() > 0.5
    const slug = name.toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c')
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
      .replace(/[^a-z0-9]/g, '').slice(0, 20)
    const web = hasWeb ? `www.${slug}.com.tr` : null

    const rating = rand() > 0.15 ? Math.round((3.2 + rand() * 1.8) * 10) / 10 : null
    const reviewCount = rating ? Math.floor(rand() * 850) + 5 : null

    results.push({
      placeId,
      name,
      category,
      address,
      city,
      phone,
      web,
      rating,
      reviewCount,
      lat,
      lng,
      existsInCrm: existingSet.has(placeId),
    })
  }

  return results
}

function cityMatchBrand(rand: () => number): string {
  const brands = ['Plus', 'Merkezi', 'Profesyonel', 'Premium', 'Modern', 'Yeni', 'Büyük', 'Elite']
  return brands[Math.floor(rand() * brands.length)]
}

export { CITY_COORDS }
