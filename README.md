# GNC CRM + ERP Süperapp

KOBİ satış ekipleri ve kafe işletmeleri için production-ready CRM + ERP süperapp.
HubSpot/Zoho KOBİ segmenti kalitesinde, Türkçe arayüz, çok kiracılı, rol hiyerarşili.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Prisma](https://img.shields.io/badge/Prisma-6-indigo) ![Tailwind](https://img.shields.io/badge/Tailwind-4-teal)

## 🚀 Hızlı Başlangıç

```bash
# 1. Bağımlılıkları yükle
bun install

# 2. Veritabanını hazırla
bun run db:push

# 3. Demo verisi oluştur
curl -X POST http://localhost:3000/api/seed

# 4. Geliştirme sunucusunu başlat
bun run dev
```

Uygulama `http://localhost:3000` adresinde çalışır.

## 📋 Demo Girişi

Uygulama açıldığında demo kullanıcı listesi görünür. Bir kullanıcı seçin:

| Kullanıcı | Rol | Email | Yetki |
|-----------|-----|-------|-------|
| Demir Yıldız | Admin | demo@anadolu.com | Tüm modüller |
| Ayşe Kaya | Müdür | ayse.kaya@anadolu.com | Ekip + raporlar |
| Zeynep Arslan | Temsilci | zeynep.arslan@anadolu.com | Kendi müşterileri |
| Depo Kullanıcı | Stok | depo@anadolu.com | Sadece üretim listesi |

## 🏗️ Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Dil | TypeScript 5 (strict) |
| Stil | Tailwind CSS 4 + shadcn/ui (New York) |
| Veritabanı | Prisma ORM + SQLite |
| State | Zustand (client) + TanStack Query (server) |
| Grafikler | Recharts |
| Drag & Drop | @dnd-kit |
| Iconlar | Lucide React |
| Bildirim | Sonner (toast) |
| AI | z-ai-web-dev-sdk |

## 📦 Modüller

### CRM Modülleri
- **Dashboard** — KPI kartları, satış hunisi, aktivite trendi, widget'lar (hava, haber, döviz)
- **Müşteri Portföyü** — Müşteri 360° (zaman çizelgesi, notlar, fırsatlar, kişiler, görevler, dosyalar, harita, teklifler, faturalar)
- **Potansiyel Müşteri** — Google Maps tabanlı lead madenciliği (kuş bakışı harita, cluster, CSV export)
- **Pipeline** — Drag-drop Kanban (6 aşama, kaybetme sebepleri)
- **Görevler** — Otomasyon kartı, AI panel, filtreler, grup görünümü
- **Raporlar** — 10 bölüm (huni, ciro, kazan/kayıp, Maps dönüşüm, aktivite, temsilci, ERP, gün sonu)

### ERP Modülleri
- **Ürün & Stok** — CRUD, stok hareketleri, düşük stok uyarısı, fotoğraf
- **Teklifler** — Dinamik satır editörü, proforma, PDF önizleme, WhatsApp/e-posta gönderim
- **Faturalar** — InvoiceLine, çeki listesi, irsaliye, sipariş bağlantısı, otomatik stok düşme
- **Siparişler** — Takip zaman çizelgesi, proforma onayı → otomatik sipariş+fatura
- **Üretim Listesi** — Depo rolü için (fiyat gizli, üretildi tik atma)

### Kafe ERP
- **Masa Yönetimi** — Kuş bakışı sürüklenebilir masa haritası, şekil/numara/kapasite
- **Menü** — Kategori, ürün, fiyat, fotoğraf, reçete, hazırlık istasyonu (bar/mutfak)
- **Sipariş Akışı** — Komi alır → Barmen/Mutfak hazırlar → Kasa ödeme alır
- **3 Rol**: Kasa, Barmen, Komi (rol-bazlı ekranlar)

### Yönetim
- **Admin Panel** — 3 kolonlu (müşteri türü ağacı + liste + detay), rol atama ağacı
- **Kullanıcılar** — Yetki matrisi + ağaç görünümü, hiyerarşi ağacı
- **Ayarlar** — Şirket, para birimi, bildirimler, KVKK, şablonlar, denetim kayıtları
- **Mesajlaşma** — Şirket içi chat (unread badge, polling)

### AI Özellikleri
- **Potansiyel Analizi** — 0-100 skorlama (Recency + Segment + Deal + Activity)
- **Otomatik Görevlendirme** — Yüksek potansiyel müşteriler için otomatik görev
- **Otomasyon** — İletişimsiz müşteri tespiti + otomatik görev oluşturma

## 🔐 Roller ve Yetkiler

| Rol | Yetkiler |
|-----|----------|
| Süper Admin | Tüm sistem |
| Şirket Admini | Tüm tenant + ERP + Admin Panel |
| Müdür | Ekip + raporlar + ERP |
| Satış Temsilcisi | Kendi müşterileri + kendi satışları |
| Depo | Sadece üretim listesi (fiyat gizli) |
| Kasa | Kafe: masalar, siparişler, ödeme |
| Barmen | Kafe: bar kuyruğu, reçete, hazır tik |
| Komi | Kafe: masalar, sipariş alma, menü |
| Salt Okunur | Görüntüleme only |

### Yetki Formatı
`resource.action.scope` — örnek: `customers.view.own`, `customers.view.team`, `customers.view.all`, `erp.manage`, `cafe.bar`

## 🗄️ Veritabanı Şeması

32 model: Tenant, User, Customer, Contact, Lead, Deal, Activity, Task, Note, Attachment, Tag, AuditLog, Product, StockMovement, Quote, QuoteLine, Invoice, InvoiceLine, Order, OrderTrackingStep, MessageTemplate, ProductionItem, Cafe, CafeTable, MenuCategory, MenuItem, CafeOrder, CafeOrderItem, CafePayment, Message, TenantSetting, MapsSearch.

## 📁 Klasör Yapısı

```
src/
├── app/
│   ├── api/              # 65 API route
│   │   ├── customers/    # Müşteri CRUD + alt kaynaklar
│   │   ├── deals/        # Fırsat CRUD
│   │   ├── erp/          # Ürün, teklif, fatura, sipariş
│   │   ├── cafe/         # Kafe ERP API'leri
│   │   ├── ai/           # AI potansiyel analizi
│   │   ├── admin/        # Admin panel API'leri
│   │   └── ...
│   ├── globals.css       # Tema + özel stiller
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # SPA giriş
├── components/
│   ├── app/              # Shell, sidebar, topbar, login
│   ├── dashboard/        # Dashboard + widget'lar
│   ├── customers/        # Müşteri listesi + 360
│   ├── maps/             # Lead madenciliği
│   ├── pipeline/         # Kanban
│   ├── tasks/            # Görevler + AI panel
│   ├── reports/          # Raporlar + gün sonu
│   ├── erp/              # Ürün, teklif, fatura, sipariş, üretim
│   ├── cafe/             # Kafe ERP (masa, menü, bar, kasa)
│   ├── ai/               # AI panel
│   ├── chat/             # Mesajlaşma
│   ├── admin/            # Admin panel
│   └── ui/               # shadcn/ui bileşenleri
├── lib/                  # Yardımcı fonksiyonlar
│   ├── db.ts             # Prisma client
│   ├── rbac.ts           # Rol/yetki sistemi
│   ├── format.ts         # Tarih/para/telefon format
│   ├── constants.ts      # Sabitler (sektör, şehir, aşama)
│   ├── auth.ts           # Session yönetimi
│   └── api-utils.ts      # API yardımcıları
├── store/                # Zustand store
├── types/                # TypeScript tipleri
└── hooks/                # Custom hooks
```

## 🎨 Tema

- **Primary**: Emerald/Teal
- **Accent**: Amber, Violet, Sky, Rose, Slate
- **Koyu mod**: Desteklenir (next-themes)
- **Mobil**: Responsive (drawer sidebar, scroll tablolar)

## 📊 Demo Verisi

Seed sonrası:
- 2 şirket (Anadolu Satış A.Ş., Ege Ticaret Ltd.)
- 8+ kullanıcı (farklı roller)
- 30+ müşteri (4 tür: kafe, dış ticaret, müşteri hizmetleri, standart)
- 100+ aktivite, 25+ fırsat, 20+ görev
- 4+ ürün, teklif, fatura, sipariş
- 2 kafe (masalar, menü, siparişler)

## 🔧 Komutlar

```bash
bun run dev        # Geliştirme sunucusu
bun run lint       # ESLint
bun run db:push    # Şema değişikliklerini uygula
bun run db:generate # Prisma client yenile
bun run db:reset   # Veritabanını sıfırla
bun run build      # Production build
```

## 📝 Lisans

MIT — KOBİ segmenti için geliştirilmiştir.

## 🤖 AI Entegrasyonu

z-ai-web-dev-sdk ile:
- AI potansiyel müşteri analizi
- Vision (ekran görüntüsü analizi)
- Web search
- TTS/ASR (isteğe bağlı)

## ⚠️ Bilinen Sınırlamalar

- SQLite: Production için PostgreSQL önerilir
- Base64 fotoğraf depolama: S3/Supabase Storage önerilir
- Polling-based realtime: Socket.io önerilir
- Demo auth: NextAuth/Supabase Auth önerilir
