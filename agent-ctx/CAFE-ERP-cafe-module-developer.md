# CAFE-ERP — Cafe ERP Module Developer

**Task ID:** CAFE-ERP
**Agent:** Cafe Module Developer
**Date:** 2025-09-11
**Status:** ✅ COMPLETE

---

## Özet

GNC CRM superapp'ine **Cafe ERP** modülü eklendi. 3 özel kafe rolü (kasa / barmen / komi) ile role-based bir kafe yönetim sistemi kuruldu: kuş bakışı masa düzeni, menü/reçete yönetimi, sipariş akışı, bar & mutfak kuyrukları, kasa/ödeme ve günlük raporlar.

Prisma şemasında `Cafe`, `CafeTable`, `MenuCategory`, `MenuItem`, `CafeOrder`, `CafeOrderItem`, `CafePayment` modelleri zaten hazırdı. Bu görev kapsamında RBAC, 9 API route'u, 7 UI komponenti ve navigasyon entegrasyonu doğrulandı/tamamlandı.

---

## 1. RBAC (`src/lib/rbac.ts` + `src/types/index.ts`)

**Roller** (`Role` tipine + `ROLE_LABELS`'e eklendi):
- `kasa` — Kasa (kasiyer): `cafe.view`, `cafe.manage`, `cafe.orders`, `cafe.kitchen`
- `barmen` — Barmen: `cafe.view`, `cafe.bar`
- `komi` — Komi (garson): `cafe.view`, `cafe.orders`, `cafe.kitchen`
- `admin` / `superadmin`: tüm cafe yetkileri + mevcut yetkiler

**Permission'lar** (`PermissionKey` tipine + `ALL_PERMISSIONS`'a eklendi):
- `cafe.view` — Kafe modülünü görüntüle
- `cafe.manage` — Kafe yönetimi (masa/menü/sipariş)
- `cafe.orders` — Sipariş alma (komi/kasa)
- `cafe.bar` — Bar istasyonu (barmen)
- `cafe.kitchen` — Mutfak istasyonu (komi/admin)

---

## 2. API Routes (`src/app/api/cafe/`)

Tüm route'lar:
- `params: Promise<{...}>` — await ediliyor (Next.js 16 async params)
- Tenant izolasyonu: her sorgu `cafe.tenantId === user.tenantId` kontrolü
- `requirePermission` ile yetki gate'leri
- `writeAuditLog` ile denetim kaydı

| Route | Method | Permission | Açıklama |
|---|---|---|---|
| `cafe/route.ts` | GET / POST | `cafe.view` / `cafe.manage` | Kafe listesi / yeni kafe |
| `cafe/[id]/route.ts` | GET / PATCH / DELETE | `cafe.view` / `cafe.manage` | Tekil kafe CRUD |
| `cafe/[id]/tables/route.ts` | GET / POST | `cafe.view` / `cafe.manage` | Masa listesi (aktif sipariş dahil) / masa ekle |
| `cafe/[id]/tables/[tableId]/route.ts` | PATCH / DELETE | `cafe.manage` | Masa güncelle (konum/şekil/numara/durum/kapasite) / sil |
| `cafe/[id]/menu/route.ts` | GET / POST | `cafe.view` / `cafe.manage` | Kategori+ürün listesi / kategori veya item oluştur |
| `cafe/[id]/menu/[itemId]/route.ts` | PATCH / DELETE | `cafe.manage` | Ürün güncelle (fiyat/mevccut/reçete/foto) / sil |
| `cafe/[id]/orders/route.ts` | GET / POST | `cafe.view` / `cafe.orders` | Siparişler (multi-status/tableId/today filtre) / sipariş oluştur |
| `cafe/[id]/orders/[orderId]/route.ts` | GET / PATCH / DELETE | `cafe.view` / `cafe.orders` | Sipariş detay / durum güncelle / iptal |
| `cafe/[id]/orders/[orderId]/items/[itemId]/route.ts` | PATCH | `cafe.bar` XOR `cafe.kitchen` | Kalem durumu: bekliyor→hazirlaniyor→hazir→servis_edildi |
| `cafe/[id]/orders/[orderId]/payments/route.ts` | POST | `cafe.manage` | Ödeme al (cash/card/online); total ödenince order='odendi', table='bos' |

**Sipariş durumu otomasyonu:**
- İlk kalem `hazirlaniyor` → order.status `acik`→`hazirlaniyor`
- Tüm kalemler `hazir`/`servis_edildi` → order.status `hazir`
- Ödeme total'e ulaştığında → order.status `odendi` + table.status `bos`
- İptal → table.status `bos` (siparis ise)

**Kalem durumu yetki matrisi:**
- Barmen (`cafe.bar`): sadece `station='bar'` kalemleri
- Mutfak (`cafe.kitchen`): sadece `station='kitchen'`/`'dessert'` kalemleri
- `servis_edildi` öncülü `hazir` olmak zorunda

---

## 3. UI Components (`src/components/cafe/`)

### `cafe-view.tsx` — Ana view (role-based tabs)
- Multi-cafe: tenant'ta birden fazla kafe varsa selector dropdown
- Rol-bazlı tab görünürlüğü:
  - **komi**: Masalar, Siparişler, Mutfak
  - **barmen**: sadece Bar
  - **kasa**: Masalar, Siparişler, Kasa
  - **admin/superadmin**: tüm tablar + Menü + Raporlar
- Kafe yoksa "Yeni Kafe" oluşturma ekranı
- `selectedCafeId` zustand store'da persist ediliyor

### `cafe-table-layout.tsx` — Kuş bakışı masa haritası
- `aspect-[4/3]` grid arka planı (5% lattice)
- Masalar `x%`/`y%` ile konumlandırılır, `width%`/`height%` ile boyutlanır
- Durum renkleri: bos=emerald, dolu=amber, siparis=sky, rezerve=violet
- Şekiller: square (rounded-md), round (rounded-full), rectangle (rounded-lg)
- **Drag-to-reposition** (PointerEvents, pointer capture): admin sürebilir; optimistic `setQueryData` + pointerUp'ta persist
- Masa tıkla → edit dialog (numara, şekil, kapasite, durum, aktif sipariş önizleme, sil)
- Boş alan → "Masa Ekle" dialog
- Aktif siparişli masada pulse animasyonlu amber dot
- Mobil: grid altında masa listesi (touch-friendly 44px+ butonlar)
- CountChip'ler: Toplam/Boş/Dolu/Sipariş/Rezerve

### `cafe-menu-manager.tsx` — Menü CRUD
- Sol: kategori listesi (icon emoji + ürün sayısı badge)
- Sağ: seçili kategorinin ürünleri (grid)
- Ürün kartı: fotoğraf, ad, açıklama, fiyat, hazırlık süresi, istasyon badge (bar=amber/kitchen=rose/dessert=violet)
- Ürün dialog: PhotoUpload, ad, açıklama, fiyat, hazırlık süresi, istasyon select, **reçete textarea** (hazırlama talimatları), isAvailable switch
- Hızlı "mevccut değil" toggle (Switch butonu)
- Kategori silme: bilgi mesajı (önce ürünleri taşı/sil)

### `cafe-order-screen.tsx` — Sipariş alma (komi)
- 2 tab: Yeni Sipariş / Aktif Siparişler
- **Yeni Sipariş**: order type seçici (Masa/Paket/Gel-Al), masa select (dolu masalar disabled), müşteri adı input
- Menü grid: kategori bazlı, fotoğraf + ad + fiyat, tıkla→sepete ekle
- **Sepet** (sticky): kalem kartları (qty +/- , not input, kaldır), sipariş notu, toplam, "Siparişi Gönder"
- **Aktif Siparişler**: kart grid (sipariş no, durum badge, tip, masa, toplam) → detay dialog (kalemler + iptal)
- Sipariş no `S-0001` formatında (cafe bazlı sayaç)

### `cafe-bar-screen.tsx` — Bar kuyruğu (barmen) + Mutfak kuyruğu (komi)
- `CafeBarScreen`: station='bar', status in (bekliyor, hazirlaniyor) kalemleri FIFO sıralar
- `CafeKitchenScreen`: station='kitchen'/'dessert', status in (bekliyor, hazirlaniyor, hazir) kalemleri
- Kart: sipariş no, masa/paket, göreceli zaman, ürün foto + ad + qty, not (amber kutu), **reçete (expandable)**
- Aksiyon butonları:
  - bekliyor → "Hazırla" (sky) → hazirlaniyor
  - hazirlaniyor → "Hazır" (emerald) → hazir
  - hazir → "Servis Edildi" (teal, sadece mutfak) → servis_edildi
- Bekliyor/Hazırlanıyor sayaçları
- 5sn refetch interval (canlı kuyruk)
- Amber tema (bar), rose tema (mutfak)

### `cafe-kasa-screen.tsx` — Kasa (kasiyer)
- 2 tab: Açık Siparişler / Bugün
- **Özet kartları**: Bugünkü Ciro, Nakit, Kart, Açık Sipariş sayısı
- **Açık Sipariş kartları**: no, zaman, tip (masa/paket/gel-al), hazır kalem sayısı, "HAZIR" badge (tümü hazır ise emerald border), kalan tutar, "Ödeme Al" butonu
- **Ödeme dialog**: 3 kolon özet (Toplam/Ödenen/Kalan), kalem listesi, tutar input + quick buttons (Tamamı/50/100/200₺), yöntem seçici (Nakit/Kart/Online), "Ödemeyi Al"
- Ödeme sonrası: paidOff → "Sipariş kapatıldı", partial → "Kalan: X"
- **Bugün tab'i**: günün tüm siparişleri (ödendi/iptal/açık badge + yöntem icon'ları + tutar)
- 8sn/15sn refetch

### `cafe-reports.tsx` — Günlük rapor (admin)
- 4 stat kartı: Toplam Ciro, Sipariş Sayısı, Ort. Sepet, Masa/Paket/Gel-Al dağılımı
- Ödeme yöntemi dağılımı (nakit/kart/online) progress bar ile
- Saatlik ciro bar chart (canvas-free, div-based)
- Son 20 sipariş listesi

---

## 4. Navigasyon Entegrasyonu

### `src/store/app-store.ts`
- `AppView` tipine `'cafe'` eklendi
- `selectedCafeId` + `setSelectedCafeId` state (persist)

### `src/components/app/sidebar.tsx`
- "Kafe" grubu + "Kafe Yönetimi" item (Coffee icon, `cafe.view` permission)
- kasa/barmen/komi rolleri: sadece `view === 'cafe'` item'ını görür (CRM/satış/ERP/yönetim gizli)

### `src/components/app/app-shell.tsx`
- `isCafeRole()` helper
- useEffect: kafe rolü `view !== 'cafe'` ise otomatik `setView('cafe')`
- kafe rolü → her zaman `<CafeView />` (persisted view ne olursa olsun)
- diğer roller: `view === 'cafe'` → `hasPermission('cafe.view')` gate + `<CafeView />`

---

## 5. Bug Fix (bu görevde)

### Multi-status filter bug (`cafe/[id]/orders/route.ts`)
**Sorun:** Frontend `?status=acik&status=hazirlaniyor&status=hazir` ile sorgu yapıyordu ama API `searchParams.get('status')` tek değer döndürdüğü için sadece `acik` siparişler geliyordu — `hazirlaniyor` ve `hazir` siparişler komi ekranında görünmüyordu.

**Çözüm:** `searchParams.getAll('status')` ile çoklu status toplandı, Prisma `where.status = { in: statusList }` kullanıldı. Tek status hâlâ `where.status = statusList[0]` ile çalışıyor (backward compatible).

### Unused eslint-disable directives
4 yerde `// eslint-disable-next-line @next/next/no-img-element` directive'i vardı ama bu rule `eslint.config.mjs`'te `"off"` — directive'ler unused warning üretiyordu. 4 directive kaldırıldı (cafe-bar-screen ×2, cafe-menu-manager ×1, cafe-order-screen ×1).

---

## 6. Doğrulama

- ✅ `npx eslint src/ --quiet` → **EXIT 0** (0 error, 0 warning)
- ✅ Prisma şeması db'ye push edilmiş, cafe tabloları aktif
- ✅ Dev log: `POST /api/seed 200` — cafe seed verisi (2 kafe, masalar, menü, siparişler, ödemeler) başarıyla insert edildi
- ✅ Tüm route'lar Turbopack ile compile ediliyor
- ✅ Tenant izolasyonu her route'ta `cafe.tenantId === user.tenantId` ile sağlanıyor
- ✅ Audit log her CUD işleminde yazılıyor
- ✅ Mobil responsive: grid'ler `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4/6`, tab'lar `overflow-x-auto`, dokunmatik hedefler 44px+

---

## 7. Color Compliance

- **Primary**: emerald-600 (butonlar, aktif tab, fiyat vurgusu)
- **Kafe rol temaları**: barmen→amber/orange, mutfak→rose/red, kasa→emerald/sky
- **Masa durumları**: bos→emerald, dolu→amber, siparis→sky, rezerve→violet
- **Kalem durumları**: bekliyor→amber, hazirlaniyor→sky, hazir→emerald, servis_edildi→teal
- **Ödeme yöntemleri**: cash→emerald, card→sky, online→violet
- **İndigo/mavi primary YOK** ✅

---

## 8. Dosyalar

### Created (16)
- `src/app/api/cafe/route.ts`
- `src/app/api/cafe/[id]/route.ts`
- `src/app/api/cafe/[id]/tables/route.ts`
- `src/app/api/cafe/[id]/tables/[tableId]/route.ts`
- `src/app/api/cafe/[id]/menu/route.ts`
- `src/app/api/cafe/[id]/menu/[itemId]/route.ts`
- `src/app/api/cafe/[id]/orders/route.ts`
- `src/app/api/cafe/[id]/orders/[orderId]/route.ts`
- `src/app/api/cafe/[id]/orders/[orderId]/items/[itemId]/route.ts`
- `src/app/api/cafe/[id]/orders/[orderId]/payments/route.ts`
- `src/components/cafe/cafe-view.tsx`
- `src/components/cafe/cafe-table-layout.tsx`
- `src/components/cafe/cafe-menu-manager.tsx`
- `src/components/cafe/cafe-order-screen.tsx`
- `src/components/cafe/cafe-bar-screen.tsx` (CafeBarScreen + CafeKitchenScreen)
- `src/components/cafe/cafe-kasa-screen.tsx`
- `src/components/cafe/cafe-reports.tsx`

### Modified (6)
- `src/types/index.ts` — Role + PermissionKey (cafe rolleri/izinleri)
- `src/lib/rbac.ts` — ROLE_PERMISSIONS, ROLE_LABELS, ALL_PERMISSIONS
- `src/store/app-store.ts` — AppView 'cafe', selectedCafeId
- `src/components/app/sidebar.tsx` — Kafe grubu + rol filtreleme
- `src/components/app/app-shell.tsx` — cafe view rendering + isCafeRole yönlendirme
- `src/app/api/cafe/[id]/orders/route.ts` — multi-status filter fix

---

## Stage Summary

Cafe ERP modülü tamamlandı. 3 özel rol (kasa/barmen/komi) + admin ile role-based bir kafe yönetim sistemi: kuş bakışı sürüklenebilir masa haritası, menü/reçete CRUD'u, sipariş akışı (bekliyor→hazirlaniyor→hazir→servis_edildi), bar & mutfak FIFO kuyrukları, kasa/ödeme (cash/card/online) ve günlük raporlar. Tüm API'ler tenant izole + audit log'lu, Next.js 16 async params kullanıyor. ESLint temiz (0 error/0 warning), seed verisi başarıyla yüklendi, mobil responsive. İndigo/mavi primary yok — emerald/amber/sky/violet/teal/rose paleti kullanıldı.
