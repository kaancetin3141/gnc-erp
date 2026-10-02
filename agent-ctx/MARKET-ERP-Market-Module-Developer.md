# MARKET-ERP — Market ERP Modülü

**Task ID:** MARKET-ERP
**Agent:** Market Module Developer
**Tarih:** 2026-09-11
**Durum:** Tamamlandı

## Özet
GNC CRM süperappına tam kapsamlı Market ERP modülü eklendi: stok, kasa (POS), barkod, satış,
vardiya, iade, mal kabul, stok sayımı, raf yönetimi ve raporlar.

## Eklenen Roller
- `kasiyer` (Kasiyer) — POS/satış yetkisi
- `depo_sorumlusu` (Depo Sorumlusu) — stok/sayım/mal kabul yetkisi

## Eklenen Yetkiler
- `market.view` — tüm market rolleri + admin
- `market.pos` — kasiyer + admin
- `market.stock` — depo_sorumlusu + admin
- `market.manage` — admin + superadmin

## Dosya Yapısı
```
src/app/api/market/
├── route.ts                              # Market CRUD
├── [id]/
│   ├── route.ts                          # GET/PATCH/DELETE market
│   ├── shelves/                          # Raf yönetimi
│   │   ├── route.ts
│   │   └── [shelfId]/
│   │       ├── route.ts
│   │       └── items/route.ts
│   ├── barcodes/                         # Barkod yönetimi + lookup
│   │   ├── route.ts
│   │   ├── lookup/route.ts
│   │   └── [barcodeId]/route.ts
│   ├── pos/
│   │   ├── shifts/                       # Vardiya aç/kapat
│   │   │   ├── route.ts
│   │   │   └── [shiftId]/route.ts
│   │   └── sales/                        # Satış + iade
│   │       ├── route.ts
│   │       └── [saleId]/
│   │           ├── route.ts
│   │           └── return/route.ts
│   ├── stock-counts/                     # Stok sayımı
│   │   ├── route.ts
│   │   └── [countId]/
│   │       ├── route.ts
│   │       └── items/[itemId]/route.ts
│   ├── purchases/                        # Mal kabul
│   │   ├── route.ts
│   │   └── [purchaseId]/
│   │       ├── route.ts
│   │       └── items/[itemId]/route.ts
│   └── reports/route.ts                  # Raporlar

src/components/market/
├── market-view.tsx          # Ana view + tabs
├── market-pos-screen.tsx    # POS/Kasa
├── market-sales-list.tsx    # Satış listesi + iade
├── market-stock-view.tsx    # Stok yönetimi
├── market-stock-count.tsx   # Stok sayımı
├── market-purchase.tsx      # Mal kabul
├── market-shelves.tsx       # Raf yönetimi
└── market-reports.tsx       # Raporlar (Recharts)
```

## Demo Test Hesapları
- **Admin**: demo@anadolu.com (tüm modüller)
- **Kasiyer**: kasiyer@anadolu.com (sadece Market → Kasa + Satışlar)
- **Depo**: depo@anadolu.com (sadece Market → Stok + Sayım + Mal Kabul + Raflar)

## Demo Barkodları (POS'ta test için)
- 8690000000017 — Ekmek (Tam Buğday) — 7.50₺
- 8690000000024 — Süt 1L — 22.50₺
- 8690000000031 — Yoğurt 1kg — 45₺
- 8690000000048 — Beyaz Peynir 500g — 120₺
- 8690000000055 — Çikolata (Sütlü) — 18.50₺
- 8690000000062 — Bisküvi (Kakaolu) — 12.75₺
- 8690000000079 — Coca Cola 1L — 25₺
- 8690000000086 — Su 0.5L — 5₺
- 8690000000093 — Çay 1kg — 145₺
- 8690000000109 — Şeker 1kg — 28₺
- 8690000000116 — Un 1kg — 19.50₺
- 8690000000123 — Ayçiçek Yağı 1L — 65₺
- 8690000000130 — Makarna 500g — 14.25₺
- 8690000000147 — Pirinç 1kg — 52₺
- 8690000000154 — Tuvalet Kağıdı 8li — 89.90₺

## Lint & Build
- `npx eslint src/ --quiet` → EXIT 0
- Dev server: derleme başarılı, API rotaları 200 OK
