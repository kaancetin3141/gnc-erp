// Mock Google Places API — gerçekçi Türk işletme verisi üretir
// Gerçek API ile değiştirilebilir arayüz.
// NOT: Tamamen deterministiktir — aynı sorgu+şehir her zaman aynı sonucu üretir
// (placeId deduplication'ın çalışması için zorunlu).

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
  // Yurt dışı merkezleri — çevrimdışı fallback'te bile doğru noktaya düşsün
  'Berlin': { lat: 52.5200, lng: 13.4050 },
  'Paris': { lat: 48.8566, lng: 2.3522 },
  'London': { lat: 51.5074, lng: -0.1278 },
  'Amsterdam': { lat: 52.3676, lng: 4.9041 },
  'Vienna': { lat: 48.2082, lng: 16.3738 },
  'Milan': { lat: 45.4642, lng: 9.1900 },
  'Madrid': { lat: 40.4168, lng: -3.7038 },
  'Zurich': { lat: 47.3769, lng: 8.5417 },
  'Dubai': { lat: 25.2048, lng: 55.2708 },
  'New York': { lat: 40.7128, lng: -74.0060 },
}

// Büyük şehirler için mahalle isimleri — adres gerçekçiliği
const CITY_DISTRICTS: Record<string, string[]> = {
  'İstanbul': ['Kadıköy', 'Beşiktaş', 'Şişli', 'Üsküdar', 'Bakırköy', 'Ataşehir', 'Maltepe', 'Beylikdüzü', 'Pendik', 'Beyoğlu'],
  'Ankara': ['Çankaya', 'Keçiören', 'Yenimahalle', 'Etimesgut', 'Mamak', 'Sincan', 'Gölbaşı'],
  'İzmir': ['Konak', 'Karşıyaka', 'Bornova', 'Buca', 'Bayraklı', 'Çiğli', 'Gaziemir'],
  'Bursa': ['Nilüfer', 'Osmangazi', 'Yıldırım', 'Gemlik', 'Gürsu'],
  'Antalya': ['Muratpaşa', 'Kepez', 'Konyaaltı', 'Alanya', 'Manavgat'],
}

// Mahalle/sokak isimleri
const STREET_NAMES = [
  'Atatürk Bulvarı', 'Cumhuriyet Caddesi', 'Gazi Caddesi', 'İnönü Caddesi',
  'Fatih Caddesi', 'Yeni Caddesi', 'Çarşı Caddesi', 'Mithatpaşa Caddesi',
  'Halitpaşa Caddesi', 'Hükümet Caddesi', 'Zafer Caddesi', 'Lale Sokak',
  'Gül Sokak', 'Çınar Sokak', 'Defne Sokak', 'Manolya Sokak', 'Zambak Sokak',
]

const PERSON_FIRST = ['Mehmet', 'Ahmet', 'Ayşe', 'Fatma', 'Mustafa', 'Emine', 'Ali', 'Hatice', 'Hüseyin', 'Zeynep', 'Elif', 'Murat', 'Selin', 'Emre', 'Burak']
const PERSON_LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan']

// Marka benzeri kelimeler — "X Plus", "X Premium" gibi
const BRAND_WORDS = ['Plus', 'Merkez', 'Premium', 'Modern', 'Nova', 'Elite', 'Başarı', 'Ustam', 'Gold', 'Star']

// Kategori → serbest metin eşleşme sözlüğü.
// Kullanıcı "berber" yazsa bile Kuaför kategorisine düşer.
const CATEGORY_ALIASES: Record<string, string[]> = {
  'diş kliniği': ['diş', 'dis', 'dental', 'implant', 'ortodonti', 'ağız'],
  'kuaför': ['kuaför', 'kuafor', 'berber', 'güzellik', 'guzellik', 'saç', 'sac', 'epilasyon', 'manikür'],
  'restoran': ['restoran', 'lokanta', 'yemek', 'kebap', 'pide', 'kahvaltı', 'food', 'mutfak'],
  'eczane': ['eczane', 'ecz', 'ilaç'],
  'otomotiv': ['oto', 'otomotiv', 'araba', 'servis', 'lastik', 'kaporta', 'boya'],
  'gym fitness': ['spor', 'gym', 'fitness', 'pilates', 'yoga', 'salon'],
  'avukat': ['avukat', 'hukuk', 'law', 'danışmanlık hukuk'],
  'muhasebe': ['muhasebe', 'mali müşavir', 'mali', 'smmm', 'müşavir'],
  'cafe': ['cafe', 'kafe', 'coffee', 'kahve', 'pastane', 'fırın'],
  'market': ['market', 'bakkal', 'süpermarket', 'manav', 'kasap'],
  'otel': ['otel', 'hotel', 'pansiyon', 'konaklama', 'apart'],
  'veteriner': ['veteriner', 'vet', 'pet', 'hayvan'],
  'eğitim': ['kurs', 'etüt', 'eğitim', 'dershane', 'özel öğretim', 'anaokulu', 'kreş'],
  'emlak': ['emlak', 'gayrimenkul', 'kiralık', 'satılık', 'inşaat'],
}

export interface SearchParams {
  query: string
  city: string
  country?: string
  radius?: number
  existingPlaceIds?: string[]
}

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

// Türkçe'den arama metnini normalize et (büyük harf / Türkçe karakter duyarsız)
function normText(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim()
}

// Sorgudan kategori bul — önce birebir, sonra alias ile
function matchCategory(query: string): (typeof MAPS_CATEGORIES)[number] {
  const q = normText(query)
  // 1) birebir kategori adı/sorgusu
  const direct = MAPS_CATEGORIES.find(
    (c) => q.includes(normText(c.query)) || normText(c.query).includes(q),
  )
  if (direct) return direct
  // 2) alias sözlüğü — "berber" → kuaför, "dental" → diş kliniği ...
  for (const [key, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((a) => q.includes(normText(a)))) {
      const cat = MAPS_CATEGORIES.find((c) => c.query === key)
      if (cat) return cat
    }
  }
  return null as unknown as (typeof MAPS_CATEGORIES)[number]
}

export function mockMapsSearch(params: SearchParams): MapsResult[] {
  const { query, city, existingPlaceIds = [] } = params
  const cityCoord = CITY_COORDS[city] ?? { lat: 39.0, lng: 35.0 }

  // Kategori eşleştir — bulunamazsa genel 'İşletme'
  const categoryMatch = matchCategory(query)
  const category = categoryMatch?.category ?? 'İşletme'
  // constants'ta alan adı namePrefix — geçmiş sürümlerde namePrefixes ile
  // okunduğu için hep 'İşletme' prefix'i kullanılıyordu (bug). İkisini de destekle.
  const namePrefixes: readonly string[] =
    categoryMatch
      ? ((categoryMatch as unknown as { namePrefix?: readonly string[] }).namePrefix ??
        (categoryMatch as unknown as { namePrefixes?: readonly string[] }).namePrefixes ??
        ['İşletme'])
      : ['İşletme']

  const seed = hashString(`${normText(query)}-${city}`)
  const rand = seededRandom(seed)

  const count = 12 + Math.floor(rand() * 18) // 12-30 sonuç
  const results: MapsResult[] = []

  const existingSet = new Set(existingPlaceIds)

  for (let i = 0; i < count; i++) {
    const prefix = namePrefixes[Math.floor(rand() * namePrefixes.length)]
    const first = PERSON_FIRST[Math.floor(rand() * PERSON_FIRST.length)]
    const last = PERSON_LAST[Math.floor(rand() * PERSON_LAST.length)]
    const brand = BRAND_WORDS[Math.floor(rand() * BRAND_WORDS.length)]

    // İsim çeşitliliği (deterministik): %40 marka, %30 kişi adı, %30 sadece prefix+brand
    const nameRoll = rand()
    let name: string
    if (nameRoll < 0.4) {
      name = `${prefix} ${first} ${last}`
    } else if (nameRoll < 0.7) {
      name = `${prefix} ${brand}`
    } else {
      name = `${brand} ${prefix}`
    }

    // Adres: büyük şehirlerde mahalle + sokak
    const districts = CITY_DISTRICTS[city]
    const street = STREET_NAMES[Math.floor(rand() * STREET_NAMES.length)]
    const no = Math.floor(rand() * 200) + 1
    const address = districts
      ? `${districts[Math.floor(rand() * districts.length)]}, ${street} No:${no}, ${city}`
      : `${street} No:${no}, ${city}`

    // Koordinat: şehir merkezi etrafında dağıl
    const latOffset = (rand() - 0.5) * 0.15
    const lngOffset = (rand() - 0.5) * 0.15
    const lat = cityCoord.lat + latOffset
    const lng = cityCoord.lng + lngOffset

    const placeId = `mock_${hashString(name + address)}`

    // Telefon: %85 var (CRM için kritik — leadsiz lead işe yaramaz)
    const hasPhone = rand() > 0.15
    const operator = Math.floor(rand() * 5) + 5 // 5xx GSM
    const phone = hasPhone
      ? `+90 5${operator}${String(Math.floor(rand() * 10)).padStart(1, '0')} ${String(Math.floor(rand() * 900) + 100)} ${String(Math.floor(rand() * 100)).padStart(2, '0')} ${String(Math.floor(rand() * 100)).padStart(2, '0')}`
      : null

    const hasWeb = rand() > 0.45
    const slug = name.toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c')
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
      .replace(/[^a-z0-9]/g, '').slice(0, 20)
    const web = hasWeb ? `www.${slug}.com.tr` : null

    const rating = rand() > 0.12 ? Math.round((3.2 + rand() * 1.8) * 10) / 10 : null
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

  // Ada göre sırala — puanı yüksek üstte (Google davranışı)
  results.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))

  return results
}

export { CITY_COORDS }
