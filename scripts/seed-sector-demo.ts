// SECTOR-DEMO-SEED — Kafe & Market tenant'larına demo veri doldurur.
// Idempotent: kayıt varsa dokunmaz, yoksa oluşturur.
// Kullanım: bun run scripts/seed-sector-demo.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const tenantCafe = await db.tenant.findFirst({ where: { name: { contains: 'Kafe' } } })
const tenantMarket = await db.tenant.findFirst({ where: { name: { contains: 'Market' } } })

if (!tenantCafe || !tenantMarket) {
  console.error('Cafe/Market tenant bulunamadı — seed önce çalıştırılmalı')
  process.exit(1)
}

// ============================================================
// 1) CAFE — Şık Kafe & Restoran
// ============================================================
let cafe = await db.cafe.findFirst({ where: { tenantId: tenantCafe.id } })
if (!cafe) {
  cafe = await db.cafe.create({
    data: {
      tenantId: tenantCafe.id,
      name: 'Şık Kafe & Restoran — Kadıköy',
      address: 'Bağdat Caddesi No:142 Kadıköy, İstanbul',
      phone: '+90 216 555 12 34',
      tableCount: 0,
    },
  })
  console.log('✓ Kafe oluşturuldu:', cafe.name)

  // 8 masa — kuş bakışı konumlar
  const shapes = ['square', 'round', 'rectangle', 'square', 'round', 'square', 'rectangle', 'round']
  const positions = [
    { x: 20, y: 25 }, { x: 50, y: 25 }, { x: 80, y: 25 },
    { x: 20, y: 60 }, { x: 50, y: 60 }, { x: 80, y: 60 },
    { x: 35, y: 85 }, { x: 65, y: 85 },
  ]
  const tables: { id: string; number: string }[] = []
  for (let i = 0; i < 8; i++) {
    const t = await db.cafeTable.create({
      data: {
        cafeId: cafe.id,
        number: `${i + 1}`,
        shape: shapes[i],
        x: positions[i].x, y: positions[i].y,
        width: shapes[i] === 'rectangle' ? 14 : 10,
        height: shapes[i] === 'rectangle' ? 10 : 10,
        capacity: i % 3 === 0 ? 6 : 4,
        status: 'bos',
      },
    })
    tables.push({ id: t.id, number: t.number })
  }

  // 4 kategori + 15 menü kalemi
  const categories = await Promise.all([
    db.menuCategory.create({ data: { cafeId: cafe.id, name: 'Kahvaltı', icon: '🥐', sortOrder: 0 } }),
    db.menuCategory.create({ data: { cafeId: cafe.id, name: 'Ana Yemek', icon: '🍽️', sortOrder: 1 } }),
    db.menuCategory.create({ data: { cafeId: cafe.id, name: 'Kahveler', icon: '☕', sortOrder: 2 } }),
    db.menuCategory.create({ data: { cafeId: cafe.id, name: 'Tatlılar', icon: '🍰', sortOrder: 3 } }),
  ])
  const menuDefs: { cat: number; name: string; price: number; station: string; desc?: string }[] = [
    { cat: 0, name: 'Serpme Kahvaltı (2 kişilik)', price: 380, station: 'kitchen', desc: '25 çeşit serpme' },
    { cat: 0, name: 'Menemen', price: 120, station: 'kitchen' },
    { cat: 0, name: 'Omlet', price: 110, station: 'kitchen' },
    { cat: 0, name: 'Tost Karışık', price: 95, station: 'kitchen' },
    { cat: 1, name: 'Izgara Köfte', price: 260, station: 'kitchen' },
    { cat: 1, name: 'Tavuk Şiş', price: 240, station: 'kitchen' },
    { cat: 1, name: 'Mantı', price: 190, station: 'kitchen' },
    { cat: 1, name: 'Çoban Salata', price: 110, station: 'kitchen' },
    { cat: 2, name: 'Türk Kahvesi', price: 60, station: 'bar' },
    { cat: 2, name: 'Filtre Kahve', price: 70, station: 'bar' },
    { cat: 2, name: 'Latte', price: 85, station: 'bar' },
    { cat: 2, name: 'Çay', price: 30, station: 'bar' },
    { cat: 3, name: 'Cheesecake', price: 140, station: 'dessert' },
    { cat: 3, name: 'San Sebastian', price: 160, station: 'dessert' },
    { cat: 3, name: 'Sufle', price: 130, station: 'dessert' },
  ]
  const menuItems: { id: string; name: string; price: number }[] = []
  for (let i = 0; i < menuDefs.length; i++) {
    const m = menuDefs[i]
    const item = await db.menuItem.create({
      data: {
        categoryId: categories[m.cat].id,
        name: m.name,
        description: m.desc ?? null,
        price: m.price,
        station: m.station,
        prepTime: m.station === 'bar' ? 4 : 15,
        sortOrder: i,
      },
    })
    menuItems.push({ id: item.id, name: item.name, price: item.price })
  }

  // Bugüne ait 6 kapanmış (ödendi) sipariş — dashboard ciro görünsün
  const cafeStaff = await db.user.findFirst({ where: { tenantId: tenantCafe.id, role: 'admin' } })
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
  for (let i = 0; i < 6; i++) {
    const table = pick(tables)
    const lineCount = 1 + Math.floor(Math.random() * 3)
    const lines = Array.from({ length: lineCount }, () => pick(menuItems))
    let subtotal = 0
    const items = lines.map((l) => {
      const qty = 1 + Math.floor(Math.random() * 2)
      subtotal += l.price * qty
      return { name: l.name, qty, unitPrice: l.price }
    })
    const total = subtotal * 1.1
    await db.cafeOrder.create({
      data: {
        cafeId: cafe.id,
        tableId: table.id,
        number: `S-${String(i + 1).padStart(3, '0')}`,
        status: 'odendi',
        type: i === 5 ? 'takeaway' : 'dine_in',
        customerName: i === 5 ? 'Paket Servis' : null,
        subtotal,
        taxTotal: total - subtotal,
        total,
        createdById: cafeStaff?.id ?? null,
        createdAt: new Date(Date.now() - (6 - i) * 45 * 60 * 1000),
        items: {
          create: items.map((it, k) => ({
            name: it.name,
            qty: it.qty,
            unitPrice: it.unitPrice,
            status: 'servis_edildi',
            station: 'kitchen',
          })),
        },
        payments: {
          create: { amount: total, method: i % 2 === 0 ? 'cash' : 'card', status: 'tamamlandi' },
        },
      },
    })
  }
  console.log('✓ 8 masa + 4 kategori + 15 menü + 6 ödenmiş sipariş')
} else {
  console.log('• Kafe zaten var:', cafe.name)
}

// ============================================================
// 2) MARKET — Anadolu Market Zinciri
// ============================================================
let market = await db.market.findFirst({ where: { tenantId: tenantMarket.id } })
if (!market) {
  market = await db.market.create({
    data: {
      tenantId: tenantMarket.id,
      name: 'Anadolu Market — Kadıköy Şube',
      address: 'Caferağa Mah. Moda Cad. No:55 Kadıköy, İstanbul',
      phone: '+90 216 555 22 11',
      isActive: true,
    },
  })
  console.log('✓ Market oluşturuldu:', market.name)

  // 5 raf
  const shelfDefs = [
    { code: 'A1', name: 'Ekmek & Fırın', aisle: '1' },
    { code: 'A2', name: 'Süt Ürünleri', aisle: '1' },
    { code: 'B1', name: 'Atıştırmalık', aisle: '2' },
    { code: 'B2', name: 'İçecek', aisle: '2' },
    { code: 'C1', name: 'Temizlik', aisle: '3' },
  ]
  const shelves: Record<string, string> = {}
  for (const s of shelfDefs) {
    const sh = await db.shelf.create({ data: { marketId: market.id, ...s } })
    shelves[s.code] = sh.id
  }

  // 15 ürün + barkod + raf konumu
  const products: { id: string; name: string; price: number; taxRate: number; stock: number }[] = []
  const productDefs = [
    { name: 'Tam Buğday Ekmek 500g', price: 35, stock: 40, shelf: 'A1', cat: 'Fırın' },
    { name: 'Baget Ekmek', price: 22, stock: 55, shelf: 'A1', cat: 'Fırın' },
    { name: 'Simit', price: 12, stock: 80, shelf: 'A1', cat: 'Fırın' },
    { name: 'Tam Yağlı Süt 1L', price: 42, stock: 60, shelf: 'A2', cat: 'Süt' },
    { name: 'Yoğurt 1.5kg', price: 88, stock: 30, shelf: 'A2', cat: 'Süt' },
    { name: 'Beyaz Peynir 400g', price: 135, stock: 25, shelf: 'A2', cat: 'Süt' },
    { name: 'Ayran 300ml', price: 18, stock: 70, shelf: 'A2', cat: 'Süt' },
    { name: 'Cips 110g', price: 49, stock: 65, shelf: 'B1', cat: 'Atıştırmalık' },
    { name: 'Bisküvi Paket', price: 32, stock: 90, shelf: 'B1', cat: 'Atıştırmalık' },
    { name: 'Fındık Kreması 350g', price: 95, stock: 40, shelf: 'B1', cat: 'Atıştırmalık' },
    { name: 'Kola 1L', price: 45, stock: 75, shelf: 'B2', cat: 'İçecek' },
    { name: 'Su 5L', price: 30, stock: 100, shelf: 'B2', cat: 'İçecek' },
    { name: 'Meyve Suyu 1L', price: 55, stock: 50, shelf: 'B2', cat: 'İçecek' },
    { name: 'Bulaşık Deterjanı 750ml', price: 78, stock: 35, shelf: 'C1', cat: 'Temizlik' },
    { name: 'Çamaşır Suyu 1L', price: 42, stock: 45, shelf: 'C1', cat: 'Temizlik' },
  ]
  for (let i = 0; i < productDefs.length; i++) {
    const p = productDefs[i]
    const created = await db.product.create({
      data: {
        tenantId: tenantMarket.id,
        name: p.name,
        sku: `MK-${String(i + 1).padStart(4, '0')}`,
        price: p.price,
        taxRate: p.cat === 'Fırın' ? 1 : 20,
        stock: p.stock,
        minStock: 10,
        unit: 'adet',
        category: p.cat,
      },
    })
    products.push({ id: created.id, name: created.name, price: p.price, taxRate: p.taxRate, stock: p.stock })
    // EAN-13 benzeri barkod
    let code = `869${String(i + 1).padStart(9, '0')}`
    code += String((9 - (code.split('').reduce((s, c, idx) => s + Number(c) * (idx % 2 === 0 ? 1 : 3), 0)) % 10) % 10)
    await db.barcode.create({ data: { marketId: market.id, productId: created.id, code, type: 'ean13' } })
    await db.shelfItem.create({ data: { shelfId: shelves[p.shelf], productId: created.id, qty: p.stock, minDisplayQty: 10 } })
  }

  // Kasiyer + açık vardiya
  const kasiyer = await db.user.findFirst({ where: { tenantId: tenantMarket.id, role: 'kasiyer' } })
  const shift = await db.posShift.create({
    data: {
      marketId: market.id,
      userId: kasiyer?.id ?? 'system',
      number: 'V-001',
      status: 'acik',
      openingCash: 1000,
      openingTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
  })

  // Bugüne 10 fiş — karışık ödeme
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
  let cashSum = 0
  for (let i = 0; i < 10; i++) {
    const lineCount = 1 + Math.floor(Math.random() * 4)
    const chosen = Array.from({ length: lineCount }, () => pick(products))
    let subtotal = 0
    const items = chosen.map((p) => {
      const qty = 1 + Math.floor(Math.random() * 3)
      const lineTotal = p.price * qty
      subtotal += lineTotal
      return { productId: p.id, barcode: null, name: p.name, qty, unitPrice: p.price, taxRate: p.taxRate, discount: 0, lineTotal }
    })
    const total = subtotal * 1.1
    const method = pick(['cash', 'card', 'card'])
    const cashAmount = method === 'cash' ? total : 0
    cashSum += cashAmount
    await db.marketSale.create({
      data: {
        marketId: market.id,
        posShiftId: shift.id,
        number: `FIS-${String(i + 1).padStart(4, '0')}`,
        type: 'satis',
        status: 'tamamlandi',
        subtotal,
        taxTotal: total - subtotal,
        total,
        paymentMethod: method,
        cashAmount,
        cardAmount: method === 'card' ? total : 0,
        userId: kasiyer?.id ?? null,
        createdAt: new Date(Date.now() - (10 - i) * 22 * 60 * 1000),
        items: { create: items },
      },
    })
  }
  await db.posShift.update({ where: { id: shift.id }, data: { expectedCash: 1000 + cashSum } })
  console.log('✓ 5 raf + 15 ürün/barkod + vardiya + 10 fiş')
} else {
  console.log('• Market zaten var:', market.name)
}

console.log('BİTTİ')
await db.$disconnect()
