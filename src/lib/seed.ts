// Demo veri üretimi — GNC CRM
// 2 şirket, 8 kullanıcı, 30 müşteri, 100 aktivite, leads, deals, tasks, 3 maps araması

import { db } from './db'
import { getRolePermissions, getAdminPermissionsForTenant, generateEmployeeCode } from './rbac'
import { mockMapsSearch } from './maps-mock'

const FIRST_NAMES = ['Mehmet', 'Ayşe', 'Mustafa', 'Fatma', 'Ahmet', 'Emine', 'Ali', 'Zeynep', 'Hüseyin', 'Hatice', 'İbrahim', 'Elif', 'Hasan', 'Meryem', 'Murat', 'Sultan']
const LAST_NAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara']

const COMPANY_SUFFIXES = ['A.Ş.', 'Ltd. Şti.', 'San. Tic.', 'Grup', 'Holding']
const COMPANY_PREFIXES = [
  'Anadolu', 'Marmara', 'Ege', 'Akdeniz', 'Karadeniz', 'İstanbul', 'Başkent',
  'Boğaziçi', 'Çamlıca', 'Uludağ', 'Toros', 'Kapadokya', 'Pamukkale', 'Nemrut',
  'Yıldız', 'Demir', 'Altın', 'Gümüş', 'Kristal', 'Safir', 'Zümrüt', 'Yakut',
]

const SECTORS = ['Sağlık', 'Diş Sağlığı', 'Güzellik & Bakım', 'Restoran & Kafe', 'Perakende', 'E-Ticaret', 'İnşaat & Gayrimenkul', 'Otomotiv', 'Eğitim', 'Teknoloji & Yazılım', 'Finans & Muhasebe', 'Hukuk', 'Lojistik & Taşımacılık', 'Üretim', 'Turizm & Otelcilik']

const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep']

const STREETS = ['Atatürk Bulvarı', 'Cumhuriyet Caddesi', 'Gazi Caddesi', 'İnönü Caddesi', 'Fatih Caddesi', 'Mithatpaşa Caddesi', 'Halitpaşa Caddesi', 'Zafer Caddesi']

const TAG_POOL = ['VIP Müşteri', 'Yıllık Sözleşme', 'Ödeme Problemi', 'Teklif Bekliyor', 'Yeni Müşteri', 'Sadık', 'Referans', 'Sıcak Lead', 'Soğuk Lead', 'Fırsat']

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomName(): string {
  return `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`
}

function randomCompanyName(): string {
  return `${rand(COMPANY_PREFIXES)} ${rand(COMPANY_SUFFIXES)}`
}

function randomPhone(): string {
  return `+90 5${randInt(3, 5)}${randInt(0, 9)} ${randInt(100, 999)} ${randInt(10, 99)} ${randInt(10, 99)}`
}

function randomEmail(name: string): string {
  const slug = name.toLowerCase()
    .replace('ı', 'i').replace('ş', 's').replace('ç', 'c')
    .replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o')
    .replace(/[^a-z0-9]/g, '.')
  return `${slug}@${rand(['gmail.com', 'outlook.com', 'hotmail.com', 'yandex.com'])}`
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(randInt(8, 18), randInt(0, 59))
  return d
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

export async function runSeed(): Promise<{ success: boolean; message: string; counts: Record<string, number> }> {
  // Önce temizle — bağımlılık sırasına göre
  // Kafe ERP
  await db.cafeOrderItem.deleteMany()
  await db.cafePayment.deleteMany()
  await db.cafeOrder.deleteMany()
  await db.menuItem.deleteMany()
  await db.menuCategory.deleteMany()
  await db.cafeTable.deleteMany()
  await db.cafe.deleteMany()
  // Market ERP
  await db.marketReturn.deleteMany()
  await db.marketSaleItem.deleteMany()
  await db.marketSale.deleteMany()
  await db.posShift.deleteMany()
  await db.stockCountItem.deleteMany()
  await db.stockCount.deleteMany()
  await db.purchaseItem.deleteMany()
  await db.purchase.deleteMany()
  await db.shelfItem.deleteMany()
  await db.shelf.deleteMany()
  await db.barcode.deleteMany()
  await db.market.deleteMany()
  // ERP
  await db.productionItem.deleteMany()
  await db.invoiceLine.deleteMany()
  await db.invoice.deleteMany()
  await db.quoteLine.deleteMany()
  await db.quote.deleteMany()
  await db.orderTrackingStep.deleteMany()
  await db.order.deleteMany()
  await db.stockMovement.deleteMany()
  await db.product.deleteMany()
  await db.messageTemplate.deleteMany()
  await db.tenantSetting.deleteMany()
  // CRM
  await db.task.deleteMany()
  await db.note.deleteMany()
  await db.activity.deleteMany()
  await db.deal.deleteMany()
  await db.contact.deleteMany()
  await db.lead.deleteMany()
  await db.mapsSearch.deleteMany()
  await db.attachment.deleteMany()
  await db.message.deleteMany()
  await db.customer.deleteMany()
  await db.tag.deleteMany()
  await db.auditLog.deleteMany()
  await db.user.deleteMany()
  await db.tenant.deleteMany()

  // Randevu sistemi
  await db.appointment.deleteMany()
  await db.staffService.deleteMany()
  await db.staff.deleteMany()
  await db.service.deleteMany()
  await db.serviceProvider.deleteMany()

  // Site yönetimi (delete order: en alt ilişki → en üst)
  await db.residentMessage.deleteMany()
  await db.complaint.deleteMany()
  await db.announcement.deleteMany()
  await db.dues.deleteMany()
  await db.siteStaff.deleteMany()
  await db.apartment.deleteMany()
  await db.block.deleteMany()
  await db.resident.deleteMany()
  await db.site.deleteMany()


  // === TENANTS — Her sektör ayrı şirket ===
  const tenant1 = await db.tenant.create({
    data: {
      name: 'Anadolu Satış A.Ş. (CRM/ERP)',
      plan: 'enterprise',
      defaultCurrency: 'TRY',
      country: 'TR',
    },
  })
  const tenant2 = await db.tenant.create({
    data: {
      name: 'Ege Ticaret Ltd. Şti. (CRM/ERP)',
      plan: 'business',
      defaultCurrency: 'TRY',
      country: 'TR',
    },
  })
  const tenantCafe = await db.tenant.create({
    data: {
      name: 'Şık Kafe & Restoran',
      plan: 'business',
      defaultCurrency: 'TRY',
      country: 'TR',
    },
  })
  const tenantMarket = await db.tenant.create({
    data: {
      name: 'Anadolu Market Zinciri',
      plan: 'business',
      defaultCurrency: 'TRY',
      country: 'TR',
    },
  })
  const tenantRandevu = await db.tenant.create({
    data: {
      name: 'Şık Kuaför & Güzellik Merkezi',
      plan: 'business',
      defaultCurrency: 'TRY',
      country: 'TR',
    },
  })
  const tenantSite = await db.tenant.create({
    data: {
      name: 'Park Sitesi Yönetimi',
      plan: 'business',
      defaultCurrency: 'TRY',
      country: 'TR',
    },
  })

  // === GNC PLATFORM TENANT — Program Admini (superadmin) buraya bağlı ===
  // Bu tenant "platform" sektöründedir — tüm şirketleri yöneten üst düzey
  // superadmin kullanıcısı (Program Admini) bu tenant'a bağlıdır.
  // getTenantSector("GNC Süperapp Platform") → 'crm' döner (varsayılan),
  // ama superadmin tüm yetkilere sahip olduğu için sektör filtresi onu
  // kısıtlayamaz. Bu tenant'ın sektörü "platform"dur (bilgi amaçlı).
  const tenantPlatform = await db.tenant.create({
    data: {
      name: 'GNC Süperapp Platform',
      plan: 'enterprise',
      defaultCurrency: 'TRY',
      country: 'TR',
    },
  })

  // === PROGRAM ADMİNİ (superadmin) — TÜM şirketleri ve modülleri görür ===
  // Admin Paneli + Dağıtım Merkezi yalnızca bu kullanıcıya açıktır.
  const programAdmin = await db.user.create({
    data: {
      tenantId: tenantPlatform.id,
      // Program Admini giriş kimliği: admin (veya admin@gnccrm.app) — şifre: 314159
      email: 'admin@gnccrm.app',
      name: 'Program Admini',
      role: 'superadmin',
      permissions: JSON.stringify(getRolePermissions('superadmin')),
      status: 'active',
      title: 'Program Yöneticisi',
      employeeCode: 'GNC-001',
      phone: '+90 530 000 00 01',
    },
  })
  void programAdmin

  // === USERS ===
  // Tenant 1: Admin, 2 Müdür, 4 Temsilci
  const t1Admin = await db.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'demo@anadolu.com',
      name: 'Demir Yıldız',
      role: 'admin',
      permissions: JSON.stringify(getAdminPermissionsForTenant(tenant1.name)),
      status: 'active',
      title: 'Satış Direktörü',
      phone: '+90 532 111 22 33',
    },
  })

  const t1Manager1 = await db.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'ayse.kaya@anadolu.com',
      name: 'Ayşe Kaya',
      role: 'manager',
      permissions: JSON.stringify(getRolePermissions('manager')),
      managerId: t1Admin.id,
      status: 'active',
      title: 'Satış Müdürü',
      phone: '+90 533 222 33 44',
    },
  })

  const t1Manager2 = await db.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'mustafa.demir@anadolu.com',
      name: 'Mustafa Demir',
      role: 'manager',
      permissions: JSON.stringify(getRolePermissions('manager')),
      managerId: t1Admin.id,
      status: 'active',
      title: 'Bölge Satış Müdürü',
      phone: '+90 534 333 44 55',
    },
  })

  const t1Reps = []
  const repNames1 = ['Zeynep Arslan', 'Ahmet Çelik', 'Elif Şahin', 'Burak Öztürk']
  const repTitles1 = ['Satış Temsilcisi', 'Kıdemli Satış Temsilcisi', 'Satış Temsilcisi', 'Satış Temsilcisi']
  for (let i = 0; i < repNames1.length; i++) {
    const manager = i < 2 ? t1Manager1 : t1Manager2
    const u = await db.user.create({
      data: {
        tenantId: tenant1.id,
        email: randomEmail(repNames1[i]),
        name: repNames1[i],
        role: 'rep',
        permissions: JSON.stringify(getRolePermissions('rep')),
        managerId: manager.id,
        status: 'active',
        title: repTitles1[i],
        phone: randomPhone(),
      },
    })
    t1Reps.push(u)
  }

  // Tenant 2: Admin, 1 Müdür, 2 Temsilci
  const t2Admin = await db.user.create({
    data: {
      tenantId: tenant2.id,
      email: 'demo@egeticaret.com',
      name: 'Hakan Aydın',
      role: 'admin',
      permissions: JSON.stringify(getAdminPermissionsForTenant(tenant2.name)),
      status: 'active',
      title: 'Genel Müdür',
      phone: '+90 535 444 55 66',
    },
  })

  const t2Manager = await db.user.create({
    data: {
      tenantId: tenant2.id,
      email: 'selin.kara@egeticaret.com',
      name: 'Selin Kara',
      role: 'manager',
      permissions: JSON.stringify(getRolePermissions('manager')),
      managerId: t2Admin.id,
      status: 'active',
      title: 'Satış Müdürü',
      phone: '+90 536 555 66 77',
    },
  })

  const t2Reps = []
  const repNames2 = ['Okan Yıldırım', 'Deniz Aslan']
  for (const name of repNames2) {
    const u = await db.user.create({
      data: {
        tenantId: tenant2.id,
        email: randomEmail(name),
        name,
        role: 'rep',
        permissions: JSON.stringify(getRolePermissions('rep')),
        managerId: t2Manager.id,
        status: 'active',
        title: 'Satış Temsilcisi',
        phone: randomPhone(),
      },
    })
    t2Reps.push(u)
  }

  // === CAFE-ERP: Kafe rolleri — Kafe şirketine (tenantCafe) bağlı ===
  const cafeAdmin = await db.user.create({
    data: {
      tenantId: tenantCafe.id,
      email: 'admin@sikkafe.com',
      name: 'Cafe Yöneticisi',
      role: 'admin',
      permissions: JSON.stringify(getAdminPermissionsForTenant(tenantCafe.name)),
      status: 'active',
      title: 'Kafe İşletmecisi',
      phone: randomPhone(),
    },
  })
  const t1Kasa = await db.user.create({
    data: {
      tenantId: tenantCafe.id,
      email: 'kasa@sikkafe.com',
      name: 'Selin Demir',
      role: 'kasa',
      permissions: JSON.stringify(getRolePermissions('kasa')),
      status: 'active',
      title: 'Kasiyer',
      phone: randomPhone(),
    },
  })
  const t1Barmen = await db.user.create({
    data: {
      tenantId: tenantCafe.id,
      email: 'barmen@sikkafe.com',
      name: 'Burak Yıldız',
      role: 'barmen',
      permissions: JSON.stringify(getRolePermissions('barmen')),
      status: 'active',
      title: 'Barmen',
      phone: randomPhone(),
    },
  })
  const t1Komi = await db.user.create({
    data: {
      tenantId: tenantCafe.id,
      email: 'komi@sikkafe.com',
      name: 'Hülya Aydın',
      role: 'komi',
      permissions: JSON.stringify(getRolePermissions('komi')),
      status: 'active',
      title: 'Komi (Garson)',
      phone: randomPhone(),
    },
  })
  void t1Kasa; void t1Barmen; void t1Komi

  // === MARKET-ERP: Market rolleri — Market şirketine (tenantMarket) bağlı ===
  const marketAdmin = await db.user.create({
    data: {
      tenantId: tenantMarket.id,
      email: 'admin@anadolumarket.com',
      name: 'Market Yöneticisi',
      role: 'admin',
      permissions: JSON.stringify(getAdminPermissionsForTenant(tenantMarket.name)),
      status: 'active',
      title: 'Market Müdürü',
      phone: randomPhone(),
    },
  })
  const marketKasiyer = await db.user.create({
    data: {
      tenantId: tenantMarket.id,
      email: 'kasiyer@anadolumarket.com',
      name: 'Ayşe Kasiyer',
      role: 'kasiyer',
      permissions: JSON.stringify(getRolePermissions('kasiyer')),
      status: 'active',
      title: 'Kasiyer',
      phone: randomPhone(),
    },
  })
  const marketDepo = await db.user.create({
    data: {
      tenantId: tenantMarket.id,
      email: 'depo@anadolumarket.com',
      name: 'Hasan Depo',
      role: 'depo_sorumlusu',
      permissions: JSON.stringify(getRolePermissions('depo_sorumlusu')),
      status: 'active',
      title: 'Depo Sorumlusu',
      phone: randomPhone(),
    },
  })
  void marketKasiyer; void marketDepo

  // === RANDEVU: Kuaför şirketi (tenantRandevu) ===
  const randevuAdmin = await db.user.create({
    data: {
      tenantId: tenantRandevu.id,
      email: 'admin@sikkuafur.com',
      name: 'Kuaför Yöneticisi',
      role: 'admin',
      permissions: JSON.stringify(getAdminPermissionsForTenant(tenantRandevu.name)),
      status: 'active',
      title: 'İşletme Sahibii',
      phone: randomPhone(),
    },
  })
  void randevuAdmin

  // === SITE: Site yönetimi şirketi (tenantSite) ===
  const siteAdmin = await db.user.create({
    data: {
      tenantId: tenantSite.id,
      email: 'admin@parksitesi.com',
      name: 'Site Yöneticisi',
      role: 'admin',
      permissions: JSON.stringify(getAdminPermissionsForTenant(tenantSite.name)),
      status: 'active',
      title: 'Site Yöneticisi',
      phone: randomPhone(),
    },
  })
  void siteAdmin

  // === SITE: Park Sitesi — demo verileri (1 site, 2 blok, 10 daire, 5 sakin, 12 aidat, 3 duyuru, 3 şikayet, 2 personel) ===
  const parkSitesi = await db.site.create({
    data: {
      tenantId: tenantSite.id,
      name: 'Park Sitesi',
      address: 'Atatürk Bulvarı No:120 Kadıköy',
      city: 'İstanbul',
      district: 'Kadıköy',
      phone: '+90 216 555 12 34',
      email: 'yonetim@parksitesi.com',
      managerName: 'Mehmet Yılmaz',
      dueDay: 5,
      defaultDueAmount: 750,
      currency: 'TRY',
      isActive: true,
    },
  })

  // 2 blok
  const blokA = await db.block.create({ data: { siteId: parkSitesi.id, name: 'A Blok', floors: 5 } })
  const blokB = await db.block.create({ data: { siteId: parkSitesi.id, name: 'B Blok', floors: 6 } })

  // 10 daire (A Blok: 5 daire + 1 depo, B Blok: 3 daire + 1 dükkan)
  const aptA1 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokA.id, number: '1', floor: 0, type: 'daire', area: 85 } })
  const aptA2 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokA.id, number: '2', floor: 1, type: 'daire', area: 90 } })
  const aptA3 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokA.id, number: '3', floor: 2, type: 'daire', area: 95 } })
  const aptA4 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokA.id, number: '4', floor: 3, type: 'daire', area: 100 } })
  const aptA5 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokA.id, number: '5', floor: 4, type: 'daire', area: 110 } })
  const aptADepo = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokA.id, number: 'D1', floor: -1, type: 'depo', area: 12 } })
  const aptB1 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokB.id, number: '1', floor: 0, type: 'daire', area: 88 } })
  const aptB2 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokB.id, number: '2', floor: 1, type: 'daire', area: 92 } })
  const aptB3 = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokB.id, number: '3', floor: 2, type: 'daire', area: 96 } })
  const aptBDukkan = await db.apartment.create({ data: { siteId: parkSitesi.id, blockId: blokB.id, number: 'Dükkan 1', floor: 0, type: 'dukkan', area: 45 } })

  // 5 sakin
  const siteRes1 = await db.resident.create({
    data: {
      tenantId: tenantSite.id, siteId: parkSitesi.id,
      name: 'Ayşe Kaya', email: 'ayse.kaya@gmail.com',
      phone: '+90 533 222 11 22', type: 'mal_sahibi', isOwner: true, isActive: true,
    },
  })
  const siteRes2 = await db.resident.create({
    data: {
      tenantId: tenantSite.id, siteId: parkSitesi.id,
      name: 'Mustafa Demir', email: 'mustafa.demir@gmail.com',
      phone: '+90 534 333 44 55', type: 'kiraci', isOwner: false, isActive: true,
    },
  })
  const siteRes3 = await db.resident.create({
    data: {
      tenantId: tenantSite.id, siteId: parkSitesi.id,
      name: 'Fatma Şahin', email: 'fatma.sahin@gmail.com',
      phone: '+90 535 444 55 66', type: 'mal_sahibi', isOwner: true, isActive: true,
    },
  })
  const siteRes4 = await db.resident.create({
    data: {
      tenantId: tenantSite.id, siteId: parkSitesi.id,
      name: 'Ahmet Çelik', email: 'ahmet.celik@gmail.com',
      phone: '+90 536 555 66 77', type: 'kiraci', isOwner: false, isActive: true,
    },
  })
  const siteRes5 = await db.resident.create({
    data: {
      tenantId: tenantSite.id, siteId: parkSitesi.id,
      name: 'Zeynep Yıldız', email: 'zeynep.yildiz@gmail.com',
      phone: '+90 537 666 77 88', type: 'mal_sahibi', isOwner: true, isActive: true,
    },
  })

  // Sakinleri dairelere bağla (residentId unique)
  await db.apartment.update({ where: { id: aptA1.id }, data: { residentId: siteRes1.id } })
  await db.apartment.update({ where: { id: aptA2.id }, data: { residentId: siteRes2.id } })
  await db.apartment.update({ where: { id: aptA3.id }, data: { residentId: siteRes3.id } })
  await db.apartment.update({ where: { id: aptB1.id }, data: { residentId: siteRes4.id } })
  await db.apartment.update({ where: { id: aptB2.id }, data: { residentId: siteRes5.id } })

  // 12 aidat kaydı (10 bu ay + 2 geçen aydan gecikmiş)
  const siteNow = new Date()
  const siteCurMonth = siteNow.getMonth() + 1
  const siteCurYear = siteNow.getFullYear()
  const sitePrevMonth = siteCurMonth === 1 ? 12 : siteCurMonth - 1
  const sitePrevYear = siteCurMonth === 1 ? siteCurYear - 1 : siteCurYear
  const dueDateFor = (m: number, y: number) => {
    const d = new Date(y, m - 1, 5, 23, 59, 0)
    return d
  }

  const siteDuesAmount = (t: string) => t === 'dukkan' ? 1500 : t === 'depo' ? 250 : parkSitesi.defaultDueAmount
  const siteDuesRows = [
    { apt: aptA1, res: siteRes1, status: 'odendi' as const },
    { apt: aptA2, res: siteRes2, status: 'odenmedi' as const },
    { apt: aptA3, res: siteRes3, status: 'odendi' as const },
    { apt: aptA4, res: null, status: 'odenmedi' as const },
    { apt: aptA5, res: null, status: 'odendi' as const },
    { apt: aptADepo, res: null, status: 'odenmedi' as const },
    { apt: aptB1, res: siteRes4, status: 'odendi' as const },
    { apt: aptB2, res: siteRes5, status: 'odenmedi' as const },
    { apt: aptB3, res: null, status: 'odendi' as const },
    { apt: aptBDukkan, res: null, status: 'odenmedi' as const },
  ]
  for (const d of siteDuesRows) {
    const dueDate = dueDateFor(siteCurMonth, siteCurYear)
    const amount = siteDuesAmount(d.apt.type)
    await db.dues.create({
      data: {
        siteId: parkSitesi.id,
        apartmentId: d.apt.id,
        residentId: d.res?.id ?? null,
        month: siteCurMonth,
        year: siteCurYear,
        amount,
        currency: 'TRY',
        dueDate,
        status: d.status,
        paidDate: d.status === 'odendi' ? new Date(dueDate.getTime() - 86400000) : null,
        paidAmount: d.status === 'odendi' ? amount : null,
        paymentMethod: d.status === 'odendi' ? 'bank' : null,
      },
    })
  }
  // 2 gecikmiş aidat (geçen ay)
  await db.dues.create({
    data: {
      siteId: parkSitesi.id, apartmentId: aptA2.id, residentId: siteRes2.id,
      month: sitePrevMonth, year: sitePrevYear,
      amount: parkSitesi.defaultDueAmount, currency: 'TRY',
      dueDate: dueDateFor(sitePrevMonth, sitePrevYear),
      status: 'gecikti',
    },
  })
  await db.dues.create({
    data: {
      siteId: parkSitesi.id, apartmentId: aptB2.id, residentId: siteRes5.id,
      month: sitePrevMonth, year: sitePrevYear,
      amount: parkSitesi.defaultDueAmount, currency: 'TRY',
      dueDate: dueDateFor(sitePrevMonth, sitePrevYear),
      status: 'gecikti',
    },
  })

  // 3 duyuru
  await db.announcement.create({
    data: {
      siteId: parkSitesi.id,
      title: 'Genel Kurul Toplantısı',
      content: 'Değerli sakinler, bu ayın ilk cumartesi günü saat 14:00\'ta genel kurul toplantısı yapılacaktır. Katılımınız rica olunur.',
      type: 'genel', isPinned: true, publishDate: daysAgo(2),
    },
  })
  await db.announcement.create({
    data: {
      siteId: parkSitesi.id,
      title: 'Asansör Bakım Çalışması',
      content: 'A Blok asansörü perşembe günü 09:00-13:00 arası bakım çalışması nedeniyle hizmet dışı kalacaktır.',
      type: 'bakim', isPinned: false, publishDate: daysAgo(5),
    },
  })
  await db.announcement.create({
    data: {
      siteId: parkSitesi.id,
      title: 'Aidat Tahsilatı Devam Ediyor',
      content: 'Bu ay aidatlarını 5. güne kadar yönetim ofisine veya banka hesabımıza ödeyebilirsiniz.',
      type: 'aidat', isPinned: false, publishDate: daysAgo(7),
    },
  })

  // 3 şikayet
  await db.complaint.create({
    data: {
      siteId: parkSitesi.id, residentId: siteRes1.id,
      title: 'Sızıntı problemi',
      description: 'A Blok 1. katta mutfaktan gelen bir su sızıntısı var. Acil yardım.',
      category: 'su', status: 'acik', priority: 'yuksek',
    },
  })
  await db.complaint.create({
    data: {
      siteId: parkSitesi.id, residentId: siteRes2.id,
      title: 'Asansör gürültüsü',
      description: 'B Blok asansörü son günlerde çok ses çıkarıyor. Gece rahatsız oluyoruz.',
      category: 'asansor', status: 'inceleniyor', priority: 'normal',
      response: 'Teknik ekibimiz perşembe günü bakıma gelecek.', respondedAt: new Date(),
    },
  })
  await db.complaint.create({
    data: {
      siteId: parkSitesi.id, residentId: siteRes3.id,
      title: 'Park yeri işgali',
      description: 'Misafir araçları misafir park yerine değil, benim yerime park ediyor.',
      category: 'park', status: 'cozuldu', priority: 'dusuk',
      response: 'Uyarı levhaları yerleştirildi.', respondedAt: new Date(),
    },
  })

  // 2 personel
  await db.siteStaff.create({
    data: {
      siteId: parkSitesi.id, name: 'Hüseyin Arslan', role: 'kapici',
      phone: '+90 538 111 22 33', salary: 28000, startDate: daysAgo(400), isActive: true,
    },
  })
  await db.siteStaff.create({
    data: {
      siteId: parkSitesi.id, name: 'İbrahim Doğan', role: 'guvenlik',
      phone: '+90 538 444 55 66', salary: 32000, startDate: daysAgo(120), isActive: true,
    },
  })

  // ============================================================
  // CAFE-ERP — Şık Kafe (tenantCafe) için demo veriler
  // (Cafe Yöneticisi dashboard'ında gerçek ciro gözüksün diye)
  // 1 Cafe + 5 Masa + 3 Kategori + 12 Menü Kalemi + 7 Ödenmiş Sipariş
  // ============================================================
  const sikKafe = await db.cafe.create({
    data: {
      tenantId: tenantCafe.id,
      name: 'Şık Kafe & Restoran — Kadıköy',
      address: 'Bağdat Caddesi No:142 Kadıköy, İstanbul',
      phone: '+90 216 555 12 34',
      tableCount: 0,
    },
  })

  // 5 masa
  const kafeTables: Array<{ id: string; number: string }> = []
  const kafeTableShapes = ['square', 'round', 'rectangle', 'square', 'round']
  const kafeTablePositions = [
    { x: 25, y: 25 }, { x: 50, y: 25 }, { x: 75, y: 25 },
    { x: 35, y: 60 }, { x: 65, y: 60 },
  ]
  for (let i = 0; i < 5; i++) {
    const t = await db.cafeTable.create({
      data: {
        cafeId: sikKafe.id,
        number: `M${i + 1}`,
        shape: kafeTableShapes[i],
        x: kafeTablePositions[i].x,
        y: kafeTablePositions[i].y,
        width: kafeTableShapes[i] === 'rectangle' ? 14 : 10,
        height: 10,
        capacity: kafeTableShapes[i] === 'rectangle' ? 6 : 4,
        status: 'bos',
      },
    })
    kafeTables.push({ id: t.id, number: t.number })
  }
  await db.cafe.update({ where: { id: sikKafe.id }, data: { tableCount: 5 } })

  // 3 kategori + 12 menü kalemi (Türkçe gerçekçi)
  const kafeCatIcecek = await db.menuCategory.create({
    data: { cafeId: sikKafe.id, name: 'İçecekler', icon: '☕', sortOrder: 0 },
  })
  const kafeCatAna = await db.menuCategory.create({
    data: { cafeId: sikKafe.id, name: 'Ana Yemekler', icon: '🍽️', sortOrder: 1 },
  })
  const kafeCatTatli = await db.menuCategory.create({
    data: { cafeId: sikKafe.id, name: 'Tatlılar', icon: '🍰', sortOrder: 2 },
  })

  const kafeMenuItems = [
    { cat: kafeCatIcecek, name: 'Çay', price: 8, station: 'bar', prepTime: 2 },
    { cat: kafeCatIcecek, name: 'Türk Kahvesi', price: 50, station: 'bar', prepTime: 8 },
    { cat: kafeCatIcecek, name: 'Ayran', price: 15, station: 'bar', prepTime: 2 },
    { cat: kafeCatIcecek, name: 'Şalgam', price: 20, station: 'bar', prepTime: 3 },
    { cat: kafeCatAna, name: 'Mercimek Çorbası', price: 55, station: 'kitchen', prepTime: 8 },
    { cat: kafeCatAna, name: 'Adana Kebap', price: 220, station: 'kitchen', prepTime: 20 },
    { cat: kafeCatAna, name: 'Lahmacun', price: 90, station: 'kitchen', prepTime: 12 },
    { cat: kafeCatAna, name: 'Karışık Pide', price: 120, station: 'kitchen', prepTime: 15 },
    { cat: kafeCatAna, name: 'Beyti Kebap', price: 240, station: 'kitchen', prepTime: 18 },
    { cat: kafeCatTatli, name: 'Baklava (dilim)', price: 75, station: 'dessert', prepTime: 3 },
    { cat: kafeCatTatli, name: 'Sütlaç', price: 45, station: 'dessert', prepTime: 3 },
    { cat: kafeCatTatli, name: 'Künefe', price: 95, station: 'dessert', prepTime: 10 },
  ]
  const kafeMenuCreated: Array<{ id: string; name: string; price: number; station: string }> = []
  for (const it of kafeMenuItems) {
    const m = await db.menuItem.create({
      data: {
        categoryId: it.cat.id,
        name: it.name,
        price: it.price,
        currency: 'TRY',
        prepTime: it.prepTime,
        station: it.station,
        sortOrder: 0,
        isAvailable: true,
      },
    })
    kafeMenuCreated.push({ id: m.id, name: m.name, price: m.price, station: m.station })
  }

  // 7 ödenmiş sipariş — son 30 günün içine dağıtılmış
  // (2 tanesi bugün, 5 tanesi geçmiş 30 günün içine dağılmış)
  // Her siparişe 2-3 kalem, subtotal/taxTotal/total ve CafePayment girilir.
  const kafeOrderScenarios = [
    { daysAgo: 0, hour: 12, tableIdx: 0, items: [{ idx: 5, qty: 1 }, { idx: 0, qty: 2 }, { idx: 9, qty: 1 }], method: 'cash' as const }, // Adana + Çay + Baklava
    { daysAgo: 0, hour: 19, tableIdx: 1, items: [{ idx: 6, qty: 2 }, { idx: 2, qty: 2 }, { idx: 11, qty: 1 }], method: 'card' as const }, // 2 Lahmacun + 2 Ayran + Künefe
    { daysAgo: 2, hour: 13, tableIdx: 2, items: [{ idx: 4, qty: 1 }, { idx: 7, qty: 1 }], method: 'card' as const }, // Mercimek + Pide
    { daysAgo: 5, hour: 14, tableIdx: 3, items: [{ idx: 5, qty: 1 }, { idx: 1, qty: 1 }, { idx: 10, qty: 1 }], method: 'cash' as const }, // Adana + Türk Kahvesi + Sütlaç
    { daysAgo: 9, hour: 20, tableIdx: 4, items: [{ idx: 8, qty: 1 }, { idx: 3, qty: 1 }, { idx: 9, qty: 2 }], method: 'mixed' as const }, // Beyti + Şalgam + 2 Baklava
    { daysAgo: 14, hour: 12, tableIdx: 0, items: [{ idx: 4, qty: 2 }, { idx: 1, qty: 2 }], method: 'cash' as const }, // 2 Mercimek + 2 Türk Kahvesi
    { daysAgo: 22, hour: 18, tableIdx: 1, items: [{ idx: 6, qty: 1 }, { idx: 7, qty: 1 }, { idx: 11, qty: 1 }], method: 'card' as const }, // Lahmacun + Pide + Künefe
  ]

  for (let i = 0; i < kafeOrderScenarios.length; i++) {
    const sc = kafeOrderScenarios[i]
    const orderDate = new Date()
    orderDate.setDate(orderDate.getDate() - sc.daysAgo)
    orderDate.setHours(sc.hour, randInt(0, 59), 0, 0)

    let subtotal = 0
    const itemRows: Array<{ menuItemId: string; name: string; qty: number; unitPrice: number; station: string }> = []
    for (const it of sc.items) {
      const m = kafeMenuCreated[it.idx]
      subtotal += m.price * it.qty
      itemRows.push({ menuItemId: m.id, name: m.name, qty: it.qty, unitPrice: m.price, station: m.station })
    }
    const taxTotal = 0
    const total = subtotal

    const order = await db.cafeOrder.create({
      data: {
        cafeId: sikKafe.id,
        tableId: kafeTables[sc.tableIdx]?.id ?? null,
        number: `SK-${String(i + 1).padStart(4, '0')}`,
        status: 'odendi',
        type: 'dine_in',
        subtotal,
        taxTotal,
        total,
        createdById: t1Komi.id,
        createdAt: orderDate,
      },
    })
    for (const it of itemRows) {
      await db.cafeOrderItem.create({
        data: {
          orderId: order.id,
          menuItemId: it.menuItemId,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          status: 'servis_edildi',
          station: it.station,
        },
      })
    }
    await db.cafePayment.create({
      data: {
        orderId: order.id,
        amount: total,
        method: sc.method,
        status: 'tamamlandi',
        createdAt: orderDate,
      },
    })
  }
  void cafeAdmin

  // ============================================================
  // MARKET-ERP — Anadolu Market (tenantMarket) için demo veriler
  // (Market Yöneticisi dashboard'ında gerçek satış gözüksün diye)
  // 1 Market + 5 Raf + 15 Ürün + 3 Barkod + 3 Vardiya + 18 Satış
  // ============================================================
  const anadoluMarket = await db.market.create({
    data: {
      tenantId: tenantMarket.id,
      name: 'Anadolu Market — Kadıköy Şube',
      address: 'Caferağa Mah. Moda Cad. No:55 Kadıköy, İstanbul',
      phone: '+90 216 555 22 11',
      isActive: true,
    },
  })

  // 5 raf (spec: create 1 Market, 5 Shelf)
  const anadoluShelves: Array<{ id: string; code: string }> = []
  const anadoluShelfDefs = [
    { code: 'A1', name: 'Ekmek Bölümü', aisle: '1' },
    { code: 'A2', name: 'Süt Ürünleri', aisle: '1' },
    { code: 'B1', name: 'Atıştırmalık', aisle: '2' },
    { code: 'B2', name: 'İçecekler', aisle: '2' },
    { code: 'C1', name: 'Temel Gıda', aisle: '3' },
  ]
  for (const s of anadoluShelfDefs) {
    const sh = await db.shelf.create({
      data: { marketId: anadoluMarket.id, code: s.code, name: s.name, aisle: s.aisle },
    })
    anadoluShelves.push({ id: sh.id, code: sh.code })
  }

  // 15 ürün (tenantMarket'a özel)
  const anadoluProductsData = [
    { name: 'Tam Buğday Ekmek', sku: 'AMK-EK-01', barcode: '8691110000017', price: 8.5, stock: 80, minStock: 20, category: 'Unlu Mamul', unit: 'adet', taxRate: 1 },
    { name: 'Süt 1L', sku: 'AMK-SUT-1L', barcode: '8691110000024', price: 23.5, stock: 50, minStock: 15, category: 'Süt Ürünleri', unit: 'lt', taxRate: 1 },
    { name: 'Yoğurt 1kg', sku: 'AMK-YOG-1K', barcode: '8691110000031', price: 47, stock: 30, minStock: 10, category: 'Süt Ürünleri', unit: 'kg', taxRate: 1 },
    { name: 'Beyaz Peynir 500g', sku: 'AMK-PEY-500', barcode: '8691110000048', price: 125, stock: 25, minStock: 8, category: 'Süt Ürünleri', unit: 'pk', taxRate: 1 },
    { name: 'Sütlü Çikolata', sku: 'AMK-CIK-01', barcode: '8691110000055', price: 19.9, stock: 100, minStock: 30, category: 'Atıştırmalık', unit: 'adet', taxRate: 20 },
    { name: 'Kakaolu Bisküvi', sku: 'AMK-BIS-01', barcode: '8691110000062', price: 14.5, stock: 75, minStock: 25, category: 'Atıştırmalık', unit: 'pk', taxRate: 20 },
    { name: 'Cola 1L', sku: 'AMK-CC-1L', barcode: '8691110000079', price: 27, stock: 60, minStock: 20, category: 'İçecek', unit: 'lt', taxRate: 20 },
    { name: 'Doğal Maden Suyu 0.5L', sku: 'AMK-SU-05', barcode: '8691110000086', price: 6, stock: 200, minStock: 50, category: 'İçecek', unit: 'adet', taxRate: 8 },
    { name: 'Çay 1kg', sku: 'AMK-CAY-1K', barcode: '8691110000093', price: 152, stock: 40, minStock: 10, category: 'İçecek', unit: 'kg', taxRate: 8 },
    { name: 'Şeker 1kg', sku: 'AMK-SEK-1K', barcode: '8691110000109', price: 30, stock: 90, minStock: 30, category: 'Gıda', unit: 'kg', taxRate: 1 },
    { name: 'Un 1kg', sku: 'AMK-UN-1K', barcode: '8691110000116', price: 21, stock: 70, minStock: 20, category: 'Gıda', unit: 'kg', taxRate: 1 },
    { name: 'Ayçiçek Yağı 1L', sku: 'AMK-YAG-1L', barcode: '8691110000123', price: 68, stock: 35, minStock: 10, category: 'Gıda', unit: 'lt', taxRate: 8 },
    { name: 'Makarna 500g', sku: 'AMK-MAK-500', barcode: '8691110000130', price: 15.25, stock: 110, minStock: 40, category: 'Gıda', unit: 'pk', taxRate: 1 },
    { name: 'Pirinç 1kg', sku: 'AMK-PRC-1K', barcode: '8691110000147', price: 55, stock: 45, minStock: 15, category: 'Gıda', unit: 'kg', taxRate: 1 },
    { name: 'Tuvalet Kağıdı 8li', sku: 'AMK-TK-8', barcode: '8691110000154', price: 95, stock: 4, minStock: 8, category: 'Temizlik', unit: 'pk', taxRate: 20 }, // düşük stok
  ]
  const anadoluProducts: Array<{ id: string; name: string; price: number; taxRate: number; barcode: string }> = []
  for (const p of anadoluProductsData) {
    const prod = await db.product.create({
      data: {
        tenantId: tenantMarket.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        currency: 'TRY',
        taxRate: p.taxRate,
        stock: p.stock,
        minStock: p.minStock,
        unit: p.unit,
        category: p.category,
      },
    })
    anadoluProducts.push({ id: prod.id, name: prod.name, price: prod.price, taxRate: prod.taxRate, barcode: p.barcode })
  }

  // 3 barkod
  await db.barcode.create({ data: { marketId: anadoluMarket.id, productId: anadoluProducts[0].id, code: anadoluProducts[0].barcode, type: 'ean13' } })
  await db.barcode.create({ data: { marketId: anadoluMarket.id, productId: anadoluProducts[6].id, code: anadoluProducts[6].barcode, type: 'ean13' } })
  await db.barcode.create({ data: { marketId: anadoluMarket.id, productId: anadoluProducts[14].id, code: anadoluProducts[14].barcode, type: 'ean13' } })

  // 3 vardiya: 1 bugün açık, 2 geçen hafta kapalı
  const openShiftAM = await db.posShift.create({
    data: {
      marketId: anadoluMarket.id,
      userId: marketKasiyer.id,
      number: 'AM-V-001',
      status: 'acik',
      openingCash: 500,
      openingTime: new Date(new Date().setHours(8, 30, 0, 0)),
    },
  })
  const closedShift1 = await db.posShift.create({
    data: {
      marketId: anadoluMarket.id,
      userId: marketKasiyer.id,
      number: 'AM-V-002',
      status: 'kapali',
      openingCash: 500,
      closingCash: 1450.50,
      expectedCash: 1450.50,
      difference: 0,
      openingTime: daysAgo(2),
      closingTime: daysAgo(2),
    },
  })
  const closedShift2 = await db.posShift.create({
    data: {
      marketId: anadoluMarket.id,
      userId: marketKasiyer.id,
      number: 'AM-V-003',
      status: 'kapali',
      openingCash: 500,
      closingCash: 1820.75,
      expectedCash: 1820.75,
      difference: 0,
      openingTime: daysAgo(6),
      closingTime: daysAgo(6),
    },
  })

  // 18 satış: 3 bugün, 15 geçmiş 30 günün içine dağılmış
  // Karışık ödeme yöntemleri: cash / card / mixed
  // Her fişe 2-5 kalem, subtotal/taxTotal/total hesaplanır
  const amSaleScenarios: Array<{ daysAgo: number; hour: number; items: Array<{ idx: number; qty: number }>; payment: 'cash' | 'card' | 'mixed'; shiftId: string | null }> = [
    // Bugün (3)
    { daysAgo: 0, hour: 10, items: [{ idx: 0, qty: 2 }, { idx: 1, qty: 1 }], payment: 'cash', shiftId: openShiftAM.id }, // Ekmek 2 + Süt 1
    { daysAgo: 0, hour: 13, items: [{ idx: 6, qty: 1 }, { idx: 7, qty: 3 }], payment: 'card', shiftId: openShiftAM.id }, // Cola + 3 Su
    { daysAgo: 0, hour: 17, items: [{ idx: 12, qty: 2 }, { idx: 9, qty: 1 }, { idx: 13, qty: 1 }], payment: 'mixed', shiftId: openShiftAM.id }, // 2 Makarna + Şeker + Pirinç
    // Bu hafta (5)
    { daysAgo: 1, hour: 11, items: [{ idx: 1, qty: 2 }, { idx: 2, qty: 1 }, { idx: 3, qty: 1 }], payment: 'card', shiftId: closedShift1.id }, // 2 Süt + Yoğurt + Peynir
    { daysAgo: 2, hour: 14, items: [{ idx: 4, qty: 3 }, { idx: 7, qty: 2 }], payment: 'cash', shiftId: closedShift1.id }, // 3 Çikolata + 2 Su
    { daysAgo: 3, hour: 16, items: [{ idx: 6, qty: 2 }, { idx: 8, qty: 1 }], payment: 'mixed', shiftId: closedShift1.id }, // 2 Cola + Çay
    { daysAgo: 5, hour: 12, items: [{ idx: 0, qty: 1 }, { idx: 9, qty: 2 }, { idx: 10, qty: 1 }, { idx: 11, qty: 1 }], payment: 'card', shiftId: closedShift2.id }, // Ekmek + 2 Şeker + Un + Yağ
    { daysAgo: 6, hour: 18, items: [{ idx: 5, qty: 2 }, { idx: 12, qty: 3 }], payment: 'cash', shiftId: closedShift2.id }, // 2 Bisküvi + 3 Makarna
    // Geçen 30 gün (10)
    { daysAgo: 8, hour: 10, items: [{ idx: 0, qty: 2 }, { idx: 1, qty: 1 }, { idx: 2, qty: 1 }], payment: 'cash', shiftId: null },
    { daysAgo: 10, hour: 11, items: [{ idx: 7, qty: 6 }, { idx: 6, qty: 1 }], payment: 'card', shiftId: null }, // 6 Su + Cola
    { daysAgo: 12, hour: 15, items: [{ idx: 9, qty: 2 }, { idx: 13, qty: 1 }, { idx: 12, qty: 2 }], payment: 'mixed', shiftId: null },
    { daysAgo: 14, hour: 19, items: [{ idx: 6, qty: 2 }, { idx: 4, qty: 2 }], payment: 'cash', shiftId: null },
    { daysAgo: 17, hour: 13, items: [{ idx: 1, qty: 3 }, { idx: 11, qty: 1 }], payment: 'card', shiftId: null },
    { daysAgo: 20, hour: 17, items: [{ idx: 0, qty: 3 }, { idx: 8, qty: 1 }], payment: 'cash', shiftId: null },
    { daysAgo: 23, hour: 12, items: [{ idx: 10, qty: 2 }, { idx: 9, qty: 2 }, { idx: 11, qty: 1 }], payment: 'mixed', shiftId: null },
    { daysAgo: 25, hour: 16, items: [{ idx: 2, qty: 1 }, { idx: 3, qty: 1 }], payment: 'card', shiftId: null },
    { daysAgo: 28, hour: 18, items: [{ idx: 6, qty: 1 }, { idx: 7, qty: 5 }], payment: 'cash', shiftId: null },
    { daysAgo: 30, hour: 11, items: [{ idx: 4, qty: 4 }, { idx: 5, qty: 2 }, { idx: 13, qty: 1 }, { idx: 14, qty: 1 }], payment: 'mixed', shiftId: null },
  ]

  for (let i = 0; i < amSaleScenarios.length; i++) {
    const sc = amSaleScenarios[i]
    const saleDate = new Date()
    saleDate.setDate(saleDate.getDate() - sc.daysAgo)
    saleDate.setHours(sc.hour, randInt(0, 59), 0, 0)

    const lineItems: Array<{ productId: string; name: string; qty: number; unitPrice: number; taxRate: number; lineTotal: number; barcode: string | null }> = []
    let subtotal = 0
    for (const it of sc.items) {
      const p = anadoluProducts[it.idx]
      const qty = it.qty
      const lineTotal = p.price * qty
      subtotal += lineTotal
      lineItems.push({
        productId: p.id,
        name: p.name,
        qty,
        unitPrice: p.price,
        taxRate: p.taxRate,
        lineTotal,
        barcode: p.barcode,
      })
    }
    const taxTotal = lineItems.reduce((s, x) => s + x.lineTotal - x.lineTotal / (1 + x.taxRate / 100), 0)
    const total = subtotal
    const cashAmt = sc.payment === 'cash' ? total : sc.payment === 'mixed' ? Math.floor(total / 2) : 0
    const cardAmt = sc.payment === 'card' ? total : sc.payment === 'mixed' ? total - Math.floor(total / 2) : 0

    const sale = await db.marketSale.create({
      data: {
        marketId: anadoluMarket.id,
        posShiftId: sc.shiftId,
        number: `AM-FIS-${String(i + 1).padStart(4, '0')}`,
        type: 'satis',
        status: 'tamamlandi',
        subtotal,
        taxTotal,
        discount: 0,
        total,
        paymentMethod: sc.payment,
        cashAmount: cashAmt,
        cardAmount: cardAmt,
        userId: marketKasiyer.id,
        createdAt: saleDate,
      },
    })
    for (const it of lineItems) {
      await db.marketSaleItem.create({
        data: {
          saleId: sale.id,
          productId: it.productId,
          barcode: it.barcode,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
          discount: 0,
          lineTotal: it.lineTotal,
        },
      })
      // Stok düş
      await db.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: it.qty } },
      })
      await db.stockMovement.create({
        data: {
          productId: it.productId,
          quantity: -it.qty,
          type: 'cikis',
          reason: 'POS Satış',
          refType: 'market_sale',
          refId: sale.id,
        },
      })
    }
  }
  void marketAdmin

  // === TAGS ===
  for (const tenant of [tenant1, tenant2]) {
    for (const tag of TAG_POOL) {
      await db.tag.create({
        data: {
          tenantId: tenant.id,
          name: tag,
          color: ['amber', 'emerald', 'red', 'sky', 'violet', 'rose', 'orange', 'teal'][randInt(0, 7)],
        },
      })
    }
  }

  // === CUSTOMERS (30) ===
  const allRepsT1 = [t1Admin, t1Manager1, t1Manager2, ...t1Reps]
  const allRepsT2 = [t2Admin, t2Manager, ...t2Reps]

  const customers = []
  for (let i = 0; i < 20; i++) {
    const owner = rand(allRepsT1)
    const lastActivityDays = randInt(0, 60)
    const c = await db.customer.create({
      data: {
        tenantId: tenant1.id,
        name: randomCompanyName(),
        sector: rand(SECTORS),
        segment: rand(['vip', 'kurumsal', 'standart', 'potansiyel']),
        ownerId: owner.id,
        source: rand(['manuel', 'google_maps', 'referral', 'website', 'event']),
        address: `${rand(STREETS)} No:${randInt(1, 200)}`,
        city: rand(CITIES),
        country: 'TR',
        phone: randomPhone(),
        email: `info@${rand(COMPANY_PREFIXES).toLowerCase()}.com.tr`,
        web: `www.${rand(COMPANY_PREFIXES).toLowerCase()}.com.tr`,
        taxNumber: String(randInt(1000000000, 9999999999)),
        status: rand(['aktif', 'aktif', 'aktif', 'pasif', 'potansiyel']),
        tags: JSON.stringify(randInt(0, 3) === 0 ? [] : Array.from({ length: randInt(1, 3) }, () => rand(TAG_POOL))),
        kvkkConsent: Math.random() > 0.3,
        kvkkConsentAt: Math.random() > 0.3 ? daysAgo(randInt(1, 300)) : null,
        annualRevenue: randInt(1, 50) * 100000,
        employeeCount: randInt(5, 500),
        lastActivityAt: daysAgo(lastActivityDays),
        createdAt: daysAgo(randInt(30, 365)),
      },
    })
    customers.push(c)

    // Her müşteriye 1-3 contact
    const contactCount = randInt(1, 3)
    for (let j = 0; j < contactCount; j++) {
      await db.contact.create({
        data: {
          customerId: c.id,
          name: randomName(),
          position: rand(['Genel Müdür', 'Satış Müdürü', 'Muhasebe Müdürü', 'Satın Alma Uzmanı', 'İK Müdürü', 'Pazarlama Müdürü']),
          email: randomEmail(randomName()),
          phone: randomPhone(),
          isPrimary: j === 0,
        },
      })
    }
  }

  for (let i = 0; i < 10; i++) {
    const owner = rand(allRepsT2)
    const lastActivityDays = randInt(0, 60)
    const c = await db.customer.create({
      data: {
        tenantId: tenant2.id,
        name: randomCompanyName(),
        sector: rand(SECTORS),
        segment: rand(['vip', 'kurumsal', 'standart', 'potansiyel']),
        ownerId: owner.id,
        source: rand(['manuel', 'google_maps', 'referral', 'website']),
        address: `${rand(STREETS)} No:${randInt(1, 200)}`,
        city: rand(CITIES),
        country: 'TR',
        phone: randomPhone(),
        email: `info@${rand(COMPANY_PREFIXES).toLowerCase()}.com.tr`,
        web: `www.${rand(COMPANY_PREFIXES).toLowerCase()}.com.tr`,
        taxNumber: String(randInt(1000000000, 9999999999)),
        status: rand(['aktif', 'aktif', 'potansiyel']),
        tags: JSON.stringify(randInt(0, 3) === 0 ? [] : Array.from({ length: randInt(1, 2) }, () => rand(TAG_POOL))),
        kvkkConsent: Math.random() > 0.3,
        kvkkConsentAt: Math.random() > 0.3 ? daysAgo(randInt(1, 300)) : null,
        annualRevenue: randInt(1, 30) * 100000,
        employeeCount: randInt(5, 200),
        lastActivityAt: daysAgo(lastActivityDays),
        createdAt: daysAgo(randInt(30, 365)),
      },
    })
    customers.push(c)

    const contactCount = randInt(1, 2)
    for (let j = 0; j < contactCount; j++) {
      await db.contact.create({
        data: {
          customerId: c.id,
          name: randomName(),
          position: rand(['Genel Müdür', 'Satış Müdürü', 'Muhasebe Müdürü']),
          email: randomEmail(randomName()),
          phone: randomPhone(),
          isPrimary: j === 0,
        },
      })
    }
  }

  // === ACTIVITIES (100) ===
  const t1Customers = customers.filter((c) => c.tenantId === tenant1.id)
  const activityTypes = ['arama', 'toplanti', 'email', 'whatsapp', 'not', 'ziyaret']
  const outcomes = ['basarili', 'basarisiz', 'ertelendi', 'callback']
  const activitySubjects = {
    arama: ['Giriş araması', 'Teklif takip araması', 'Randevu onay araması', 'Ödeme hatırlatma', 'İhtiyaç analizi'],
    toplanti: ['Tanışma toplantısı', 'Teklif sunumu', 'Sözleşme görüşmesi', 'Çeyrek değerlendirme', 'Ürün demo'],
    email: ['Teklif gönderildi', 'Bilgi talebi', 'Sözleşme taslağı', 'Fatura gönderildi', 'Teşekkür maili'],
    whatsapp: ['Randevu hatırlatma', 'Fiyat listesi', 'Belge paylaşımı', 'Onay mesajı'],
    not: ['Müşteri geri bildirimi', 'Karar verici değişti', 'Bütçe onayı bekleniyor', 'Rakip teklif karşılaştırması'],
    ziyaret: ['Saha ziyareti', 'İmza ziyareti', 'Teslimat ziyareti', 'İlişki geliştirme ziyareti'],
  }

  for (let i = 0; i < 100; i++) {
    const type = rand(activityTypes)
    const customer = rand(t1Customers)
    const owner = allRepsT1.find((u) => u.id === customer.ownerId) ?? t1Admin
    await db.activity.create({
      data: {
        tenantId: tenant1.id,
        customerId: customer.id,
        type,
        subject: rand(activitySubjects[type as keyof typeof activitySubjects]),
        detail: Math.random() > 0.5 ? 'Görüşme detayları burada...' : null,
        date: daysAgo(randInt(0, 90)),
        durationMin: type === 'toplanti' ? randInt(30, 120) : type === 'ziyaret' ? randInt(60, 180) : randInt(5, 30),
        outcome: type === 'not' ? null : rand(outcomes),
        userId: owner.id,
      },
    })
  }

  // === DEALS (25) ===
  const stages = ['yeni', 'iletisim', 'teklif', 'muzakere', 'kazanıldı', 'kaybedildi']
  for (let i = 0; i < 25; i++) {
    const customer = rand(t1Customers)
    const stage = rand(stages)
    const owner = allRepsT1.find((u) => u.id === customer.ownerId) ?? t1Admin
    const value = randInt(5, 500) * 1000
    await db.deal.create({
      data: {
        tenantId: tenant1.id,
        title: `${customer.name} - ${rand(['Yıllık Sözleşme', 'Proje Satışı', 'Ürün Tedariği', 'Hizmet Paketi', 'Danışmanlık'])}`,
        customerId: customer.id,
        value,
        currency: 'TRY',
        stage,
        probability: stage === 'kazanıldı' ? 100 : stage === 'kaybedildi' ? 0 : randInt(10, 80),
        expectedCloseDate: daysFromNow(randInt(-30, 90)),
        ownerId: owner.id,
        lossReason: stage === 'kaybedildi' ? rand(['Fiyat çok yüksek', 'Rakibi tercih etti', 'Bütçe yok', 'Zamanlama uygun değil']) : null,
        lossNote: stage === 'kaybedildi' ? 'Müşteri rakip firmayı tercih etti.' : null,
        createdAt: daysAgo(randInt(1, 60)),
      },
    })
  }

  // === TASKS (20) ===
  const priorities = ['dusuk', 'orta', 'yuksek', 'acil']
  const taskTitles = [
    'Müşteriyi ara', 'Teklif hazırla', 'Toplantı planla', 'Fatura gönder',
    'Sözleşme gönder', 'Demo planla', 'Geri arama yap', 'Bilgi gönder',
    'Fiyat güncelle', 'İlişki geliştirme ziyareti',
  ]
  for (let i = 0; i < 20; i++) {
    const customer = rand(t1Customers)
    const assignee = allRepsT1.find((u) => u.id === customer.ownerId) ?? t1Admin
    const isOverdue = Math.random() > 0.5
    await db.task.create({
      data: {
        tenantId: tenant1.id,
        title: rand(taskTitles),
        description: Math.random() > 0.5 ? 'Detaylı açıklama...' : null,
        dueDate: isOverdue ? daysAgo(randInt(1, 15)) : daysFromNow(randInt(0, 30)),
        assigneeId: assignee.id,
        customerId: customer.id,
        priority: rand(priorities),
        reminderTime: '09:00',
        status: isOverdue && Math.random() > 0.7 ? 'tamamlandi' : 'acik',
        autoGenerated: Math.random() > 0.7,
        completedAt: isOverdue && Math.random() > 0.7 ? daysAgo(randInt(0, 5)) : null,
      },
    })
  }

  // === NOTES (30) ===
  const noteContents = [
    'Müşteri çok ilgili, teklifi inceliyor.',
    'Bütçe sorunumuz var, taksitlendirme istiyor.',
    'Karar verici önümüzdeki hafta dönüyor.',
    'Rakip firmadan da teklif almış.',
    'Yıllık sözleşme yenileme zamanı yaklaştı.',
    'Ürün demosunu beğendi, satın alma sürecini başlatacak.',
    'Fiyat pazarlığı yapıyor, %10 indirim istiyor.',
    'Mevcut tedarikçi ile sözleşmesi var, 3 ay sonra bitiyor.',
  ]
  for (let i = 0; i < 30; i++) {
    const customer = rand(t1Customers)
    const owner = allRepsT1.find((u) => u.id === customer.ownerId) ?? t1Admin
    await db.note.create({
      data: {
        customerId: customer.id,
        userId: owner.id,
        content: rand(noteContents),
        isPinned: Math.random() > 0.8,
        createdAt: daysAgo(randInt(0, 60)),
      },
    })
  }

  // === MAPS SEARCHES + LEADS ===
  const searches = [
    { query: 'diş kliniği', city: 'İstanbul', tenantId: tenant1.id, userId: t1Reps[0].id },
    { query: 'kuaför', city: 'İzmir', tenantId: tenant1.id, userId: t1Reps[1].id },
    { query: 'restoran', city: 'Ankara', tenantId: tenant1.id, userId: t1Reps[2].id },
  ]

  for (const s of searches) {
    const results = mockMapsSearch({ query: s.query, city: s.city })
    const ms = await db.mapsSearch.create({
      data: {
        tenantId: s.tenantId,
        userId: s.userId,
        query: s.query,
        city: s.city,
        country: 'TR',
        radius: 10,
        resultCount: results.length,
        importedCount: randInt(3, 8),
      },
    })
    // Bazı sonuçları lead olarak aktar
    const toImport = results.slice(0, randInt(3, 8))
    for (const r of toImport) {
      await db.lead.create({
        data: {
          tenantId: s.tenantId,
          name: r.name,
          placeId: r.placeId,
          category: r.category,
          address: r.address,
          city: r.city,
          country: 'TR',
          lat: r.lat,
          lng: r.lng,
          phone: r.phone,
          web: r.web,
          rating: r.rating,
          reviewCount: r.reviewCount,
          ownerId: s.userId,
          source: 'google_maps',
          status: rand(['yeni', 'yeni', 'iletisim', 'nitelikli', 'kaybedildi']),
          notes: JSON.stringify([]),
          mapsSearchId: ms.id,
          createdAt: daysAgo(randInt(0, 20)),
        },
      })
    }
  }

  // === AUDIT LOGS ===
  for (let i = 0; i < 10; i++) {
    await db.auditLog.create({
      data: {
        tenantId: tenant1.id,
        actorId: rand(allRepsT1).id,
        action: rand(['create', 'update', 'login', 'export']),
        entity: rand(['customer', 'deal', 'activity', 'session']),
        entityId: rand(customers).id,
        before: JSON.stringify({ status: 'eski' }),
        after: JSON.stringify({ status: 'yeni' }),
        createdAt: daysAgo(randInt(0, 30)),
      },
    })
  }

  // === FAZ 2 ÖRNEK ÜRÜNLER ===
  const products = [
    { name: 'CRM Standart Paket', sku: 'CRM-STD', price: 15000, stock: 100 },
    { name: 'CRM Pro Paket', sku: 'CRM-PRO', price: 35000, stock: 50 },
    { name: 'ERP Modülü', sku: 'ERP-01', price: 50000, stock: 30 },
    { name: 'Danışmanlık (Saat)', sku: 'CONS-1H', price: 1500, stock: 999 },
  ]
  const createdProducts: { id: string; name: string; sku: string; price: number; unit: string }[] = []
  for (const p of products) {
    const prod = await db.product.create({
      data: {
        tenantId: tenant1.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        currency: 'TRY',
        taxRate: 20,
        stock: p.stock,
        minStock: 10,
        unit: 'adet',
        category: 'Yazılım',
      },
    })
    createdProducts.push({ id: prod.id, name: prod.name, sku: prod.sku ?? '', price: prod.price, unit: prod.unit })
  }

  // === ERP Demo — Teklif, Fatura, Sipariş (CRM tenant için) ===
  // Deponun siparişleri görebilmesi ve üretim/irsaliye akışını test
  // edebilmesi için 3 örnek teklif + fatura + sipariş oluşturulur.
  const t1CustomersForErp = customers.filter((c) => c.tenantId === tenant1.id).slice(0, 5)
  const erpDemoLines = [
    { product: createdProducts[0], qty: 2, unitPrice: 15000 },
    { product: createdProducts[1], qty: 1, unitPrice: 35000 },
    { product: createdProducts[2], qty: 1, unitPrice: 50000 },
    { product: createdProducts[3], qty: 10, unitPrice: 1500 },
  ]

  for (let i = 0; i < 3; i++) {
    const c = t1CustomersForErp[i]
    if (!c) continue
    const owner = allRepsT1.find((u) => u.id === c.ownerId) ?? t1Admin
    const lines = i === 0 ? erpDemoLines.slice(0, 2) : i === 1 ? erpDemoLines.slice(1, 3) : erpDemoLines.slice(2, 4)
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
    const taxTotal = subtotal * 0.2
    const total = subtotal + taxTotal

    // Teklif
    const quote = await db.quote.create({
      data: {
        tenantId: tenant1.id,
        customerId: c.id,
        number: `TEK-2026-${String(i + 1).padStart(3, '0')}`,
        status: 'onaylandi',
        subtotal,
        taxTotal,
        total,
        currency: 'TRY',
        issueDate: daysAgo(30 - i * 5),
        validUntil: daysFromNow(15 + i * 5),
        lines: {
          create: lines.map((l) => ({
            productId: l.product.id,
            description: l.product.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxRate: 20,
            lineTotal: l.qty * l.unitPrice,
          })),
        },
      },
    })

    // Fatura
    const invoice = await db.invoice.create({
      data: {
        tenantId: tenant1.id,
        customerId: c.id,
        number: `FAT-2026-${String(i + 1).padStart(3, '0')}`,
        status: i === 0 ? 'odendi' : 'odeme_bekliyor',
        subtotal,
        taxTotal,
        total,
        currency: 'TRY',
        issueDate: daysAgo(20 - i * 5),
        dueDate: daysFromNow(10),
        paidDate: i === 0 ? daysAgo(5) : null,
        lines: {
          create: lines.map((l) => ({
            productId: l.product.id,
            description: l.product.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxRate: 20,
            lineTotal: l.qty * l.unitPrice,
          })),
        },
      },
    })

    // Sipariş
    const orderStatus = i === 0 ? 'teslim_edildi' : i === 1 ? 'uretimde' : 'hazirlaniyor'
    const order = await db.order.create({
      data: {
        tenantId: tenant1.id,
        customerId: c.id,
        quoteId: quote.id,
        number: `SIP-2026-${String(i + 1).padStart(3, '0')}`,
        status: orderStatus,
        totalAmount: total,
        currency: 'TRY',
        orderDate: daysAgo(15 - i * 3),
        expectedDelivery: daysFromNow(7),
        deliveredAt: orderStatus === 'teslim_edildi' ? daysAgo(2) : null,
        notes: 'ERP demo sipariş',
      },
    })
    // Fatura ↔ Sipariş ilişkisini kur (Invoice.orderId üzerinden)
    await db.invoice.update({ where: { id: invoice.id }, data: { orderId: order.id } })

    // Sipariş takip adımları
    const steps = ['hazirlaniyor', 'onaylandi', ...(orderStatus !== 'hazirlaniyor' ? ['uretimde'] : []),
      ...(orderStatus === 'teslim_edildi' ? ['sevk_yapildi', 'teslim_edildi'] : [])]
    for (const step of steps) {
      await db.orderTrackingStep.create({
        data: {
          orderId: order.id,
          step,
          note: 'Otomatik oluşturuldu',
          userId: owner.id,
          createdAt: daysAgo(15 - steps.indexOf(step) * 2),
        },
      })
    }

    // Üretim kalemleri — sadece uretimde veya daha ileri durumda olanlar için
    if (orderStatus === 'uretimde' || orderStatus === 'teslim_edildi') {
      for (const l of lines) {
        await db.productionItem.create({
          data: {
            tenantId: tenant1.id,
            orderId: order.id,
            productId: l.product.id,
            description: l.product.name,
            qty: l.qty,
            status: orderStatus === 'teslim_edildi' ? 'uretildi' : 'uretiliyor',
            producedAt: orderStatus === 'teslim_edildi' ? daysAgo(3) : null,
            producedBy: orderStatus === 'teslim_edildi' ? 'Mustafa Depo' : null,
          },
        })
      }
    }
  }

  // ============================================================
  // CAFE-ERP — Demo kafe verisi
  // ============================================================
  // Kafe 1
  const cafe1 = await db.cafe.create({
    data: {
      tenantId: tenant1.id,
      name: 'Boğaziçi Kafe',
      address: 'Beşiktaş, İstanbul',
      phone: '+90 212 555 10 20',
      tableCount: 0,
    },
  })

  // Kafe 2 — farklı lokasyon (multi-cafe test)
  const cafe2 = await db.cafe.create({
    data: {
      tenantId: tenant1.id,
      name: 'Kadıköy Teras Kafe',
      address: 'Kadıköy, İstanbul',
      phone: '+90 216 555 30 40',
      tableCount: 0,
    },
  })

  // Masa düzeni (kuş bakışı) — cafe1 için 8 masa
  const tableShapes = ['square', 'round', 'rectangle', 'square', 'round', 'square', 'rectangle', 'round']
  const tablePositions = [
    { x: 20, y: 25 }, { x: 50, y: 25 }, { x: 80, y: 25 },
    { x: 20, y: 50 }, { x: 50, y: 50 }, { x: 80, y: 50 },
    { x: 30, y: 80 }, { x: 70, y: 80 },
  ]
  for (let i = 0; i < 8; i++) {
    await db.cafeTable.create({
      data: {
        cafeId: cafe1.id,
        number: `M${i + 1}`,
        shape: tableShapes[i],
        x: tablePositions[i].x,
        y: tablePositions[i].y,
        width: tableShapes[i] === 'rectangle' ? 14 : 10,
        height: 10,
        capacity: tableShapes[i] === 'rectangle' ? 6 : 4,
        status: i === 0 ? 'siparis' : i === 1 ? 'dolu' : 'bos',
      },
    })
  }
  await db.cafe.update({ where: { id: cafe1.id }, data: { tableCount: 8 } })

  // cafe2 için 5 masa
  for (let i = 0; i < 5; i++) {
    await db.cafeTable.create({
      data: {
        cafeId: cafe2.id,
        number: `T${i + 1}`,
        shape: i % 2 === 0 ? 'round' : 'square',
        x: 25 + (i % 3) * 25,
        y: 30 + Math.floor(i / 3) * 30,
        width: 10, height: 10,
        capacity: 4, status: 'bos',
      },
    })
  }
  await db.cafe.update({ where: { id: cafe2.id }, data: { tableCount: 5 } })

  // Menü — kafe 1 için kategoriler ve ürünler
  const catBar = await db.menuCategory.create({
    data: { cafeId: cafe1.id, name: 'Sıcak İçecekler', icon: '☕', sortOrder: 0 },
  })
  const catCold = await db.menuCategory.create({
    data: { cafeId: cafe1.id, name: 'Soğuk İçecekler', icon: '🥤', sortOrder: 1 },
  })
  const catFood = await db.menuCategory.create({
    data: { cafeId: cafe1.id, name: 'Ana Yemekler', icon: '🍽️', sortOrder: 2 },
  })
  const catDessert = await db.menuCategory.create({
    data: { cafeId: cafe1.id, name: 'Tatlılar', icon: '🍰', sortOrder: 3 },
  })

  const menuItems = [
    // Bar
    { cat: catBar, name: 'Espresso', price: 45, station: 'bar', prepTime: 5, recipe: '1 shot espresso çek. Küçük fincanda servis et.' },
    { cat: catBar, name: 'Cappuccino', price: 60, station: 'bar', prepTime: 7, recipe: '1 shot espresso + 150ml süt köpüğü. Kakao tozu serpin.' },
    { cat: catBar, name: 'Latte', price: 65, station: 'bar', prepTime: 7, recipe: '1 shot espresso + 200ml süt + ince köpük. Latte art opsiyonel.' },
    { cat: catBar, name: 'Türk Kahvesi', price: 50, station: 'bar', prepTime: 8, recipe: 'Cezvede 2 fincan su + 2 tatlı kaşığı kahve. Kaynat, köpük ile servis et.' },
    { cat: catBar, name: 'Sıcak Çikolata', price: 70, station: 'bar', prepTime: 6, recipe: '200ml süt + 2 yemek kaşığı kakao + şeker. Karıştırarak ısıt.' },
    // Cold drinks (bar)
    { cat: catCold, name: 'Ice Latte', price: 75, station: 'bar', prepTime: 7, recipe: '1 shot espresso + buz + 200ml soğuk süt. Vanilya şurubu ekle.' },
    { cat: catCold, name: 'Limonata', price: 55, station: 'bar', prepTime: 5, recipe: 'Taze limon suyu + su + şeker + nane yaprağı. Buz ile servis et.' },
    { cat: catCold, name: 'Ayran', price: 25, station: 'bar', prepTime: 2, recipe: 'Yoğurt + su + tuz. Köpürt.' },
    // Food (kitchen)
    { cat: catFood, name: 'Tost', price: 80, station: 'kitchen', prepTime: 10, recipe: '2 dilim ekmek arası kaşar, sucuk, domates. Tost makinesinde 3 dk.' },
    { cat: catFood, name: 'Hamburger', price: 180, station: 'kitchen', prepTime: 15, recipe: 'Köfte ızgara, hamburger ekmeği, marul, domates, soğan, sos.' },
    { cat: catFood, name: 'Pasta', price: 120, station: 'kitchen', prepTime: 12, recipe: 'Spaghetti domates sosu ile. Üzerine parmesan serp.' },
    { cat: catFood, name: 'Çorba', price: 65, station: 'kitchen', prepTime: 8, recipe: 'Mercimek çorbası — limon ile servis et.' },
    // Dessert
    { cat: catDessert, name: 'Cheesecake', price: 95, station: 'dessert', prepTime: 3, recipe: 'Hazır dilim — buz gibi servis et.' },
    { cat: catDessert, name: 'Tiramisu', price: 110, station: 'dessert', prepTime: 3, recipe: 'Hazır dilim — kakao tozu ile süsle.' },
    { cat: catDessert, name: 'Sufle', price: 130, station: 'dessert', prepTime: 12, recipe: '180°C fırında 10 dk. Dış kabuk, iç akışkan. Vanilya dondurması ile.' },
  ]
  for (const it of menuItems) {
    await db.menuItem.create({
      data: {
        categoryId: it.cat.id,
        name: it.name,
        price: it.price,
        currency: 'TRY',
        prepTime: it.prepTime,
        station: it.station,
        recipe: it.recipe,
        sortOrder: 0,
        isAvailable: true,
      },
    })
  }

  // Demo sipariş — M1 masasına (bar + mutfak + tatlı kapsamlı)
  const order1 = await db.cafeOrder.create({
    data: {
      cafeId: cafe1.id,
      tableId: (await db.cafeTable.findFirst({ where: { cafeId: cafe1.id, number: 'M1' } }))?.id ?? null,
      number: 'S-0001',
      status: 'hazirlaniyor',
      type: 'dine_in',
      subtotal: 360, taxTotal: 0, total: 360,
      createdById: t1Komi.id,
    },
  })
  const itemsForOrder1 = [
    { name: 'Cappuccino', unitPrice: 60, qty: 2, station: 'bar', status: 'hazir' },
    { name: 'Ice Latte', unitPrice: 75, qty: 1, station: 'bar', status: 'hazirlaniyor' },
    { name: 'Tost', unitPrice: 80, qty: 1, station: 'kitchen', status: 'bekliyor' },
    { name: 'Cheesecake', unitPrice: 85, qty: 1, station: 'dessert', status: 'bekliyor' },
  ]
  for (const it of itemsForOrder1) {
    const mi = await db.menuItem.findFirst({ where: { name: it.name } })
    await db.cafeOrderItem.create({
      data: {
        orderId: order1.id,
        menuItemId: mi?.id ?? null,
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        status: it.status,
        station: it.station,
      },
    })
  }

  // Ödenmiş bir sipariş (bugün) — M2 masasına (kasa raporu için)
  const order2 = await db.cafeOrder.create({
    data: {
      cafeId: cafe1.id,
      tableId: (await db.cafeTable.findFirst({ where: { cafeId: cafe1.id, number: 'M2' } }))?.id ?? null,
      number: 'S-0002',
      status: 'odendi',
      type: 'dine_in',
      subtotal: 245, taxTotal: 0, total: 245,
      createdById: t1Komi.id,
      createdAt: new Date(Date.now() - 3600 * 1000 * 2),
    },
  })
  const itemsForOrder2 = [
    { name: 'Türk Kahvesi', unitPrice: 50, qty: 2, station: 'bar', status: 'servis_edildi' },
    { name: 'Çorba', unitPrice: 65, qty: 1, station: 'kitchen', status: 'servis_edildi' },
    { name: 'Sufle', unitPrice: 130, qty: 1, station: 'dessert', status: 'servis_edildi' },
  ]
  for (const it of itemsForOrder2) {
    const mi = await db.menuItem.findFirst({ where: { name: it.name } })
    await db.cafeOrderItem.create({
      data: {
        orderId: order2.id,
        menuItemId: mi?.id ?? null,
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        status: it.status,
        station: it.station,
      },
    })
  }
  await db.cafePayment.create({
    data: {
      orderId: order2.id,
      amount: 150,
      method: 'cash',
      status: 'tamamlandi',
    },
  })
  await db.cafePayment.create({
    data: {
      orderId: order2.id,
      amount: 95,
      method: 'card',
      status: 'tamamlandi',
    },
  })

  // ============================================================
  // MARKET-ERP — Demo market verisi
  // ============================================================
  // Market ürünleri (FMCG) — gerçekçi barkod kodları ile
  const marketProducts = [
    { name: 'Ekmek (Tam Buğday)', sku: 'MK-EK-01', barcode: '8690000000017', price: 7.5, stock: 80, minStock: 20, category: 'Unlu Mamul', unit: 'adet', taxRate: 1 },
    { name: 'Süt 1L', sku: 'MK-SUT-1L', barcode: '8690000000024', price: 22.5, stock: 50, minStock: 15, category: 'Süt Ürünleri', unit: 'lt', taxRate: 1 },
    { name: 'Yoğurt 1kg', sku: 'MK-YOG-1K', barcode: '8690000000031', price: 45, stock: 30, minStock: 10, category: 'Süt Ürünleri', unit: 'kg', taxRate: 1 },
    { name: 'Beyaz Peynir 500g', sku: 'MK-PEY-500', barcode: '8690000000048', price: 120, stock: 25, minStock: 8, category: 'Süt Ürünleri', unit: 'pk', taxRate: 1 },
    { name: 'Çikolata (Sütlü)', sku: 'MK-CIK-01', barcode: '8690000000055', price: 18.5, stock: 100, minStock: 30, category: 'Atıştırmalık', unit: 'adet', taxRate: 20 },
    { name: 'Bisküvi (Kakaolu)', sku: 'MK-BIS-01', barcode: '8690000000062', price: 12.75, stock: 75, minStock: 25, category: 'Atıştırmalık', unit: 'pk', taxRate: 20 },
    { name: 'Coca Cola 1L', sku: 'MK-CC-1L', barcode: '8690000000079', price: 25, stock: 60, minStock: 20, category: 'İçecek', unit: 'lt', taxRate: 20 },
    { name: 'Su 0.5L', sku: 'MK-SU-05', barcode: '8690000000086', price: 5, stock: 200, minStock: 50, category: 'İçecek', unit: 'adet', taxRate: 8 },
    { name: 'Çay 1kg', sku: 'MK-CAY-1K', barcode: '8690000000093', price: 145, stock: 40, minStock: 10, category: 'İçecek', unit: 'kg', taxRate: 8 },
    { name: 'Şeker 1kg', sku: 'MK-SEK-1K', barcode: '8690000000109', price: 28, stock: 90, minStock: 30, category: 'Gıda', unit: 'kg', taxRate: 1 },
    { name: 'Un 1kg', sku: 'MK-UN-1K', barcode: '8690000000116', price: 19.5, stock: 70, minStock: 20, category: 'Gıda', unit: 'kg', taxRate: 1 },
    { name: 'Ayçiçek Yağı 1L', sku: 'MK-YAG-1L', barcode: '8690000000123', price: 65, stock: 35, minStock: 10, category: 'Gıda', unit: 'lt', taxRate: 8 },
    { name: 'Makarna 500g', sku: 'MK-MAK-500', barcode: '8690000000130', price: 14.25, stock: 110, minStock: 40, category: 'Gıda', unit: 'pk', taxRate: 1 },
    { name: 'Pirinç 1kg', sku: 'MK-PRC-1K', barcode: '8690000000147', price: 52, stock: 45, minStock: 15, category: 'Gıda', unit: 'kg', taxRate: 1 },
    { name: 'Tuvalet Kağıdı 8li', sku: 'MK-TK-8', barcode: '8690000000154', price: 89.9, stock: 25, minStock: 8, category: 'Temizlik', unit: 'pk', taxRate: 20 },
  ]

  const createdMarketProducts: Array<{ id: string; name: string; price: number; stock: number; taxRate: number; category: string | null }> = []
  for (const p of marketProducts) {
    const prod = await db.product.create({
      data: {
        tenantId: tenant1.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        currency: 'TRY',
        taxRate: p.taxRate,
        stock: p.stock,
        minStock: p.minStock,
        unit: p.unit,
        category: p.category,
      },
    })
    createdMarketProducts.push({ id: prod.id, name: prod.name, price: prod.price, stock: prod.stock, taxRate: prod.taxRate, category: prod.category })
  }

  // Market oluştur
  const market1 = await db.market.create({
    data: {
      tenantId: tenant1.id,
      name: 'Anadolu Market — Merkez',
      address: 'Atatürk Cad. No:42, İstanbul',
      phone: '+90 212 555 11 22',
      isActive: true,
    },
  })

  // Raflar
  const shelves = [
    { code: 'A1', name: 'Ekmek Bölümü', aisle: '1' },
    { code: 'A2', name: 'Süt Ürünleri', aisle: '1' },
    { code: 'B1', name: 'Atıştırmalık', aisle: '2' },
    { code: 'B2', name: 'İçecekler', aisle: '2' },
    { code: 'C1', name: 'Temel Gıda', aisle: '3' },
    { code: 'D1', name: 'Temizlik', aisle: '4' },
  ]
  const createdShelves: Array<{ id: string; code: string }> = []
  for (const s of shelves) {
    const sh = await db.shelf.create({
      data: { marketId: market1.id, code: s.code, name: s.name, aisle: s.aisle },
    })
    createdShelves.push({ id: sh.id, code: sh.code })
  }

  // Barkodları ve raf yerleşimlerini oluştur
  const shelfMapping: Record<string, number> = {
    '8690000000017': 0, // Ekmek → A1
    '8690000000024': 1, // Süt → A2
    '8690000000031': 1, // Yoğurt → A2
    '8690000000048': 1, // Peynir → A2
    '8690000000055': 2, // Çikolata → B1
    '8690000000062': 2, // Bisküvi → B1
    '8690000000079': 3, // Coca Cola → B2
    '8690000000086': 3, // Su → B2
    '8690000000093': 3, // Çay → B2
    '8690000000109': 4, // Şeker → C1
    '8690000000116': 4, // Un → C1
    '8690000000123': 4, // Yağ → C1
    '8690000000130': 4, // Makarna → C1
    '8690000000147': 4, // Pirinç → C1
    '8690000000154': 5, // Tuvalet Kağıdı → D1
  }

  for (let i = 0; i < createdMarketProducts.length; i++) {
    const p = createdMarketProducts[i]
    const barcode = marketProducts[i].barcode
    await db.barcode.create({
      data: {
        marketId: market1.id,
        productId: p.id,
        code: barcode,
        type: 'ean13',
      },
    })
    // Raf yerleşimi
    const shelfIdx = shelfMapping[barcode]
    if (shelfIdx !== undefined) {
      const shelf = createdShelves[shelfIdx]
      await db.shelfItem.create({
        data: {
          shelfId: shelf.id,
          productId: p.id,
          qty: Math.max(2, Math.floor(p.stock * 0.3)),
          minDisplayQty: 3,
        },
      })
    }
  }

  // Açık vardiya
  const openShift = await db.posShift.create({
    data: {
      marketId: market1.id,
      userId: t1Admin.id,
      number: 'V-001',
      status: 'acik',
      openingCash: 500,
      openingTime: new Date(),
    },
  })

  // Bugünün satışları (3 örnek fiş)
  const saleScenarios = [
    { items: [0, 4, 6], qtys: [2, 1, 1], payment: 'cash' as const }, // Ekmek 2 + Çikolata 1 + Coca 1
    { items: [1, 2, 9], qtys: [1, 1, 2], payment: 'card' as const }, // Süt + Yoğurt + Şeker
    { items: [7, 12], qtys: [3, 2], payment: 'mixed' as const }, // Su 3 + Makarna 2
  ]

  for (let i = 0; i < saleScenarios.length; i++) {
    const sc = saleScenarios[i]
    const items: Array<{ productId: string; name: string; qty: number; unitPrice: number; taxRate: number; lineTotal: number; barcode: string | null }> = []
    let subtotal = 0
    for (let j = 0; j < sc.items.length; j++) {
      const p = createdMarketProducts[sc.items[j]]
      const qty = sc.qtys[j]
      const lineTotal = p.price * qty
      subtotal += lineTotal
      items.push({
        productId: p.id,
        name: p.name,
        qty,
        unitPrice: p.price,
        taxRate: p.taxRate,
        lineTotal,
        barcode: marketProducts[sc.items[j]].barcode,
      })
    }
    const taxTotal = items.reduce((s, x) => s + x.lineTotal - x.lineTotal / (1 + x.taxRate / 100), 0)
    const total = subtotal

    const sale = await db.marketSale.create({
      data: {
        marketId: market1.id,
        posShiftId: openShift.id,
        number: `FIS-${String(i + 1).padStart(3, '0')}`,
        type: 'satis',
        status: 'tamamlandi',
        subtotal,
        taxTotal,
        discount: 0,
        total,
        paymentMethod: sc.payment,
        cashAmount: sc.payment === 'cash' ? total : sc.payment === 'mixed' ? Math.floor(total / 2) : 0,
        cardAmount: sc.payment === 'card' ? total : sc.payment === 'mixed' ? total - Math.floor(total / 2) : 0,
        userId: t1Admin.id,
        createdAt: daysAgo(0),
      },
    })
    for (const it of items) {
      await db.marketSaleItem.create({
        data: {
          saleId: sale.id,
          productId: it.productId,
          barcode: it.barcode,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
          discount: 0,
          lineTotal: it.lineTotal,
        },
      })
      // Stok düş
      await db.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: it.qty } },
      })
      await db.stockMovement.create({
        data: {
          productId: it.productId,
          quantity: -it.qty,
          type: 'cikis',
          reason: 'POS Satış',
          refType: 'market_sale',
          refId: sale.id,
        },
      })
    }
  }

  // Mal kabul örneği (bekliyor)
  const purchase = await db.purchase.create({
    data: {
      marketId: market1.id,
      number: 'MK-001',
      supplier: 'Anadolu Gıda Dağıtım',
      invoiceNo: 'IRS-2025-0142',
      status: 'bekliyor',
      totalAmount: 850,
      createdById: t1Admin.id,
      items: {
        create: [
          { productId: createdMarketProducts[0].id, barcode: marketProducts[0].barcode, name: createdMarketProducts[0].name, qty: 20, unitPrice: 5, lineTotal: 100 },
          { productId: createdMarketProducts[1].id, barcode: marketProducts[1].barcode, name: createdMarketProducts[1].name, qty: 15, unitPrice: 18, lineTotal: 270 },
          { productId: createdMarketProducts[4].id, barcode: marketProducts[4].barcode, name: createdMarketProducts[4].name, qty: 30, unitPrice: 16, lineTotal: 480 },
        ],
      },
    },
  })
  void purchase

  // Kasiyer ve depo sorumlusu kullanıcılar
  const kasiyer = await db.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'kasiyer@anadolu.com',
      name: 'Elif Kasiyer',
      role: 'kasiyer',
      permissions: JSON.stringify(getRolePermissions('kasiyer')),
      status: 'active',
      title: 'Kasiyer',
      phone: '+90 532 444 55 66',
    },
  })
  const depo = await db.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'depo@anadolu.com',
      name: 'Mustafa Depo',
      role: 'depo_sorumlusu',
      permissions: JSON.stringify(getRolePermissions('depo_sorumlusu')),
      status: 'active',
      title: 'Depo Sorumlusu',
      phone: '+90 532 777 88 99',
    },
  })
  void kasiyer
  void depo

  // ============================================================
  // RANDEVU SİSTEMİ — Berber/Kuaför/Dişçi/Güzellik
  // ============================================================
  // 1 ServiceProvider, 3 Staff, 6 Services, 8 örnek randevu
  const workingHours = JSON.stringify({
    mon: { start: '09:00', end: '19:00' },
    tue: { start: '09:00', end: '19:00' },
    wed: { start: '09:00', end: '19:00' },
    thu: { start: '09:00', end: '19:00' },
    fri: { start: '09:00', end: '19:00' },
    sat: { start: '10:00', end: '18:00' },
    sun: { closed: true },
  })

  const provider1 = await db.serviceProvider.create({
    data: {
      tenantId: tenant1.id,
      name: 'Şık Kuaför & Berber Salonu',
      slug: 'sik-kuafor',
      type: 'kuafor',
      address: 'Bağdat Caddesi No:142 Kadıköy',
      city: 'İstanbul',
      district: 'Kadıköy',
      phone: '+90 216 555 12 34',
      email: 'randevu@sikkuafur.com',
      workingHours,
      isActive: true,
    },
  })

  // Personeller
  const staffAhmet = await db.staff.create({
    data: {
      providerId: provider1.id,
      name: 'Ahmet Usta',
      title: 'Usta Berber',
      phone: '+90 532 111 22 33',
      bio: '20 yıllık deneyim. Klasik erkek kesimi ve sakal tasarlama uzmanı.',
      sortOrder: 0,
      isActive: true,
    },
  })
  const staffAyse = await db.staff.create({
    data: {
      providerId: provider1.id,
      name: 'Ayşe Hanım',
      title: 'Kuaför',
      phone: '+90 532 222 33 44',
      bio: 'Kadın saç kesimi, boyama ve fön uzmanı.',
      sortOrder: 1,
      isActive: true,
    },
  })
  const staffMehmet = await db.staff.create({
    data: {
      providerId: provider1.id,
      name: 'Mehmet Bey',
      title: 'Berber & Stilist',
      phone: '+90 532 333 44 55',
      bio: 'Modern erkek kesimi, sakal bakımı ve cilt temizleme.',
      sortOrder: 2,
      isActive: true,
    },
  })

  // Hizmetler
  const svcSacKesim = await db.service.create({
    data: {
      providerId: provider1.id,
      name: 'Saç Kesimi',
      description: 'Yıkama dahil profesyonel saç kesimi.',
      duration: 30,
      price: 150,
      currency: 'TRY',
      category: 'Saç',
      sortOrder: 0,
      isActive: true,
    },
  })
  const svcSakal = await db.service.create({
    data: {
      providerId: provider1.id,
      name: 'Sakal Traşı',
      description: 'Sıcak havlu ile klasik sakal traşı.',
      duration: 20,
      price: 80,
      currency: 'TRY',
      category: 'Sakal',
      sortOrder: 1,
      isActive: true,
    },
  })
  const svcBoyama = await db.service.create({
    data: {
      providerId: provider1.id,
      name: 'Saç Boyama',
      description: 'Tek renk veya balyaj. Kaliteli boya ile.',
      duration: 90,
      price: 500,
      currency: 'TRY',
      category: 'Saç',
      sortOrder: 2,
      isActive: true,
    },
  })
  const svcCilt = await db.service.create({
    data: {
      providerId: provider1.id,
      name: 'Cilt Bakımı',
      description: 'Buhar banyosu + maske + nem bakımı.',
      duration: 60,
      price: 400,
      currency: 'TRY',
      category: 'Cilt',
      sortOrder: 3,
      isActive: true,
    },
  })
  const svcManikur = await db.service.create({
    data: {
      providerId: provider1.id,
      name: 'Manikür',
      description: 'Tırnak bakımı ve cila.',
      duration: 45,
      price: 200,
      currency: 'TRY',
      category: 'Bakım',
      sortOrder: 4,
      isActive: true,
    },
  })
  const svcPedikur = await db.service.create({
    data: {
      providerId: provider1.id,
      name: 'Pedikür',
      description: 'Ayak bakımı ve cila.',
      duration: 45,
      price: 200,
      currency: 'TRY',
      category: 'Bakım',
      sortOrder: 5,
      isActive: true,
    },
  })

  // Personel-hizmet bağlantıları
  // Ahmet: Saç Kesimi, Sakal (erkek berberi)
  await db.staffService.create({ data: { staffId: staffAhmet.id, serviceId: svcSacKesim.id } })
  await db.staffService.create({ data: { staffId: staffAhmet.id, serviceId: svcSakal.id } })
  // Ayşe: Saç Kesimi, Saç Boyama, Cilt Bakımı, Manikür, Pedikür
  await db.staffService.create({ data: { staffId: staffAyse.id, serviceId: svcSacKesim.id } })
  await db.staffService.create({ data: { staffId: staffAyse.id, serviceId: svcBoyama.id } })
  await db.staffService.create({ data: { staffId: staffAyse.id, serviceId: svcCilt.id } })
  await db.staffService.create({ data: { staffId: staffAyse.id, serviceId: svcManikur.id } })
  await db.staffService.create({ data: { staffId: staffAyse.id, serviceId: svcPedikur.id } })
  // Mehmet: Saç Kesimi, Sakal, Cilt Bakımı
  await db.staffService.create({ data: { staffId: staffMehmet.id, serviceId: svcSacKesim.id } })
  await db.staffService.create({ data: { staffId: staffMehmet.id, serviceId: svcSakal.id } })
  await db.staffService.create({ data: { staffId: staffMehmet.id, serviceId: svcCilt.id } })

  // Örnek randevular — bugün ve yarın için
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function makeAppt(
    staffId: string,
    serviceId: string,
    dayOffset: number,
    hour: number,
    minute: number,
    customerName: string,
    customerPhone: string,
    status: 'beklemede' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi' = 'onaylandi',
  ) {
    const start = new Date(today.getTime() + dayOffset * 24 * 60 * 60_000)
    start.setHours(hour, minute, 0, 0)
    return { staffId, serviceId, customerName, customerPhone, start, status }
  }

  const sampleAppts = [
    // Bugün
    makeAppt(staffAhmet.id, svcSacKesim.id, 0, 10, 0, 'Murat Yılmaz', '+90 532 123 45 67', 'tamamlandi'),
    makeAppt(staffAhmet.id, svcSakal.id, 0, 11, 0, 'Kemal Aslan', '+90 532 234 56 78', 'onaylandi'),
    makeAppt(staffAyse.id, svcBoyama.id, 0, 9, 30, 'Selin Demir', '+90 532 345 67 89', 'onaylandi'),
    makeAppt(staffAyse.id, svcManikur.id, 0, 14, 0, 'Ece Kaya', '+90 532 456 78 90', 'beklemede'),
    makeAppt(staffMehmet.id, svcSacKesim.id, 0, 13, 30, 'Burak Şahin', '+90 532 567 89 01', 'onaylandi'),
    // Yarın
    makeAppt(staffAhmet.id, svcSacKesim.id, 1, 10, 30, 'Okan Çelik', '+90 532 678 90 12', 'onaylandi'),
    makeAppt(staffAyse.id, svcCilt.id, 1, 11, 0, 'Deniz Yıldız', '+90 532 789 01 23', 'onaylandi'),
    makeAppt(staffMehmet.id, svcSakal.id, 1, 15, 0, 'Tolga Aydın', '+90 532 890 12 34', 'iptal'),
  ]

  for (const a of sampleAppts) {
    const svc = [svcSacKesim, svcSakal, svcBoyama, svcCilt, svcManikur, svcPedikur].find((s) => s.id === a.serviceId)!
    const end = new Date(a.start.getTime() + svc.duration * 60_000)
    await db.appointment.create({
      data: {
        providerId: provider1.id,
        staffId: a.staffId,
        serviceId: a.serviceId,
        customerName: a.customerName,
        customerPhone: a.customerPhone,
        date: a.start,
        endTime: end,
        status: a.status,
        price: svc.price,
        source: 'web',
      },
    })
  }

  // === EMPLOYEE CODE — Her kullanıcıya eşsiz kod ===
  const allUsers = await db.user.findMany({ include: { tenant: { select: { name: true } } } })
  let seq = 0
  for (const u of allUsers) {
    // Program Admini zaten 'GNC-001' koduna sahip — üzerine yazma
    if (u.email === 'admin@gnccrm.app') continue
    seq++
    const code = generateEmployeeCode(u.tenantId, seq)
    await db.user.update({ where: { id: u.id }, data: { employeeCode: code } })
  }

  // === VARSAYILAN ŞİFRE — Yeni seed'lenen kullanıcılar '1234' ile giriş yapabilir ===
  // (bcrypt hash; kullanıcılar ilk girişten sonra Şifre Değiştir ile güncellemelidir)
  const { default: bcrypt } = await import('bcryptjs')
  const defaultHash = await bcrypt.hash('1234', 10)
  await db.user.updateMany({ where: { passwordHash: null }, data: { passwordHash: defaultHash } })

  // Program Admini — varsayılan 1234 DEĞİL: ayrıcalıklı hesabın şifresi 314159
  const adminHash = await bcrypt.hash('314159', 10)
  await db.user.updateMany({ where: { email: 'admin@gnccrm.app' }, data: { passwordHash: adminHash } })

  const counts = {
    tenants: 6,
    users: 18,
    customers: 30,
    contacts: 50,
    activities: 100,
    deals: 25,
    tasks: 20,
    notes: 30,
    leads: 15,
    mapsSearches: 3,
    auditLogs: 10,
    products: 4 + marketProducts.length + anadoluProductsData.length,
    cafes: 2 + 1, // 2 (tenant1) + 1 Şık Kafe (tenantCafe)
    cafeTables: 13 + kafeTables.length,
    menuItems: menuItems.length + kafeMenuItems.length,
    cafeOrdersPaid: kafeOrderScenarios.length,
    markets: 1 + 1, // 1 (tenant1) + 1 Anadolu Market (tenantMarket)
    marketShelves: shelves.length + anadoluShelfDefs.length,
    marketBarcodes: marketProducts.length + 3,
    marketSales: saleScenarios.length + amSaleScenarios.length,
    serviceProviders: 1,
    staff: 3,
    services: 6,
    appointments: sampleAppts.length,
  }

  return { success: true, message: 'Demo veri başarıyla oluşturuldu', counts }
}
