import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// ============================================================
// ADMIN — Platform Servisleri (ana site "Servisler" sekmesi)
// GET  /api/admin/services          → liste (+ ?check=1 ile canlı port sağlık kontrolü)
// POST /api/admin/services          → yeni servis (superadmin)
// Bu projede SADECE CRM (3000) + customer-page (3002) vardır; KaloriAI (3004)
// ve Fruit Storm (3003) kullanıcının sunucusunda ayrı projelerdir — burada
// yalnızca BAĞLANTI (url/port) yönetilir.
// ============================================================

type SeedService = {
  key: string
  name: string
  description: string
  url: string
  localPort: number
  icon: string
  color: string
  sortOrder: number
}

// Varsayılan servis kataloğu — tablo boşsa ilk GET'te otomatik eklenir.
// URL'ler base_domain ayarı varsa alt alan adı ile üretilir.
async function seedDefaultsIfEmpty(): Promise<void> {
  const count = await db.platformService.count()
  if (count > 0) return
  const baseRow = await db.systemSetting.findUnique({ where: { key: 'base_domain' } })
  const base = baseRow?.value?.trim() || 'gncinc.online'
  const sub = (s: string) => `https://${s}.${base}`
  const defaults: SeedService[] = [
    {
      key: 'customer-page',
      name: 'Müşteri Randevu Sitesi',
      description:
        'Randevu sisteminin müşteri arayüzü — tüm işletmeler haritada, konuma göre en yakın öne çıkar. Bu proje içinde (port 3002) çalışır.',
      url: sub('randevu'),
      localPort: 3002,
      icon: 'map-pin',
      color: '#16a34a',
      sortOrder: 1,
    },
    {
      key: 'kalori-ai',
      name: 'KaloriAI',
      description:
        "Kalori takip ve diyet asistanı. Bu projede DEĞİL — sunucuya GitHub'dan (kaancetin3141/KaloriAI) ayrı yüklenir (port 3004).",
      url: sub('kaloriai'),
      localPort: 3004,
      icon: 'salad',
      color: '#ea580c',
      sortOrder: 2,
    },
    {
      key: 'fruit-storm',
      name: 'Fruit Storm',
      description:
        'Meyve toplama oyunu. Bu projede DEĞİL — sunucuda ayrı çalışır (port 3003).',
      url: sub('oyun'),
      localPort: 3003,
      icon: 'cherry',
      color: '#dc2626',
      sortOrder: 3,
    },
  ]
  // SQLite'ta benzersiz anahtar çakışmasına dayanıklı seed
  for (const d of defaults) {
    await db.platformService.upsert({
      where: { key: d.key },
      update: {},
      create: d,
    })
  }
}

// Yerel port canlı mı? (yalnızca sunucu içi localhost sondajı)
async function probePort(port: number): Promise<boolean> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1200)
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(t)
    return res.status < 500
  } catch {
    // HEAD desteklenmeyebilir — GET ile bir kez daha dene
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 1200)
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(t)
      await res.body?.cancel()
      return res.status < 500
    } catch {
      return false
    }
  }
}

export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin' && user!.role !== 'admin') {
    return err('Bu işlem için yönetici yetkisi gerekli', 403)
  }

  await seedDefaultsIfEmpty()

  const items = await db.platformService.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  // ?check=1 → canlı yerel port durumu (sandbox ve sunucuda çalışır)
  const check = req.nextUrl.searchParams.get('check') === '1'
  const status: Record<string, boolean> = {}
  if (check) {
    await Promise.all(
      items.map(async (s) => {
        if (s.localPort) status[s.id] = await probePort(s.localPort)
      }),
    )
  }

  const baseRow = await db.systemSetting.findUnique({ where: { key: 'base_domain' } })
  return ok({
    items: items.map((s) => ({ ...s, alive: s.localPort ? (status[s.id] ?? null) : null })),
    baseDomain: baseRow?.value ?? '',
    scope: user!.role === 'superadmin' ? 'platform' : 'tenant',
  })
}

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  const permErr = requirePermission(user, 'admin.access')
  if (permErr) return permErr
  if (user!.role !== 'superadmin') {
    return err('Servis yönetimi yalnızca program adminine açıktır', 403)
  }

  const body = (await req.json().catch(() => null)) as {
    key?: string
    name?: string
    description?: string
    url?: string
    localPort?: number | null
    icon?: string
    color?: string
    sortOrder?: number
  } | null

  if (!body?.key || !body?.name) return err('key ve name zorunlu', 400)
  const key = body.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
  if (!key) return err('geçerli bir key girin', 400)

  const existing = await db.platformService.findUnique({ where: { key } })
  if (existing) return err('Bu key ile bir servis zaten var', 409)

  const created = await db.platformService.create({
    data: {
      key,
      name: body.name.trim(),
      description: body.description?.trim() ?? '',
      url: body.url?.trim() ?? '',
      localPort: typeof body.localPort === 'number' ? body.localPort : null,
      icon: body.icon?.trim() || 'app-window',
      color: body.color?.trim() || '#16a34a',
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 99,
    },
  })

  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'service.create',
    entity: 'PlatformService',
    entityId: created.id,
    after: created,
  })

  return ok(created, 201)
}
