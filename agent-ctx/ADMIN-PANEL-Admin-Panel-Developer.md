# Task ID: ADMIN-PANEL
# Agent: Admin Panel Developer

## Task
GNC CRM süperapp için admin paneli oluştur. Müşterileri customerType'a göre
(kafe / dis_ticaret / musteri_hizmetleri / musteri) görüntüle, kullanıcılara
rol ata. Ağaç şeklinde kolay kullanım, Türkçe arayüz.

## Work Log

### 1. Schema & Types
- `prisma/schema.prisma` — `Customer.customerType` alanı zaten mevcut
  (default: "musteri"; values: kafe | dis_ticaret | musteri_hizmetleri | musteri).
- `src/types/index.ts` — `Customer` tipine `customerType: string` eklendi.
  `UserListItem` tipine `subordinates?`, `_count.assignedTasks`, `_count.activities`,
  `_count.auditLogs` opsiyonel alanları eklendi.

### 2. Customer API (Mevcut Dosyalar)
- `src/app/api/customers/route.ts`:
  - GET: `customerType` query param filtresi eklendi
  - POST: `customerType` body alanı kabul edilir, validasyon ile (4 değerden
    biri değilse "musteri" varsayılan). `customer.create` data'sına
    `customerType: finalType` ekendi.
- `src/app/api/customers/[id]/route.ts`:
  - PATCH: `allowed` listesine `customerType` eklendi. Validasyon: sadece
    4 geçerli değerden biri ise updateData'ya eklenir.

### 3. Admin API'leri (Yeni)
- `src/app/api/admin/overview/route.ts` (GET):
  - `users.manage` yetkisi gerekli
  - `customerByType` (4 tür), `userByRole` (6 rol)
  - `systemStats`: totalCustomers/Users/deals/orders/invoices/tasks/leads/products,
    openTasks, openDealsCount + openDealsValue, pendingInvoices
  - `recentActivity`: son 10 audit log (actor bilgisiyle)
- `src/app/api/admin/users/route.ts` (GET):
  - `users.manage` yetkisi gerekli
  - search/role/status filtreleri
  - `subordinates` ve genişletilmiş `_count` dahil (assignedTasks, activities,
    auditLogs) — admin paneli için zengin veri
- `src/app/api/admin/assign-role/route.ts` (POST):
  - Body: `{ userId, role }`
  - Validasyon: rol geçerli mi, kullanıcı tenant'ta mi
  - Self-role değişikliği engellendi (admin kendini düşüremez)
  - Süper admin rolünü sadece süper admin verebilir/alabilir
  - Rol değişince permissions rolün varsayılan yetkileriyle sıfırlanır
  - Audit log yazılır

### 4. UI Bileşenleri (Yeni — src/components/admin/)
- `customer-type-badge.tsx`:
  - `CUSTOMER_TYPES` sabit dizisi (4 tür: kafe/dis_ticaret/musteri_hizmetleri/musteri)
  - Her tür için: emoji, Lucide icon, label, description, Tailwind renk sınıfları
    (kafe→emerald, dis_ticaret→sky, musteri_hizmetleri→violet, musteri→slate)
  - `CustomerTypeBadge` component (size sm/md, opsiyonel icon)
  - `getCustomerTypeMeta` yardımcı fonksiyonu
- `customer-type-dialog.tsx`:
  - Müşteri türü değiştirme dialogu
  - 4 seçenek radyo kart şeklinde (icon + label + description)
  - Mevcut tür işaretlenir, seçili tür emerald kenarlıklı
  - `key` prop ile remount edilir (lazy initial state pattern — useEffect
    yok, lint friendly)
  - PATCH `/api/customers/[id]` çağrılır, query cache invalidate edilir
- `role-assign-dialog.tsx`:
  - Rol atama dialogu (görsel ağaç)
  - 3 grup (Yönetim/Satış/Operasyon), her grup altında roller
  - Rol seçilince o rolün yetkileri preview olarak gösterilir (badge'ler)
  - Self-assign engelli, superadmin kısıtlaması işaretli (Lock icon)
  - "Rolü Ata" → POST `/api/admin/assign-role`
- `admin-panel.tsx`:
  - 3 kolonlu desktop layout (mobilde stack):
    - Sol (col-span-3): Tür & Rol Ağacı
      - "Tüm Müşteriler" + 4 müşteri türü (icon + count)
      - "Kullanıcılar" → 3 grup (Yönetim/Satış/Operasyon) altında roller
      - Collapsible groups, aktif node emerald vurgulu
    - Orta (col-span-5): Liste tablosu
      - Müşteri modu: logo, ad, tür badge, sektör, şehir, sorumlu, durum, "Tür Değiştir" butonu
      - Kullanıcı modu: avatar, ad, email, rol badge, yönetici, yetki sayısı, durum, "Rol Değiştir" butonu
      - Search input (sağ üst)
    - Sağ (col-span-4): Detay paneli
      - Müşteri: logo, ad, tür badge, sektör/şehir/telefon/email, istatistik kutuları
        (fırsat/aktivite/görev/iletişim), tür açıklaması, "360° Görünüm" + "Tür Değiştir" butonları
      - Kullanıcı: avatar, ad, title, email, rol badge, yönetici, istatistikler
        (müşteri/fırsat/ast/görev), tanımlı yetkiler grup grup, ast kullanıcılar listesi
  - Üstte 6 sistem istatistik mini kart (Müşteri/Fırsat/Sipariş/Fatura/Açık Görev/Lead)
  - Altta "Son Aktiviteler" — son 10 audit log zaman çizelgesi
  - 30 sn polling ile overview yenilenir

### 5. Navigation Entegrasyonu
- `src/store/app-store.ts`:
  - `AppView` tipine `'admin'` eklendi (ve 'cafe' başka bir agent tarafından
    eklenmiş)
- `src/components/app/sidebar.tsx`:
  - "Yönetim" grubuna "Admin Paneli" item eklendi (icon: ShieldCheck)
  - permission: `users.manage` (sadece admin/superadmin görür)
- `src/components/app/app-shell.tsx`:
  - `view === 'admin'` → `<AdminPanel />` render (permission kontrolü ile)

### 6. Customer List Güncellemeleri
- `src/components/customers/customer-list.tsx`:
  - `CustomerForm` interface'ine `customerType: CustomerTypeKey` eklendi
  - `EMPTY_FORM` default: `'musteri'`
  - Edit dialog: müşteri türü select alanı (4 seçenek, icon + emoji + label)
  - `customerType` state + query param filtresi
  - Tür chip filtre satırı (Tümü / ☕ Kafe / 🌐 Dış Ticaret / 🎧 Müşteri Hizmetleri / 👤 Müşteri)
  - Tabloya "Tür" kolonu eklendi, `CustomerTypeBadge` gösterilir
  - `activeFilterCount` ve `handleClearFilters` customerType'ı kapsar
- `src/components/customers/customer-360.tsx`:
  - Edit dialoguna müşteri türü select alanı eklendi
  - Header'da `CustomerTypeBadge` segment rozetinin yanında gösterilir

### 7. RBAC & Tenant Güvenliği
- Tüm admin endpoint'leri `requirePermission(user, 'users.manage')` ile korunuyor
- `tenantId` izolasyonu tüm sorgularda mevcut
- Self-role değişikliği ve superadmin kısıtlamaları aktif
- Audit log tüm rol atama ve tür değiştirme işlemlerinde yazılır

## Verification

### Lint
- `npx eslint src/ --quiet` → **EXIT 0** (tek hata vardı: customer-type-dialog.tsx
  içinde useEffect+setState anti-pattern — lazy initial state + parent `key`
  prop pattern ile düzeltildi)

### API smoke tests (curl)
- `GET /api/admin/overview` (admin session) → 200, full dashboard verisi
  (customerByType, userByRole, systemStats, recentActivity)
- `GET /api/admin/overview` (rep session) → **403** (RBAC çalışıyor)
- `GET /api/admin/users?role=rep` → 200, rep rolündeki kullanıcılar (subordinates + _count dahil)
- `GET /api/customers?customerType=kafe` → 200, boş liste (henüz kafe yok)
- `PATCH /api/customers/[id] {customerType:"kafe"}` → 200, DB'de "kafe" olarak güncellendi
- `POST /api/admin/assign-role {userId, role:"manager"}` → 200, rol + permissions sıfırlandı
- `POST /api/admin/assign-role {selfId, role:"rep"}` → **400** "Kendi rolünüzü değiştiremezsiniz"
- `POST /api/admin/assign-role {userId, role:"invalid"}` → **400** "Geçersiz rol..."
- POST başarılı olunca audit log otomatik yazılıyor (entity: 'user', action: 'update')

### Dev log
- Compile temiz, hata/warn yok
- Tüm yeni route'lar Turbopack ile sorunsuz derleniyor

## Stage Summary

### Dosyalar Oluşturuldu (7 yeni)
- `src/app/api/admin/overview/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/assign-role/route.ts`
- `src/components/admin/customer-type-badge.tsx`
- `src/components/admin/customer-type-dialog.tsx`
- `src/components/admin/role-assign-dialog.tsx`
- `src/components/admin/admin-panel.tsx`

### Dosyalar Düzenlendi (7 mevcut)
- `src/app/api/customers/route.ts` — customerType filter (GET) + create (POST)
- `src/app/api/customers/[id]/route.ts` — customerType PATCH
- `src/types/index.ts` — Customer.customerType + UserListItem subordinates/counts
- `src/store/app-store.ts` — AppView'e 'admin' eklendi
- `src/components/app/sidebar.tsx` — Admin Paneli nav item (ShieldCheck icon, users.manage)
- `src/components/app/app-shell.tsx` — AdminPanel render + permission gate
- `src/components/customers/customer-list.tsx` — tür select + chip filtre + tablo badge
- `src/components/customers/customer-360.tsx` — tür select edit dialogda + header badge

### Renk Uyumu
- Primary action: emerald-600
- Müşteri türleri: kafe→emerald, dis_ticaret→sky, musteri_hizmetleri→violet, musteri→slate
- Rol grupları: Yönetim→amber, Satış→emerald, Operasyon→violet
- Sistem stat'ları: emerald/amber/violet/sky/rose/slate karışımı
- **Indigo/mavi primary yok** — sky sadece dis_ticaret badge'inde accent olarak kullanıldı

### Mobile Responsive
- 3 kolon layout `grid-cols-1 lg:grid-cols-12` ile mobilde stack, desktop'ta yan yana
- Sol/sağ paneller `lg:sticky lg:top-4` ile scroll'da sabit
- Tablo'da `hidden md:table-cell` / `hidden lg:table-cell` ile progressive disclosure
- Search input `w-32 sm:w-48` — mobilde dar, desktop'ta geniş
- Chip filtreler `flex-wrap` ile mobilde alt satıra iner

### Notlar
- `cafe` view AppView'a başka bir agent tarafından eklenmiş; bu task'ta dokunulmadı
- Existing users/customers customerType varsayılan "musteri" ile çalışıyor
  (schema default değer)
- assign-role sonrası permissions rolün varsayılan yetkileriyle sıfırlanır;
  ince ayar için users-view.tsx mevcut PermissionTree kullanılabilir
