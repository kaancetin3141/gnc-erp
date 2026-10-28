import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeJsonParse } from '@/lib/api-utils'

// ============================================================
// PUBLIC (auth gerektirmez) — gncinc.online ana sitesi proje listesi
// CORS açık: farklı subdomain'lerden (gncinc.online -> crm.gncinc.online) fetch edilebilir
// GET /api/portfolio -> { projects: [...] }
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ------------------------------------------------------------
// Varsayılan 5 proje — TEK SEFERLİK backfill (SystemSetting işaretçisi ile).
// - Tablo boşsa hepsi eklenir (ana-site canlı liste hemen dolu görünsün)
// - Tabloda kayıt varsa SADECE eksik subdomain'ler eklenir (kullanıcı
//   kayıtları korunur; panelde silinen kart geri gelmez)
// v2: Cubiq (cubiq.gncinc.online, port 3006) varsayılan listeye girdi
// ------------------------------------------------------------
const PORTFOLIO_MARKER = 'portfolio_defaults_v2'

async function seedDefaultsIfEmpty() {
  const marker = await db.systemSetting.findUnique({ where: { key: PORTFOLIO_MARKER } })
  if (marker) return

  const existing = await db.portfolioProject.findMany({ select: { title: true, subdomain: true } })
  const titles = new Set(existing.map((e) => e.title))
  const subdomains = new Set(existing.map((e) => e.subdomain).filter(Boolean))

  const defaults = [
    {
      title: 'GNC ERP & CRM',
      description:
        'Kuaför, kafe ve perakende işletmeleri için tam kapsamlı yönetim sistemi: randevu, müşteri, stok, kasa ve raporlama tek panelde.',
      url: 'https://crm.gncinc.online',
      subdomain: 'crm',
      port: 3000,
      status: 'live',
      emoji: '📊',
      tech: JSON.stringify(['Next.js 16', 'TypeScript', 'Prisma', 'Tailwind CSS']),
      features: JSON.stringify([
        'Randevu & takvim yönetimi',
        'Müşteri takibi & veresiye defteri',
        'Personel, kasa ve gelir-gider raporları',
        'Kafe masaları & paket servis takibi',
      ]),
      sortOrder: 1,
    },
    {
      title: 'Müşteri Randevu Sistemi',
      description:
        'Müşterileriniz işletmenizi haritada bulur, en yakın şubeyi seçer ve online randevu alır. Her işletme kendi alt alan adında yayınlanır.',
      url: 'https://randevu.gncinc.online',
      subdomain: 'randevu',
      port: 3002,
      status: 'live',
      emoji: '🗓️',
      tech: JSON.stringify(['Bun', 'Leaflet Harita', 'Prisma']),
      features: JSON.stringify([
        'Haritada en yakın işletme (konum destekli)',
        'Online randevu alma & onay akışı',
        'Her işletmeye özel alt alan adı',
        'Mobil uyumlu müşteri sayfası',
      ]),
      sortOrder: 2,
    },
    {
      title: 'Fruit Storm',
      description:
        'Sweet Match 3 — meyveleri eşleştir, zincirle, yıldızları topla! 8 dilde, çevrimiçi skorlu bulmaca oyunu; telefondan da oynanabilir.',
      url: 'https://fruitstorm.gncinc.online',
      subdomain: 'fruitstorm',
      port: 3003,
      status: 'live',
      emoji: '🍓',
      tech: JSON.stringify(['Next.js 16', 'Canvas', 'Prisma']),
      features: JSON.stringify([
        'Dokunmatik & fare desteği',
        'Çevrimiçi rekor tablosu & klan sistemi',
        'Kurulum gerektirmez, anında oyna',
      ]),
      sortOrder: 3,
    },
    {
      title: 'Kalori AI',
      description:
        'Yapay zekâ destekli beslenme ve kalori takibi — yediğini gir, kalorisini otomatik hesapla, günlük hedefini ve gelişimini takip et.',
      url: 'https://kaloriai.gncinc.online',
      subdomain: 'kaloriai',
      port: 3004,
      status: 'soon',
      emoji: '🥗',
      tech: JSON.stringify(['Next.js 16', 'Prisma', 'AI']),
      features: JSON.stringify([
        'AI ile yemek tanıma & kalori hesabı',
        'Günlük kalori & makro takibi',
        'Kişisel hedefler ve haftalık raporlar',
      ]),
      sortOrder: 4,
    },
    {
      title: 'Cubiq',
      description:
        'Blok patlatma bulmaca — parçayı yerleştir, çizgileri temizle, combo yap! Tarayıcıda anında oyna; telefona kurulabilen PWA ile çevrimdışı da çalışır.',
      url: 'https://cubiq.gncinc.online',
      subdomain: 'cubiq',
      port: 3006,
      status: 'live',
      emoji: '🧩',
      tech: JSON.stringify(['Vanilla JS', 'Canvas', 'PWA', 'Sıfır bağımlılık']),
      features: JSON.stringify([
        'Klasik, Günlük Görev ve Macera modları',
        'XP & seviye, coin ekonomisi, 15 rozet',
        'Çevrimdışı PWA — kurulum gerektirmez',
        'Dokunmatik, fare ve klavye desteği',
      ]),
      sortOrder: 5,
    },
  ]

  let added = 0
  for (const d of defaults) {
    // Kullanıcının aynı projeye ait kaydı varsa dokunma (subdomain ya da başlık eşleşmesi)
    if (d.subdomain && subdomains.has(d.subdomain)) continue
    if (titles.has(d.title)) continue
    await db.portfolioProject.create({ data: d })
    added++
  }
  await db.systemSetting.upsert({
    where: { key: PORTFOLIO_MARKER },
    update: {},
    create: { key: PORTFOLIO_MARKER, value: new Date().toISOString() },
  })
  if (added > 0) console.log(`[portfolio] ${added} varsayılan proje eklendi (tek seferlik backfill)`)
}

export async function GET(req: NextRequest) {
  try {
    await seedDefaultsIfEmpty()

    const projects = await db.portfolioProject.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json(
      {
        projects: projects.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          url: p.url,
          subdomain: p.subdomain,
          status: p.status,
          emoji: p.emoji,
          tech: safeJsonParse<string[]>(p.tech, []),
          features: safeJsonParse<string[]>(p.features, []),
          sortOrder: p.sortOrder,
        })),
        generatedAt: new Date().toISOString(),
      },
      { headers: CORS_HEADERS },
    )
  } catch (error) {
    console.error('[portfolio] GET error:', error)
    return NextResponse.json(
      { error: 'Projeler yüklenemedi' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
