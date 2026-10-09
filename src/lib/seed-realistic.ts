// ============================================================
// GEREKÇELİ DEMO VERİ MOTORU — "uygulamayı daha gerçekçi"
// Gerçekçi Türk işletme verileri: CRM pipeline, giderler,
// kafe menü+sipariş geçmişi, market ürünleri+satışlar,
// veresiye, kuaför randevu geçmişi, site aidat/talep.
// Deterministik RNG → her koşuda tutarlı, gerçekçi veri.
// Idempotent: TenantSetting 'seed.realistic.done' işareti.
// ============================================================

import { db } from './db'

// ---------- Deterministik RNG ----------
function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20261002)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
const ri = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const rf = (min: number, max: number) => min + rng() * (max - min)
const chance = (p: number) => rng() < p
function genId(): string {
  // cuid-benzeri kısa id (SQLite şema zorunluluğu yok)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = 'c'
  for (let i = 0; i < 24; i++) s += chars[Math.floor(rng() * chars.length)]
  return s
}

// ---------- Tarih yardımcıları ----------
function dayAt(offsetDays: number, hour: number, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour, minute, 0, 0)
  return d
}

// ---------- Türkçe ad havuzları ----------
const FIRST = ['Mehmet', 'Ayşe', 'Mustafa', 'Fatma', 'Ahmet', 'Emine', 'Ali', 'Zeynep', 'Hüseyin', 'Hatice', 'İbrahim', 'Elif', 'Hasan', 'Meryem', 'Murat', 'Sultan', 'Kemal', 'Seda', 'Nazlı', 'Emre', 'Burcu', 'Serkan', 'Duygu', 'Onur']
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek']
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`

function trPhone(): string {
  const prefixes = ['532', '533', '534', '535', '536', '542', '543', '544', '555']
  return `+90${pick(prefixes)}${String(ri(100, 999))}${String(ri(10, 99))}${String(ri(10, 99))}`
}

function trBarcode(): string {
  let s = '869'
  for (let i = 0; i < 10; i++) s += ri(0, 9)
  return s
}

const round2 = (n: number) => Math.round(n * 100) / 100
const tl9 = (base: number) => round2(Math.round(base / 5) * 5 + (chance(0.6) ? 0.9 : 0)) // 34.90 gibi

// ============================================================
// ANA FONKSİYON
// ============================================================
export async function runRealisticSeed(): Promise<{ message: string; created: Record<string, number> }> {
  const created: Record<string, number> = {}
  const markerKey = 'seed.realistic.done'

  const sectionDone = async (key: string) => {
    const m = await db.tenantSetting.findFirst({ where: { key } })
    return !!m
  }
  const markDone = async (key: string) => {
    const dup = await db.tenantSetting.findFirst({ where: { key } })
    if (dup) return
    let tid = crmTenantId
    if (!tid) {
      const anyTenant = await db.tenant.findFirst({ select: { id: true } })
      tid = anyTenant?.id
    }
    if (tid) await db.tenantSetting.create({ data: { tenantId: tid, key, value: new Date().toISOString() } })
  }

  const alreadyDone = await db.tenantSetting.findFirst({ where: { key: markerKey } })
  if (alreadyDone) return { message: 'Gerçekçi demo verisi zaten yüklenmiş (idempotent atlandı).', created }

  // ---- Tenantları bul ----
  const adminUser = await db.user.findFirst({ where: { name: 'Demir Yıldız' } })
  const crmTenantId = adminUser?.tenantId
  const cafe = await db.cafe.findFirst()
  const market = await db.market.findFirst()
  const provider = await db.serviceProvider.findFirst()
  const parkSite = await db.site.findFirst({ where: { name: 'Park Sitesi' } })

  // ============================================================
  // 1) CRM — Deal pipeline, aktiviteler, görevler, giderler
  // ============================================================
  if (crmTenantId && !(await sectionDone('seed.realistic.crm'))) {
    const customers = await db.customer.findMany({ where: { tenantId: crmTenantId }, select: { id: true, name: true } })
    const reps = await db.user.findMany({ where: { tenantId: crmTenantId, role: { in: ['admin', 'manager', 'rep'] } }, select: { id: true } })

    if (customers.length > 0) {
      // --- 1a. Müşteri iletişim zenginleştirme ---
      const custUpdateIds = customers.slice(0, 18).map((c) => c.id)
      for (const cid of custUpdateIds) {
        const phone = chance(0.85) ? trPhone() : null
        const email = chance(0.7) ? `info@${(pick(['anadolu', 'marmara', 'ege', 'bogazici', 'toros', 'kristal', 'zaferyapi', 'dogus']) + pick(['grup', 'eticaret', 'insaat', 'teknoloji', 'lojistik'])).replace(/[^a-z]/g, '')}.com.tr` : null
        await db.customer.update({ where: { id: cid }, data: { phone, email } })
      }
      created['musteri-guncelleme'] = custUpdateIds.length

      // --- 1b. Deals — gerçekçi pipeline ---
      const dealTitles = [
        'CRM Geçiş Projesi', 'Kurumsal Lisans — Yıllık', '12 Aylık Bakım Sözleşmesi',
        'Satış Ekibi Eğitim Paketi', 'ERP Entegrasyon Danışmanlığı', 'Yıllık Destek Sözleşmesi',
        'Bulut Altyapı Yükseltmesi', 'Otomasyon Kurulumu', 'Pilot Proje — 3 Ay',
        'Kurumsal E-posta Göçü', 'Raporlama Modülü Lisansı', 'WhatsApp Entegrasyon Paketi',
      ]
      const stages = ['yeni', 'iletisim', 'teklif', 'muzakere', 'kazanıldı', 'kaybedildi']
      const lossReasons = ['Bütçe onayı alınamadı', 'Rakip firma daha uygun fiyat verdi', 'Proje ertelendi', 'Karşı taraf temsilci değiştirdi']
      const dealRows: {
        id: string; tenantId: string; title: string; customerId: string; value: number; stage: string; probability: number; expectedCloseDate: Date; ownerId: string; lossReason?: string; lossNote?: string; createdAt: Date; updatedAt: Date
      }[] = []
      const wonStages = stages.flatMap(() => [])
      for (let i = 0; i < 26; i++) {
        const stage =
          i < 5 ? 'yeni' : i < 9 ? 'iletisim' : i < 13 ? 'teklif' : i < 17 ? 'muzakere' : i < 23 ? 'kazanıldı' : 'kaybedildi'
        const isWon = stage === 'kazanıldı'
        const isLost = stage === 'kaybedildi'
        const prob = { yeni: 10, iletisim: 25, teklif: 45, muzakere: 70, 'kazanıldı': 100, kaybedildi: 0 }[stage] as number
        const closeDate = isWon ? dayAt(-ri(3, 50), 17) : isLost ? dayAt(-ri(5, 40), 17) : dayAt(ri(-4, 45), 17)
        dealRows.push({
          id: genId(),
          tenantId: crmTenantId,
          title: `${pick(dealTitles)}${chance(0.3) ? ` — ${pick(['2026', 'Q4', 'Kurumsal', 'Şube Ağı'])}` : ''}`,
          customerId: pick(customers).id,
          value: ri(4, 120) * 12500,
          stage,
          probability: prob,
          expectedCloseDate: closeDate,
          ownerId: pick(reps).id,
          ...(isLost ? { lossReason: pick(lossReasons), lossNote: chance(0.6) ? 'Müşteri tekrar dönüş için "yıl sonunda değerlendirelim" dedi.' : undefined } : {}),
          createdAt: dayAt(-ri(20, 90), ri(9, 18), ri(0, 59)),
          updatedAt: dayAt(-ri(0, 15), ri(9, 18), ri(0, 59)),
        })
      }
      await db.deal.createMany({ data: dealRows })
      created['firsatlar'] = dealRows.length

      // --- 1c. Aktiviteler — satış ekipleri gerçekten çalışıyor ---
      const actTypes = ['arama', 'arama', 'arama', 'toplanti', 'whatsapp', 'email', 'ziyaret', 'not'] as const
      const subjects: Record<string, string[]> = {
        arama: ['Fiyat teyidi için arandı', 'Teklif takibi', 'Yeni dönem tarifesi görüşüldü', 'Sipariş onayı alındı'],
        toplanti: ['Yerinde tanışma toplantısı', 'Demo sunumu yapıldı', 'Yıllık değerlendirme toplantısı', 'Sözleşme müzakeresi'],
        whatsapp: ['WhatsApp üzerinden katalog gönderildi', 'Proforma PDF iletildi', 'Hızlı fiyat sorusu yanıtlandı'],
        email: ['Resmi teklif e-postası gönderildi', 'Sözleşme taslağı iletildi', 'Sunum ve referans listesi gönderildi'],
        ziyaret: ['Şube ziyareti gerçekleştirildi', 'Depo yerinde inceleme', 'Yeni şube açılışına katılım'],
        not: ['Karar verici tatilde, Ekim başı dönüş bekleniyor', 'Rakip teklifi var, fiyat esnetilebilir', 'Muhasebe onayı bekleniyor'],
      }
      const outcomes = ['basarili', 'basarili', 'basarili', 'callback', 'ertelendi', 'basarisiz']
      const actRows: { id: string; tenantId: string; type: string; subject: string; detail: string; date: Date; durationMin: number; outcome: string; userId: string; customerId: string; dealId?: string; createdAt: Date }[] = []
      for (let i = 0; i < 48; i++) {
        const type = pick(actTypes)
        const deal = chance(0.55) ? pick(dealRows) : undefined
        actRows.push({
          id: genId(),
          tenantId: crmTenantId,
          type,
          subject: pick(subjects[type]),
          detail: chance(0.5) ? `${pick(['Müşteri olumlu baktı', 'Fiyat pazarlığı var', 'Karar süreci yönetim kurulunda', 'Ekim bütçesi açıldı', 'Termin öne alındı'])}.` : '',
          date: dayAt(-ri(0, 45), ri(9, 18), ri(0, 59)),
          durationMin: type === 'arama' ? ri(3, 15) : type === 'toplanti' ? ri(30, 90) : type === 'ziyaret' ? ri(45, 120) : 0,
          outcome: pick(outcomes),
          userId: pick(reps).id,
          customerId: deal ? deal.customerId : pick(customers).id,
          ...(deal ? { dealId: deal.id } : {}),
          createdAt: dayAt(-ri(0, 45), ri(9, 18), ri(0, 59)),
        })
      }
      await db.activity.createMany({ data: actRows })
      created['aktiviteler'] = actRows.length

      // --- 1d. Görevler — geciken + yaklaşan + tamamlanan ---
      const taskTitles = [
        'Teklif revizesi gönder', 'Sözleşme imzala', 'Muhasebe ile fatura uyumu kontrol et',
        'Yeni müşteri onboarding planı hazırla', 'Aylık satış raporunu sun', 'Demo ortamını hazırla',
        'Referans müşteri ara', 'Depo sayımına katıl', 'Kampanya metnini onaylat',
      ]
      const taskRows: { id: string; tenantId: string; title: string; dueDate: Date; assigneeId: string; customerId: string; priority: string; status: string; completedAt?: Date; createdAt: Date; updatedAt: Date }[] = []
      for (let i = 0; i < 17; i++) {
        const status = i < 5 ? 'acik' : i < 13 ? 'acik' : 'tamamlandi'
        const due = i < 5 ? dayAt(-ri(1, 6), 18) : i < 13 ? dayAt(ri(0, 9), ri(10, 18)) : dayAt(-ri(2, 12), 17)
        taskRows.push({
          id: genId(),
          tenantId: crmTenantId,
          title: pick(taskTitles),
          dueDate: due,
          assigneeId: pick(reps).id,
          customerId: pick(customers).id,
          priority: pick(['dusuk', 'orta', 'orta', 'yuksek', 'acil']),
          status,
          ...(status === 'tamamlandi' ? { completedAt: dayAt(-ri(2, 12), 16) } : {}),
          createdAt: dayAt(-ri(3, 20), ri(9, 18)),
          updatedAt: dayAt(-ri(0, 3), ri(9, 18)),
        })
      }
      await db.task.createMany({ data: taskRows })
      created['gorevler'] = taskRows.length

      // --- 1e. Giderler — 2 aylık gerçekçi işletme gideri ---
      const expRows: { id: string; tenantId: string; category: string; description: string; amount: number; date: Date; recurring?: string; vendor?: string; invoiceNo?: string; status: string; createdById?: string; createdAt: Date; updatedAt: Date }[] = []
      // Sabit aylık giderler (son 2 ay)
      for (const m of [0, 1]) {
        const base = m === 0 ? 0 : 30
        expRows.push({ id: genId(), tenantId: crmTenantId, category: 'kira', description: 'Ofis kirası — Kozyatağı', amount: 48000, date: dayAt(-base - 1, 10), recurring: 'monthly', vendor: 'Yapı A.Ş. Gayrimenkul', invoiceNo: `KR-${2026}${String(9 - m).padStart(2, '0')}`, status: 'odendi', createdAt: dayAt(-base - 1, 10), updatedAt: dayAt(-base - 1, 10) })
        expRows.push({ id: genId(), tenantId: crmTenantId, category: 'personel', description: 'Personel maaş ödemeleri', amount: 268000, date: dayAt(-base - 1, 9), recurring: 'monthly', vendor: 'Paso Hizmet', status: 'odendi', createdAt: dayAt(-base - 1, 9), updatedAt: dayAt(-base - 1, 9) })
        expRows.push({ id: genId(), tenantId: crmTenantId, category: 'fatura', description: `Elektrik faturası — ${m === 0 ? 'Eylül' : 'Ağustos'}`, amount: tl9(4200), date: dayAt(-base - 8, 11), vendor: 'Aydın Elektrik', invoiceNo: `EL${ri(100000, 999999)}`, status: 'odendi', createdAt: dayAt(-base - 8, 11), updatedAt: dayAt(-base - 8, 11) })
        expRows.push({ id: genId(), tenantId: crmTenantId, category: 'fatura', description: 'İnternet & telefon hatları', amount: tl9(2450), date: dayAt(-base - 6, 14), recurring: 'monthly', vendor: 'TurkNet', status: 'odendi', createdAt: dayAt(-base - 6, 14), updatedAt: dayAt(-base - 6, 14) })
      }
      // Değişken giderler
      const varExp: [string, string, number, string][] = [
        ['pazarlama', 'Meta reklamları — potansiyel müşteri kampanyası', 8500, 'Meta Platforms'],
        ['pazarlama', 'Google Ads — marka aramaları', 6200, 'Google'],
        ['malzeme', 'Kırtasiye & ofis malzemeleri', tl9(1200), 'Kırtasiye Dunyası'],
        ['malzeme', 'Sunum projesi — ekran & kablo', tl9(3400), 'Teknoloji Market'],
        ['diger', 'Yol, park & konaklamalar', tl9(2300), '—'],
        ['diger', 'Müşteri hediye setleri (çeyrek sonrası)', tl9(4600), 'Kurumsal Hediye'],
        ['sigorta', 'Ofis yangın sigortası yenileme', tl9(5800), 'Anadolu Sigorta'],
        ['vergi', 'Damga vergisi — sözleşmeler', tl9(950), '—'],
        ['fatura', 'Bulut sunucu aboneliği', tl9(1850), 'AWS'],
        ['pazarlama', 'Yerel fuar stant kiralaması', tl9(12500), 'Fuar Merkezi'],
      ]
      for (const [cat, desc, amt, vendor] of varExp) {
        const d = dayAt(-ri(1, 55), ri(9, 17))
        expRows.push({ id: genId(), tenantId: crmTenantId, category: cat, description: desc, amount: amt, date: d, vendor, invoiceNo: chance(0.7) ? `FT-${ri(2026100, 2026999)}` : undefined, status: d < dayAt(-20, 12) ? 'odendi' : pick(['odendi', 'beklemedi']), createdById: pick(reps).id, createdAt: d, updatedAt: d })
      }
      await db.expense.createMany({ data: expRows })
      created['giderler'] = expRows.length
    }
    await markDone('seed.realistic.crm')
  }

  // ============================================================
  // 2) KAFE — menü zenginleştirme + 3 haftalık sipariş geçmişi + rezervasyonlar
  // ============================================================
  if (cafe && !(await sectionDone('seed.realistic.cafe'))) {
    // --- 2a. tableCount düzelt ---
    await db.cafe.update({ where: { id: cafe.id }, data: { tableCount: 8 } })

    // --- 2b. Menü kategorileri & ürünleri ---
    const cats = await db.menuCategory.findMany({ where: { cafeId: cafe.id } })
    const catByName = new Map(cats.map((c) => [c.name, c.id]))
    async function ensureCat(name: string, sort: number): Promise<string> {
      if (catByName.has(name)) return catByName.get(name)!
      const id = genId()
      await db.menuCategory.create({ data: { id, cafeId: cafe!.id, name, sortOrder: sort } })
      catByName.set(name, id)
      return id
    }
    const kahvelerId = await ensureCat('Kahveler', 3)
    const sogukId = await ensureCat('Soğuk İçecekler', 4)
    const firinId = await ensureCat('Fırın & Atıştırmalık', 5)
    const kahvaltiId = catByName.get('Kahvaltı') ?? (await ensureCat('Kahvaltı', 1))
    const anaId = catByName.get('Ana Yemek') ?? (await ensureCat('Ana Yemek', 2))
    const tatliId = catByName.get('Tatlılar') ?? (await ensureCat('Tatlılar', 6))

    const menuSeed: [string, number, string, number][] = [
      // [category, sort, name, price]
      [kahvelerId, 10, 'Espresso', 70], [kahvelerId, 11, 'Americano', 85], [kahvelerId, 12, 'Cappuccino', 105],
      [kahvelerId, 13, 'Caffe Latte', 110], [kahvelerId, 14, 'Caramel Macchiato', 140], [kahvelerId, 15, 'White Mocha', 135],
      [kahvelerId, 16, 'Türk Kahvesi (orta şekerli)', 80], [kahvelerId, 17, 'Menengiç Kahvesi', 95], [kahvelerId, 18, 'Filtre Kahve', 95],
      [kahvelerId, 19, 'Cold Brew', 120], [kahvelerId, 20, 'Buzlu Latte', 125],
      [sogukId, 10, 'Ev Yapımı Limonata', 85], [sogukId, 11, 'Taze Sıkılmış Portakal Suyu', 95], [sogukId, 12, 'Şeftali Nektarı', 60],
      [sogukId, 13, 'Milkshake (çilek/çikolata)', 140], [sogukId, 14, 'Mango Smoothie', 155], [sogukId, 15, 'Maden Suyu', 25],
      [firinId, 10, 'Poğaça', 40], [firinId, 11, 'Simit', 25], [firinId, 12, 'Tereyağlı Kruvasan', 65],
      [firinId, 13, 'Tuzlu Kurabiye', 35], [firinId, 14, 'Fındıklı Kurabiye', 45],
      [kahvaltiId, 10, 'Sucuklu Yumurta', 130], [kahvaltiId, 11, 'Avokado Tost', 160], [kahvaltiId, 12, 'Peynirli Tost', 90],
      [kahvaltiId, 13, 'Granola Bowl', 145], [kahvaltiId, 14, 'Simit Tabağı (zeytin, peynir, domates)', 85],
      [anaId, 10, 'Makarna Arrabbiata', 190], [anaId, 11, 'Makarna Pesto', 210], [anaId, 12, 'Köri Soslu Tavuk', 265],
      [anaId, 13, 'Nachos (kıymalı)', 180], [anaId, 14, 'Babagannuş', 175],
      [tatliId, 10, 'Cheesecake (dilim)', 145], [tatliId, 11, 'San Sebastian', 165], [tatliId, 12, 'Çikolatalı Sufle', 135],
      [tatliId, 13, 'Fıstıklı Baklava (4 dilim)', 175], [tatliId, 14, 'Dondurma (3 top)', 110], [tatliId, 15, 'Waffle (muz-fındık)', 190],
    ]
    const menuItems = await db.menuItem.findMany({ where: { category: { cafeId: cafe.id } }, select: { name: true } })
    const existingNames = new Set(menuItems.map((m) => m.name))
    const newMenuRows = menuSeed
      .filter(([, , name]) => !existingNames.has(name))
      .map(([categoryId, sortOrder, name, price]) => ({ id: genId(), categoryId, name, price, isAvailable: true, sortOrder }))
    if (newMenuRows.length) await db.menuItem.createMany({ data: newMenuRows })
    created['menu-urun'] = newMenuRows.length

    // --- 2c. 3 haftalık sipariş geçmişi ---
    const allMenu = await db.menuItem.findMany({ where: { category: { cafeId: cafe.id } }, select: { id: true, name: true, price: true } })
    const tables = await db.cafeTable.findMany({ where: { cafeId: cafe.id }, select: { id: true, number: true, capacity: true } })
    const kasaUsers = await db.user.findMany({ where: { tenantId: cafe.tenantId }, select: { id: true } })

    // mevcut sipariş numaralarından devam et
    const existingOrders = await db.cafeOrder.findMany({ where: { cafeId: cafe.id }, select: { number: true } })
    let seq = 0
    for (const o of existingOrders) {
      const m = o.number?.match(/S-(\d+)/)
      if (m) seq = Math.max(seq, parseInt(m[1], 10))
    }

    const orderIds: string[] = []
    const orderItems: { id: string; orderId: string; menuItemId: string | null; name: string; qty: number; unitPrice: number; status: string; station: string }[] = []
    const payments: { id: string; orderId: string; amount: number; method: string; status: string; createdAt: Date }[] = []
    const orderRows: { id: string; cafeId: string; tableId: string | null; number: string; status: string; type: string; customerName?: string; subtotal: number; taxTotal: number; total: number; createdById?: string; createdAt: Date; updatedAt: Date; notes?: string }[] = []

    // Kahvaltı öğeleri 8-11, öğle 12-14, ikindi kahvesi 15-18, akşam 18-22
    const breakfast = allMenu.filter((m) => /Serpme|Menemen|Omlet|Tost|Yumurta|Avokado|Granola|Simit Tabağı|Poğaça|Simit|Kruvasan/i.test(m.name))
    const lunch = allMenu.filter((m) => /Köfte|Tavuk|Makarna|Nachos|Babagannuş|Köri/i.test(m.name))
    const coffee = allMenu.filter((m) => /Espresso|Americano|Cappuccino|Latte|Mocha|Kahvesi|Filtre|Cold Brew|Limonata|Smoothie|Milkshake|Portakal/i.test(m.name))
    const dessert = allMenu.filter((m) => /Cheesecake|Sebastian|Sufle|Baklava|Dondurma|Waffle|Kurabiye|Gofret/i.test(m.name))

    for (let d = -21; d <= 0; d++) {
      const isToday = d === 0
      const ordersToday = isToday ? 6 : ri(6, 11)
      // cuma-cumartesi yoğunluk
      const dow = dayAt(d, 12).getDay()
      const factor = dow === 5 || dow === 6 ? 1.35 : dow === 0 ? 1.15 : 1
      const n = Math.max(2, Math.round(ordersToday * factor))
      for (let k = 0; k < n; k++) {
        let hour: number
        const r = rng()
        if (r < 0.28) hour = ri(8, 11)
        else if (r < 0.58) hour = ri(12, 14)
        else if (r < 0.83) hour = ri(15, 18)
        else hour = ri(18, 21)
        const minute = pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
        const date = dayAt(d, hour, minute)
        if (isToday && date > new Date()) continue // bugünün ilerisi olmasın

        const type = chance(0.75) ? 'dine_in' : chance(0.6) ? 'takeaway' : 'delivery'
        const tableId = type === 'dine_in' && tables.length ? pick(tables).id : null
        seq++
        const isLive = isToday && k < 3
        const status = isLive ? (['acik', 'hazirlaniyor', 'hazir'] as const)[k] : chance(0.96) ? 'odendi' : 'iptal'
        const pool = hour <= 11 ? breakfast : hour <= 14 ? [...lunch, ...coffee] : hour <= 18 ? coffee : [...coffee, ...dessert]
        const itemCount = ri(1, 4)
        const chosen = new Set<string>()
        const items: { menuItemId: string | null; name: string; qty: number; unitPrice: number }[] = []
        for (let j = 0; j < itemCount; j++) {
          const mi = pick(pool.length ? pool : allMenu)
          if (chosen.has(mi.id)) continue
          chosen.add(mi.id)
          items.push({ menuItemId: mi.id, name: mi.name, qty: chance(0.25) ? 2 : 1, unitPrice: mi.price })
        }
        const subtotal = round2(items.reduce((s, it) => s + it.qty * it.unitPrice, 0))
        const taxTotal = round2((subtotal * 10) / 110) // KDV dahil %10
        const id = genId()
        orderIds.push(id)
        orderRows.push({
          id, cafeId: cafe.id, tableId, number: `S-${String(seq).padStart(3, '0')}`,
          status, type,
          ...(type !== 'dine_in' ? { customerName: fullName() } : {}),
          subtotal, taxTotal, total: subtotal,
          createdById: kasaUsers.length ? pick(kasaUsers).id : undefined,
          createdAt: date, updatedAt: date,
          ...(chance(0.12) ? { notes: pick(['Az şekerli', 'Soğuk olsun', 'Paket ayrı ayrı', 'Yanında buz']) } : {}),
        })
        for (const it of items) {
          orderItems.push({ id: genId(), orderId: id, menuItemId: it.menuItemId, name: it.name, qty: it.qty, unitPrice: it.unitPrice, status: isLive ? 'bekliyor' : 'servis_edildi', station: /Kahvesi|Espresso|Americano|Cappuccino|Latte|Mocha|Filtre|Cold Brew|Limonata|Smoothie|Milkshake|Portakal|Çay|Nektar|Soda|Maden/i.test(it.name) ? 'bar' : /Cheesecake|Sebastian|Sufle|Baklava|Dondurma|Waffle|Kurabiye/i.test(it.name) ? 'dessert' : 'kitchen' })
        }
        if (status === 'odendi') {
          payments.push({ id: genId(), orderId: id, amount: subtotal, method: chance(0.55) ? 'card' : 'cash', status: 'tamamlandi', createdAt: new Date(date.getTime() + 45 * 60000) })
        }
      }
    }
    await db.cafeOrder.createMany({ data: orderRows })
    if (orderItems.length) await db.cafeOrderItem.createMany({ data: orderItems })
    if (payments.length) await db.cafePayment.createMany({ data: payments })
    created['kafe-siparis'] = orderRows.length

    // --- 2d. Rezervasyonlar — bugün ve ileri tarih ---
    const resNames = ['Yıldız Hanım (doğum günü)', 'Kadıköy Kitap Kulübü', 'Ersan Bey — iş toplantısı', 'Deniz & arkadaşlar', 'Yıldırım ailesi', 'Bay Şen (yerin üstü)', 'Bahar Hanım — nişan kahvası', 'Okul veli toplantısı sonrası']
    const resRows: { id: string; cafeId: string; tableId: string | null; name: string; phone: string; partySize: number; date: Date; durationMin: number; status: string; source: string; note?: string }[] = []
    const resSpecs: [number, number, number, string][] = [
      // [günOfseti, saat, kişi, durum]
      [0, 13, 4, 'onaylandi'], [0, 16, 2, 'onaylandi'], [0, 19, 6, 'onaylandi'], [0, 20, 3, 'bekliyor'],
      [1, 10, 2, 'onaylandi'], [1, 13, 5, 'bekliyor'], [1, 19, 4, 'onaylandi'],
      [2, 12, 8, 'onaylandi'], [3, 15, 2, 'onaylandi'], [4, 18, 6, 'bekliyor'],
    ]
    for (let i = 0; i < resSpecs.length; i++) {
      const [doff, h, size, status] = resSpecs[i]
      const table = tables.length ? pick(tables) : null
      resRows.push({
        id: genId(), cafeId: cafe.id, tableId: table && size <= table.capacity ? table.id : null,
        name: resNames[i % resNames.length].split(' (')[0],
        phone: trPhone(), partySize: size,
        date: dayAt(doff, h, pick([0, 15, 30])),
        durationMin: size >= 6 ? 120 : 90,
        status, source: chance(0.6) ? 'telefon' : chance(0.5) ? 'web' : 'yüz yüze',
        ...(chance(0.5) ? { note: pick(['Doğum günü pastası getirilecek', 'Bebek arabası var, geniş masa', 'Pencere kenarı tercih eder', 'Fatura firmaya']) } : {}),
      })
    }
    await db.cafeReservation.createMany({ data: resRows })
    created['kafe-rezervasyon'] = resRows.length
    await markDone('seed.realistic.cafe')
  }

  // ============================================================
  // 3) MARKET — gerçekçi ürün kataloğu + 3 haftalık POS satışı + veresiye
  // ============================================================
  if (market && !(await sectionDone('seed.realistic.market'))) {
    const existingProducts = await db.product.findMany({ where: { tenantId: market.tenantId }, select: { id: true, name: true, sku: true, price: true, stock: true } })
    const existingNames = new Set(existingProducts.map((p) => p.name))

    const productSeed: [string, string, number, string, number][] = [
      // [name, category, price, unit, taxRate]
      ['Coca-Cola 1L', 'İçecek', 45, 'adet', 10], ['Coca-Cola Kutu 330ml', 'İçecek', 25, 'adet', 10],
      ['Sprite 1L', 'İçecek', 42, 'adet', 10], ['Şalgam Suyu 300ml', 'İçecek', 22, 'adet', 10],
      ['Su 5L', 'İçecek', 35, 'adet', 10], ['Su 0.5L', 'İçecek', 12, 'adet', 10],
      ['Vişne Suyu 1L', 'İçecek', 48, 'adet', 10], ['Soda 200ml', 'İçecek', 15, 'adet', 10],
      ['Pınar Labne 250g', 'Süt Ürünleri', 55, 'adet', 1], ['Sütaş Kefir 1L', 'Süt Ürünleri', 75, 'adet', 1],
      ['Kaşar Peyniri 500g', 'Süt Ürünleri', 289, 'adet', 1], ['Tereyağı 250g', 'Süt Ürünleri', 185, 'adet', 1],
      ['Nutella 350g', 'Kahvaltılık', 189, 'adet', 1], ['Süzme Bal 850g', 'Kahvaltılık', 320, 'adet', 1],
      ['Ülker Çikolata', 'Atıştırmalık', 45, 'adet', 10], ['Eti Burçak', 'Atıştırmalık', 35, 'adet', 10],
      ['Çay 500g', 'Kahvaltılık', 145, 'adet', 1], ['Nescafe 200g', 'Kahvaltılık', 189, 'adet', 10],
      ['Zeytinyağı 1L', 'Mutfak', 320, 'adet', 1], ['Ülker Gofret', 'Atıştırmalık', 25, 'adet', 10],
      ['Karışık Kuruyemiş 500g', 'Atıştırmalık', 210, 'adet', 1], ['Antep Fıstığı 250g', 'Atıştırmalık', 145, 'adet', 1],
      ['Omo Sıvı 3L', 'Temizlik', 289, 'adet', 20], ['Çamaşır Suyu 1L', 'Temizlik', 32, 'adet', 20],
      ['Bulaşık Deterjanı 750ml', 'Temizlik', 55, 'adet', 20], ['Cam Temizleyici', 'Temizlik', 45, 'adet', 20],
      ['Yumuşatıcı 2L', 'Temizlik', 95, 'adet', 20], ['Cif Krem', 'Temizlik', 65, 'adet', 20],
      ['Selpak 10\'lu', 'Kağıt Ürünleri', 95, 'paket', 20], ['Tualet Kağıdı 12\'li', 'Kağıt Ürünleri', 135, 'paket', 20],
      ['Peçete 100\'lü', 'Kağıt Ürünleri', 35, 'paket', 20], ['Alüminyum Folyo 30m', 'Kağıt Ürünleri', 55, 'adet', 20],
      ['Colgate Diş Macunu', 'Kişisel Bakım', 75, 'adet', 20], ['Şampuan 500ml', 'Kişisel Bakım', 95, 'adet', 20],
      ['Katı Sabun 4\'lü', 'Kişisel Bakım', 65, 'paket', 20],
      ['Makarna 500g', 'Mutfak', 22, 'adet', 1], ['Pirinç 1kg', 'Mutfak', 65, 'adet', 1],
      ['Bulgur 1kg', 'Mutfak', 48, 'adet', 1], ['Domates Salçası 700g', 'Mutfak', 78, 'adet', 1],
      ['Kırmızı Mercimek 1kg', 'Mutfak', 55, 'adet', 1], ['Un 1kg', 'Mutfak', 35, 'adet', 1],
      ['Toz Şeker 1kg', 'Mutfak', 42, 'adet', 1], ['Ayçiçek Yağı 5L', 'Mutfak', 489, 'adet', 1],
      ['Patates Kızartma 1kg', 'Dondurulmuş', 75, 'adet', 10], ['Hamsi 1kg (temiz)', 'Dondurulmuş', 210, 'kg', 1],
      ['Kedi Maması 1.5kg', 'Evcil', 189, 'adet', 20], ['Köpek Maması 3kg', 'Evcil', 289, 'adet', 20],
      ['Bez Çanta', 'Diğer', 15, 'adet', 20], ['Çakmak', 'Diğer', 30, 'adet', 20],
      ['Atıştırmalık Kuruyemiş 150g', 'Atıştırmalık', 68, 'adet', 10], ['Dondurmalı Gofret', 'Atıştırmalık', 38, 'adet', 10],
      ['Ekmek Kırıntısı', 'Mutfak', 28, 'adet', 1], ['Mısır Nişastası 400g', 'Mutfak', 38, 'adet', 1],
      ['Mis Kokulu Mum', 'Diğer', 89, 'adet', 20], ['Yanık Süt 1L', 'Süt Ürünleri', 48, 'adet', 1],
    ]
    const newProductRows = productSeed
      .filter(([name]) => !existingNames.has(name))
      .map(([name, category, price, unit, taxRate]) => ({
        id: genId(), tenantId: market.tenantId, name,
        sku: String(100 + ri(100, 899)),
        description: null as string | null,
        price, currency: 'TRY', taxRate, unit, category,
        stock: ri(0, 120),
        minStock: ri(5, 25),
      }))
    if (newProductRows.length) {
      await db.product.createMany({ data: newProductRows })
      await db.barcode.createMany({
        data: newProductRows.map((p) => ({ id: genId(), marketId: market.id, productId: p.id, code: trBarcode(), type: 'ean13' })),
      })
    }
    created['market-urun'] = newProductRows.length

    const products = await db.product.findMany({
      where: { tenantId: market.tenantId },
      select: { id: true, name: true, price: true, taxRate: true },
    })
    const barcodeMap = new Map<string, string>()
    const existingBarcodes = await db.barcode.findMany({ where: { productId: { in: products.map((p) => p.id) } }, select: { productId: true, code: true } })
    for (const b of existingBarcodes) barcodeMap.set(b.productId, b.code)
    const kasiyers = await db.user.findMany({ where: { tenantId: market.tenantId, role: { in: ['admin', 'kasiyer'] } }, select: { id: true } })

    // mevcut fiş no dizisinden devam
    const existingSales = await db.marketSale.findMany({ where: { marketId: market.id }, select: { number: true } })
    let fis = 0
    for (const s of existingSales) {
      const m = s.number?.match(/FIS-(\d+)/)
      if (m) fis = Math.max(fis, parseInt(m[1], 10))
    }

    // Ucuz ürünler daha sık satılır (ağırlıklı havuz)
    const weighted: typeof products = []
    for (const p of products) {
      const w = p.price <= 50 ? 6 : p.price <= 100 ? 4 : p.price <= 200 ? 2 : 1
      for (let i = 0; i < w; i++) weighted.push(p)
    }

    const saleRows: { id: string; marketId: string; number: string; type: string; status: string; subtotal: number; taxTotal: number; discount: number; total: number; paymentMethod: string; cashAmount: number; cardAmount: number; customerName?: string; userId?: string; createdAt: Date; updatedAt: Date }[] = []
    const saleItems: { id: string; saleId: string; productId: string; barcode: string; name: string; qty: number; unitPrice: number; taxRate: number; discount: number; lineTotal: number }[] = []

    for (let d = -21; d <= 0; d++) {
      const isToday = d === 0
      const dow = dayAt(d, 12).getDay()
      const n = Math.round((dow === 6 || dow === 0 ? 14 : 10) * rf(0.85, 1.15))
      for (let k = 0; k < n; k++) {
        const date = dayAt(d, ri(8, 22), ri(0, 59))
        if (isToday && date > new Date()) continue
        const itemCount = ri(1, 6)
        const items: { productId: string; barcode: string; name: string; qty: number; unitPrice: number; taxRate: number }[] = []
        const used = new Set<string>()
        for (let j = 0; j < itemCount; j++) {
          const p = pick(weighted)
          if (used.has(p.id)) continue
          used.add(p.id)
          const barcode = barcodeMap.get(p.id) ?? trBarcode()
          items.push({ productId: p.id, barcode, name: p.name, qty: chance(0.3) ? ri(2, 3) : 1, unitPrice: p.price, taxRate: p.taxRate })
        }
        const subtotal = round2(items.reduce((s, it) => s + it.qty * it.unitPrice, 0))
        const taxTotal = round2(items.reduce((s, it) => {
          const lineGross = it.qty * it.unitPrice
          return s + (lineGross * it.taxRate) / (100 + it.taxRate)
        }, 0))
        fis++
        const method = chance(0.45) ? 'cash' : chance(0.93) ? 'card' : 'mixed'
        const id = genId()
        saleRows.push({
          id, marketId: market.id, number: `FIS-${String(fis).padStart(4, '0')}`,
          type: 'satis', status: 'tamamlandi',
          subtotal, taxTotal, discount: 0, total: subtotal,
          paymentMethod: method,
          cashAmount: method === 'cash' ? subtotal : method === 'mixed' ? round2(subtotal / 2) : 0,
          cardAmount: method === 'card' ? subtotal : method === 'mixed' ? round2(subtotal / 2) : 0,
          userId: kasiyers.length ? pick(kasiyers).id : undefined,
          createdAt: date, updatedAt: date,
        })
        for (const it of items) {
          saleItems.push({ id: genId(), saleId: id, productId: it.productId, barcode: it.barcode, name: it.name, qty: it.qty, unitPrice: it.unitPrice, taxRate: it.taxRate, discount: 0, lineTotal: round2(it.qty * it.unitPrice) })
        }
      }
    }
    await db.marketSale.createMany({ data: saleRows })
    if (saleItems.length) await db.marketSaleItem.createMany({ data: saleItems })
    created['market-satis'] = saleRows.length

    // --- 3b. Veresiye defteri — mahalle gerçekleri ---
    const creditSpecs: [string, string, number | null, [string, number, number, number | null][], string][] = [
      // [ad, not, limit, hareketler[type, tutar, günOfseti, vadeGünOfseti], telefon]
      ['Kemal Usta (Terzi)', 'Mahalle terzisi — haftada 2-3 alışveriş', 3000, [['borc', 620, -18, -3], ['borc', 340, -9, 5], ['odeme', 400, -6, null]], trPhone()],
      ['Ayşe Teyze (3. Blok)', 'Site sakinleri — kredi limiti düşük tutuldu', 2000, [['borc', 850, -21, -5], ['borc', 600, -11, 4], ['odeme', 700, -8, null]], trPhone()],
      ['Hasan Abi (Taksici)', 'Gece vardiyası sonrası alıyor — vadesi geçti, hatırlat', 1500, [['borc', 320, -25, -10], ['odeme', 200, -15, null]], trPhone()],
      ['Zeynep Hanım (Eczacı)', 'Sık müşteri — limiti aşmak üzere', 5000, [['borc', 2100, -20, 0], ['borc', 1800, -8, 12], ['odeme', 900, -4, null]], trPhone()],
      ['Minibüs Durak Ekibi', 'Çay & su hesabı — ay sonunda toplu ödeme', 2500, [['borc', 480, -14, 3]], trPhone()],
    ]
    for (const [name, note, limit, entries, phone] of creditSpecs) {
      const cc = await db.creditCustomer.create({ data: { marketId: market.id, name, phone, note, creditLimit: limit } })
      for (const [type, amount, d, due] of entries) {
        await db.creditEntry.create({
          data: {
            customerId: cc.id, type, amount,
            ...(type === 'odeme' ? { method: pick(['nakit', 'havale']) } : { dueDate: dayAt(due ?? 0, 18) }),
            note: type === 'borc' ? 'POS veresiye satışı / manuel giriş' : null,
            createdAt: dayAt(d, ri(9, 20)),
          },
        })
      }
    }
    created['veresiye-musteri'] = creditSpecs.length
    await markDone('seed.realistic.market')
  }

  // ============================================================
  // 4) KUAFÖR — personel, hizmet, müşteri ve randevu geçmişi
  // ============================================================
  if (provider && !(await sectionDone('seed.realistic.kuafor'))) {
    await db.serviceProvider.update({ where: { id: provider.id }, data: { email: 'info@sikkuaforsalonu.com' } })

    // --- 4a. Personel & hizmet zenginleştirme ---
    const staffExisting = await db.staff.findMany({ where: { providerId: provider.id } })
    const staffNames = new Set(staffExisting.map((s) => s.name))
    const addStaff: [string, string][] = [
      ['Seda Yılmaz', 'Renk Uzmanı'],
      ['Nazlı Doğan', 'Manikür & Pedikür Uzmanı'],
    ]
    for (const [name, title] of addStaff) {
      if (!staffNames.has(name)) await db.staff.create({ data: { providerId: provider.id, name, title, phone: trPhone(), isActive: true } })
    }
    const staffAll = await db.staff.findMany({ where: { providerId: provider.id } })

    const svcExisting = await db.service.findMany({ where: { providerId: provider.id } })
    const svcNames = new Set(svcExisting.map((s) => s.name))
    const addSvc: [string, number, number, string][] = [
      ['Fön & Şekillendirme', 300, 40, 'Saç'],
      ['Sakal Dizaynı', 200, 25, 'Sakal'],
      ['Keratin Bakımı', 1200, 120, 'Saç'],
      ['Çocuk Saç Kesimi', 120, 25, 'Saç'],
      ['Ağda — Yüz', 150, 20, 'Cilt'],
      ['Saç Bakım Maskesi', 350, 30, 'Saç'],
      ['Perma', 900, 120, 'Saç'],
    ]
    for (const [name, price, duration, category] of addSvc) {
      if (!svcNames.has(name)) await db.service.create({ data: { providerId: provider.id, name, price, duration, category, isActive: true } })
    }
    const svcAll = await db.service.findMany({ where: { providerId: provider.id } })

    // personel-hizmet eşlemesi
    const byName = (n: string) => svcAll.find((s) => s.name.startsWith(n))
    const svcMap: Record<string, string[]> = {
      'Ahmet Usta': ['Saç Kesimi', 'Sakal', 'Çocuk'],
      'Ayşe Hanım': ['Saç Boyama', 'Fön', 'Keratin', 'Perma', 'Bakım Maskesi'],
      'Mehmet Bey': ['Saç Kesimi', 'Sakal', 'Fön'],
      'Seda Yılmaz': ['Saç Boyama', 'Fön', 'Keratin', 'Bakım Maskesi', 'Cilt'],
      'Nazlı Doğan': ['Manikür', 'Pedikür', 'Ağda', 'Cilt'],
    }
    for (const st of staffAll) {
      const svcNamesForStaff = svcMap[st.name] ?? []
      for (const sn of svcNamesForStaff) {
        const svc = byName(sn)
        if (!svc) continue
        const dup = await db.staffService.findFirst({ where: { staffId: st.id, serviceId: svc.id } })
        if (!dup) await db.staffService.create({ data: { staffId: st.id, serviceId: svc.id } })
      }
    }

    // --- 4b. Gerçekçi randevu müşterileri ---
    const apptCustomerSeed: [string, string, string, string][] = [
      ['Elif Yıldırım', 'Bitkisel boya tercih eder; amonyaklı boyaya alerjisi var', 'VIP', '04-12'],
      ['Murat Şahin', 'Her 3 haftada bir sakal dizaynı — sabit müşteri', 'Sabit müşteri', ''],
      ['Zeynep Kaya', 'Fön sonrası düzleştirici kullanmıyor, doğal kuruma', 'Sabit müşteri', '07-21'],
      ['Hakan Özdemir', 'Saç kesimi 2 numara makine, üstte makas', 'Sabit müşteri', ''],
      ['Selin Arslan', 'Keratin bakımı 4 ayda bir; kuaför koltuğu pencere kenarı', 'VIP', '11-02'],
      ['Emre Çelik', 'Çocukla geliyor, aynı anda iki koltuk lazım', '', ''],
      ['Derya Aslan', 'Manikürde jant tercih ediyor', 'Sabit müşteri', '01-18'],
      ['Kerem Doğan', 'Sadece Ahmet Ustaya geliyor', 'Sabit müşteri', ''],
      ['Gizem Kurt', 'İlk kez geliyor — Instagram kampanyasıyla', '', ''],
      ['Baran Özkan', 'Perma denedi, memnun kaldı; tekrar planlanacak', '', ''],
      ['Nil Şimşek', 'Ağda hassasiyeti var, öncesi sakinleştirici krem', '', ''],
      ['Tarık Koç', 'Kurumsal — firma faturası ister', 'VIP', ''],
    ]
    const apptCustomers: Record<string, string> = {}
    for (const [name, notes, tag, birthday] of apptCustomerSeed) {
      const phone = trPhone()
      const phoneDigits = phone.replace(/\D/g, '')
      const found = await db.appointmentCustomer.findFirst({ where: { providerId: provider.id, phoneDigits } })
      if (found) {
        apptCustomers[name] = found.id
        continue
      }
      const rec = await db.appointmentCustomer.create({
        data: { providerId: provider.id, name, phone, phoneDigits, notes, tags: tag ? JSON.stringify([tag]) : null, ...(birthday ? { birthday } : {}) },
      })
      apptCustomers[name] = rec.id
    }

    // --- 4c. Randevu geçmişi (14 gün) + bugün + gelecek haft ---
    const validPairs: { staffId: string; serviceId: string; duration: number; price: number }[] = []
    for (const st of staffAll) {
      const ss = await db.staffService.findMany({ where: { staffId: st.id }, include: { service: true } })
      for (const link of ss) {
        validPairs.push({ staffId: st.id, serviceId: link.service.id, duration: link.service.duration, price: link.service.price })
      }
    }

    const rows: { id: string; providerId: string; customerId?: string; staffId: string; serviceId: string; customerName: string; customerPhone: string; date: Date; endTime: Date; status: string; price: number; source: string; createdAt: Date; updatedAt: Date; notes?: string }[] = []
    const custNames = Object.keys(apptCustomers)
    async function addAppt(d: number, h: number, m: number, status: string, source?: string, notes?: string, pickPair?: number) {
      const pair = validPairs[pickPair ?? ri(0, validPairs.length - 1)]
      const custName = pick(custNames)
      const cust = await db.appointmentCustomer.findUnique({ where: { id: apptCustomers[custName] } })
      const date = dayAt(d, h, m)
      rows.push({
        id: genId(), providerId: provider!.id,
        customerId: apptCustomers[custName], staffId: pair.staffId, serviceId: pair.serviceId,
        customerName: cust?.name ?? custName, customerPhone: cust?.phone ?? trPhone(),
        date, endTime: new Date(date.getTime() + pair.duration * 60000),
        status, price: pair.price,
        source: source ?? pick(['web', 'phone', 'phone', 'walk_in']),
        createdAt: dayAt(d - ri(0, 3), ri(10, 20)),
        updatedAt: dayAt(d, h, m),
        ...(notes ? { notes } : {}),
      })
    }

    // geçmiş 14 gün: gerçekleştirilmiş randevular
    for (let d = -14; d < 0; d++) {
      const dow = dayAt(d, 12).getDay()
      if (dow === 0) continue // pazar kapalı
      const n = dow === 6 ? ri(4, 6) : ri(3, 5)
      for (let k = 0; k < n; k++) {
        const status = chance(0.86) ? 'tamamlandi' : chance(0.5) ? 'gelmedi' : 'iptal'
        await addAppt(d, ri(9, 17), pick([0, 30]), status, undefined, status === 'gelmedi' ? 'Habersiz gelmedi — not düştü' : undefined)
      }
    }
    // bugün: 6 randevu (1 tanesi beklemede, diğerleri onaylı)
    const todaySpecs: [number, number, string][] = [[10, 0, 'tamamlandi'], [11, 30, 'tamamlandi'], [13, 0, 'onaylandi'], [14, 30, 'onaylandi'], [16, 0, 'beklemede'], [17, 30, 'onaylandi']]
    for (const [h, m, status] of todaySpecs) {
      if (status === 'tamamlandi' && new Date() < dayAt(0, h, m)) continue
      await addAppt(0, h, m, status)
    }
    // gelecek 7 gün
    for (let d = 1; d <= 7; d++) {
      const dow = dayAt(d, 12).getDay()
      if (dow === 0) continue
      const n = dow === 6 ? ri(4, 6) : ri(3, 5)
      for (let k = 0; k < n; k++) {
        await addAppt(d, ri(9, 17), pick([0, 30]), chance(0.7) ? 'onaylandi' : 'beklemede')
      }
    }
    if (rows.length) await db.appointment.createMany({ data: rows })
    created['kuaför-randevu'] = rows.length
    await markDone('seed.realistic.kuafor')
  }

  // ============================================================
  // 5) SİTE — bloklar, daireler, sakinler, aidat, talepler, duyurular
  // ============================================================
  if (parkSite && !(await sectionDone('seed.realistic.site'))) {
    const blocks = await db.block.findMany({ where: { siteId: parkSite.id } })
    const blockA = blocks.find((b) => b.name.includes('A')) ?? blocks[0]
    const blockB = blocks.find((b) => b.name.includes('B')) ?? blocks[1]

    // C Blok ekle
    let blockC = blocks.find((b) => b.name.includes('C'))
    if (!blockC) blockC = await db.block.create({ data: { siteId: parkSite.id, name: 'C Blok', floors: 8 } })

    // Yeni daireler (A/B tamamlanıyor + C)
    const existingApts = await db.apartment.findMany({ where: { siteId: parkSite.id }, select: { blockId: true, number: true } })
    const aptKey = (blockId: string, num: string) => `${blockId}:${num}`
    const existingKeys = new Set(existingApts.map((a) => aptKey(a.blockId, a.number)))
    const newApts: { id: string; blockId: string; siteId: string; number: string; floor: number; type: string; area: number }[] = []
    const plans: [string | undefined, number[]][] = [
      [blockA?.id, [7, 8]],
      [blockB?.id, [5, 6, 7, 8]],
      [blockC.id, [1, 2, 3, 4, 5, 6]],
    ]
    for (const [bid, nums] of plans) {
      if (!bid) continue
      for (const num of nums) {
        if (existingKeys.has(aptKey(bid, String(num)))) continue
        newApts.push({ id: genId(), blockId: bid, siteId: parkSite.id, number: String(num), floor: ((num - 1) % 5) + 1, type: 'daire', area: pick([95, 110, 125, 140]) })
      }
    }
    if (newApts.length) await db.apartment.createMany({ data: newApts })
    created['daire'] = newApts.length

    // Sakinler — TC'li mal sahipleri + kiracılar
    const residentsExisting = await db.resident.findMany({ where: { siteId: parkSite.id } })
    const resNames = new Set(residentsExisting.map((r) => r.name))
    const residentRows: [string, string, boolean][] = [
      [fullName(), 'mal_sahibi', true], [fullName(), 'kiraci', false], [fullName(), 'mal_sahibi', true],
      [fullName(), 'kiraci', false], [fullName(), 'mal_sahibi', true], [fullName(), 'mal_sahibi', true],
      [fullName(), 'kiraci', false], [fullName(), 'mal_sahibi', true], [fullName(), 'kiraci', false],
      [fullName(), 'mal_sahibi', true],
    ]
    const newResidentIds: string[] = []
    for (const [name, type, isOwner] of residentRows) {
      if (resNames.has(name)) continue
      const rec = await db.resident.create({
        data: {
          tenantId: parkSite.tenantId, siteId: parkSite.id, name,
          phone: trPhone(),
          email: chance(0.7) ? `${name.toLowerCase().replace(/[^a-z]/g, '.')}@gmail.com` : null,
          type, isOwner,
          ...(isOwner ? { tcKimlikNo: String(ri(100, 999)) + String(ri(10000000000, 99999999999)) } : { moveInDate: dayAt(-ri(30, 900), 12) }),
          notes: chance(0.3) ? pick(['Evde teslimat yoğun', 'Evcil hayvan: kedi', 'Gece vardiyasında çalışıyor — gürültüye hassas']) : null,
        },
      })
      newResidentIds.push(rec.id)
    }
    created['sakin'] = newResidentIds.length

    // Sakinleri dairelere ata
    const apts = await db.apartment.findMany({ where: { siteId: parkSite.id, residentId: null }, select: { id: true } })
    const assignIds = newResidentIds.slice(0, apts.length)
    for (let i = 0; i < assignIds.length; i++) {
      await db.apartment.update({ where: { id: apts[i].id }, data: { residentId: assignIds[i] } })
    }

    // Site personeli
    const staffCount = await db.siteStaff.count({ where: { siteId: parkSite.id } })
    if (staffCount === 0) {
      await db.siteStaff.createMany({
        data: [
          { siteId: parkSite.id, name: 'Bahri Uçar', role: 'kapici', phone: trPhone(), salary: 22000, startDate: dayAt(-700, 9) },
          { siteId: parkSite.id, name: 'Ramazan Tekin', role: 'guvenlik', phone: trPhone(), salary: 24500, startDate: dayAt(-400, 9), notes: 'Gece nöbeti 22:00-08:00' },
          { siteId: parkSite.id, name: 'Murat Efe', role: 'teknik', phone: trPhone(), salary: 31000, startDate: dayAt(-250, 9), notes: 'Asansör & hidrofor bakımı' },
          { siteId: parkSite.id, name: 'Sultan Gezer', role: 'temizlik', phone: trPhone(), salary: 19500, startDate: dayAt(-150, 9) },
        ],
      })
      created['site-personel'] = 4
    }

    // Aidatlar — son 4 ay her daire için
    const allApts = await db.apartment.findMany({ where: { siteId: parkSite.id }, select: { id: true, residentId: true, area: true } })
    const existingDues = await db.dues.findMany({ where: { siteId: parkSite.id }, select: { apartmentId: true, month: true, year: true } })
    const duesKey = (aid: string, m: number, y: number) => `${aid}:${m}:${y}`
    const duesSet = new Set(existingDues.map((d) => duesKey(d.apartmentId, d.month, d.year)))
    const now = new Date()
    const months: [number, number, number][] = [] // [month, year, offset]
    for (let off = 3; off >= 0; off--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - off, 1)
      months.push([dt.getMonth() + 1, dt.getFullYear(), off])
    }
    const duesRows: { id: string; siteId: string; apartmentId: string; residentId: string | null; month: number; year: number; amount: number; dueDate: Date; status: string; paidDate?: Date; paidAmount?: number; paymentMethod?: string }[] = []
    for (const apt of allApts) {
      for (const [m, y, off] of months) {
        if (duesSet.has(duesKey(apt.id, m, y))) continue
        const amount = 1850 + Math.round((apt.area ?? 100) * 1.2)
        const dueDate = new Date(y, m - 1, 10, 12)
        let status = 'odenmedi'
        let paidDate: Date | undefined
        let paidAmount: number | undefined
        let paymentMethod: string | undefined
        if (off > 0) {
          // eski aylar: çoğu ödendi, birkaç gecikmiş
          if (chance(0.82)) {
            status = 'odendi'
            paidDate = new Date(y, m - 1, ri(3, 12), 14)
            paidAmount = amount
            paymentMethod = pick(['bank', 'cash', 'online'])
          } else {
            status = 'gecikti'
          }
        } else {
          // bu ay: yarısı ödedi
          if (chance(0.5)) {
            status = 'odendi'
            paidDate = dayAt(-ri(0, 8), 15)
            paidAmount = amount
            paymentMethod = pick(['bank', 'online', 'cash'])
          }
        }
        duesRows.push({ id: genId(), siteId: parkSite.id, apartmentId: apt.id, residentId: apt.residentId, month: m, year: y, amount, dueDate, status, ...(paidDate ? { paidDate, paidAmount, paymentMethod } : {}) })
      }
    }
    if (duesRows.length) await db.dues.createMany({ data: duesRows })
    created['aidat'] = duesRows.length

    // Gerçekçi talepler
    const complaintSeed: [string, string, string, string, string, number | null, number | null][] = [
      ['A blok asansörü korkuluk sallanıyor', '2. kattan itibaren korkuluk oynuyor, çocuklu aileler tedirgin.', 'asansor', 'acik', 'acil', null, null],
      ['B blok çatı su kaçağı', 'Yağmurda 5. kat dairede tavan lekeniyor. İzolasyon kontrolü lazım.', 'su', 'inceleniyor', 'yuksek', 8500, null],
      ['Otoparkta yabancı araçlar', 'Misafir parkı dışında b blok önüne sürekli dış araç park ediyor.', 'park', 'acik', 'normal', null, null],
      ['Çöp konteyneri kokusuz hale gelmiyor', 'Konteyner alanı haftada 2 kez yıkanmalı.', 'temizlik', 'cozuldu', 'normal', 1200, 1350],
      ['Koridorda ampul arızaları', '2. kat ve 4. kat koridor ampulleri yanmıyor.', 'elektrik', 'cozuldu', 'dusuk', 300, 240],
      ['Gece gürültüsü şikâyeti (C blok)', 'Hafta sonu 01:00 sonrası terasta müzik. Sakin uyarısı yapıldı.', 'gurultu', 'inceleniyor', 'normal', null, null],
      ['Hidrofor sesi arttı', 'Su basıncı düşük ve hidrofor gürültülü çalışıyor.', 'su', 'acik', 'yuksek', 4200, null],
    ]
    const techStaff = await db.siteStaff.findFirst({ where: { siteId: parkSite.id, role: 'teknik' } })
    const cleaningStaff = await db.siteStaff.findFirst({ where: { siteId: parkSite.id, role: 'temizlik' } })
    const residents2 = await db.resident.findMany({ where: { siteId: parkSite.id }, select: { id: true } })
    for (const [title, description, category, status, priority, est, act] of complaintSeed) {
      await db.complaint.create({
        data: {
          siteId: parkSite.id,
          residentId: chance(0.8) ? pick(residents2).id : null,
          title, description, category, status, priority,
          ...(status === 'cozuldu' ? { resolvedAt: dayAt(-ri(1, 10), 16) } : {}),
          ...(assignedFor(category, techStaff?.id, cleaningStaff?.id) ? { assignedStaffId: assignedFor(category, techStaff?.id, cleaningStaff?.id)! } : {}),
          ...(est ? { estimatedCost: est } : {}),
          ...(act ? { actualCost: act } : {}),
          ...(status !== 'cozuldu' ? { dueDate: dayAt(ri(2, 12), 18) } : {}),
        },
      })
    }
    created['talep'] = complaintSeed.length

    // Duyurular
    await db.announcement.createMany({
      data: [
        { siteId: parkSite.id, title: 'Asansör Yıllık Bakımı — Perşembe', content: 'Sayın sakinlerimiz, A ve B blok asansörlerinde perşembe günü 10:00-16:00 arası yıllık bakım yapılacaktır. Bakım süresince asansör kullanılamayacaktır. Anlayışınız için teşekkür ederiz.', type: 'bakim', isPinned: true, publishDate: dayAt(-2, 9), expiryDate: dayAt(5, 18) },
        { siteId: parkSite.id, title: 'Ekim Ayı Aidat Bordrosu', content: 'Ekim ayı aidat bordrosu sakin paneline yüklenmiştir. Ödemeler için son tarih 10 Ekim. Gecikme zammı uygulanmadan önce ödeme yapılmasını rica ederiz.', type: 'aidat', isPinned: true, publishDate: dayAt(-5, 9), expiryDate: dayAt(20, 18) },
        { siteId: parkSite.id, title: 'Su Kesintisi — Hidrofor Bakımı', content: 'Cumartesi 09:00-13:00 arasında hidrofor bakımı nedeniyle su kesintisi yaşanacaktır. Lütfen önceden su ihtiyacınızı karşılayın.', type: 'acil', publishDate: dayAt(-8, 9), expiryDate: dayAt(-4, 18) },
        { siteId: parkSite.id, title: 'Site Bahçesi Düzenleme Günü', content: 'Bu pazar günü saat 11:00\'de bahçe düzenleme etkinliği düzenliyoruz. Katılmak isteyen sakinlerimiz kapıcı dairesine kayıt yaptırabilir. Sonrasında ikram olacak.', type: 'etkinlik', publishDate: dayAt(-10, 9), expiryDate: dayAt(4, 20) },
      ],
    })
    created['duyuru'] = 4
    await markDone('seed.realistic.site')
  }

  // işaretle
  await markDone(markerKey)

  return { message: `Gerçekçi demo verisi yüklendi: ${Object.entries(created).map(([k, v]) => `${k}=${v}`).join(', ')}`, created }
}

function assignedFor(category: string, techId?: string, cleaningId?: string): string | null {
  if (category === 'asansor' || category === 'su' || category === 'elektrik') return techId ?? null
  if (category === 'temizlik') return cleaningId ?? null
  return null
}
