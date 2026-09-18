# GNC CRM — TODO Listesi

## ✅ Tamamlanan İşler

### Faz 1 — CRM Core
- [x] Kimlik, Şirket, Kullanıcı, Rol (M1)
- [x] Müşteri Portföyü + Müşteri 360 (M2)
- [x] Google Maps Potansiyel Müşteri Madenciliği (M3)
- [x] Fırsat/Pipeline Kanban (M4)
- [x] Görevler, Hatırlatıcılar, Otomasyon (M5)
- [x] Raporlar ve Dashboard (M6)

### Faz 2 — ERP Lite
- [x] Ürün & Stok yönetimi (CRUD + stok hareketleri)
- [x] Teklifler (dinamik satır editörü, proforma)
- [x] Faturalar (InvoiceLine, çeki listesi, irsaliye)
- [x] Sipariş takip (zaman çizelgesi, proforma → sipariş → fatura)
- [x] Üretim listesi (depo rolü, fiyat gizli, üretildi tik)

### Faz 3 — İleri Özellikler
- [x] Global Command Palette (Ctrl+K)
- [x] Notification Center (okunmamış takibi)
- [x] Dashboard date range filter
- [x] Lead → Customer dönüşüm akışı
- [x] Müşteri 360: dosya yükleme, teklif/fatura sekmeleri
- [x] Print/PDF önizleme (teklif, fatura, proforma)
- [x] Otomatik stok düşme (fatura → stok çıkışı)
- [x] Proforma → otomatik fatura + sipariş
- [x] Settings kalıcı saklama (TenantSetting)
- [x] Görev otomasyonu (iletişimsiz müşteri)

### Faz 4 — AI & Widget
- [x] AI potansiyel analizi (0-100 skorlama)
- [x] AI otomatik görevlendirme
- [x] Dashboard widget'ları (hava, haber, döviz, mesaj, streak)
- [x] Gün sonu raporu (temsilci bazlı detaylı)
- [x] Kullanıcı aktivite log raporu

### Faz 5 — Kafe ERP
- [x] Masa yönetimi (kuş bakışı, sürükleme, şekil/numara)
- [x] Menü yönetimi (kategori, ürün, reçete, fotoğraf)
- [x] Sipariş akışı (komi → barmen/mutfak → kasa)
- [x] 3 kafe rolü (kasa, barmen, komi)
- [x] Bar/Mutfak FIFO kuyruk ekranları
- [x] Kasa ödeme (nakit/kart/online)

### Faz 6 — Yönetim & İletişim
- [x] Admin Panel (3 kolon: ağaç + liste + detay)
- [x] Müşteri türü (kafe/dış ticaret/müşteri hizmetleri/müşteri)
- [x] Rol atama ağacı
- [x] Yetki ağacı görünümü (collapsible tree)
- [x] Şirket içi mesajlaşma (chat, unread badge)
- [x] Hazır yazı şablonları (10 varsayılan, düzenlenebilir)

### Faz 7 — Güvenlik & Mobil
- [x] ERP RBAC (erp.manage yetkisi)
- [x] Satış gizliliği (temsilci sadece kendi, depo hiç görmez)
- [x] Depo rolü kısıtlamaları (sadece üretim listesi)
- [x] Mobil responsive (drawer sidebar, scroll tablolar)
- [x] Fotoğraf ekleme (ürün, müşteri, kişi)

## 📋 Kalan İşler / İyileştirmeler

### Yüksek Öncelik
- [ ] **OOM kalıcı çözüm**: customer-360 (2250 satır) ve kanban-board (1834 satır) component'lerini böl
- [ ] **Gerçek PDF üretimi**: jsPDF veya Puppeteer ile (şu an tarayıcı print)
- [ ] **Socket.io realtime**: Mesajlaşma ve kafe sipariş akışı için
- [ ] **Kafe seed verisi**: Demo kafe için masalar, menü, sipariş verisi

### Orta Öncelik
- [ ] **NextAuth entegrasyonu**: Gerçek email/şifre auth (şu an demo)
- [ ] **Supabase Storage**: Fotoğraf depolama (şu an base64 SQLite)
- [ ] **PostgreSQL migration**: Production için (şu an SQLite)
- [ ] **ExcelJS XLSX export**: Gerçek .xlsx dosyası (şu an CSV)
- [ ] **SMS entegrasyonu**: Twilio ile görev hatırlatma
- [ ] **E-imza**: Teklif/fatura için dijital imza
- [ ] **Banka entegrasyonu**: Otomatik ödeme kontrolü

### Düşük Öncelik
- [ ] **PWA manifest**: Offline destek, service worker
- [ ] **i18n İngilizce**: next-intl altyapısı hazır, mesaj dosyaları eksik
- [ ] **Özelleştirilebilir dashboard**: Sürükle-bırak widget kartları
- [ ] **QR kod ile kafe menü**: Müşteri kendi sipariş verebilsin
- [ ] **Stok entegrasyonu**: Kafe menü satıldıkça stok düşsün
- [ ] **Gelişmiş AI**: ML tabanlı skorlama (şu an kural bazlı)
- [ ] **API rate limiting**: Production için
- [ ] **2FA**: İki faktörlü kimlik doğrulama

### Bug Fix Bekleyenler
- [ ] OOM: 4GB sandbox'ta Turbopack büyük component'leri derlerken crash
  - Geçici çözüm: `NODE_OPTIONS=--max-old-space-size=2048`
  - Kalıcı: Component'leri böl
- [ ] Agent Browser + Next.js beraber OOM (görsel QA kısıtlı)
- [ ] Widget verileri mock (gerçek hava durumu/haber API'si yok)

## 📊 Metrikler

| Metrik | Değer |
|--------|-------|
| Modeller | 32 |
| API Route | 65 |
| Component | 113 |
| Kod Satırı | ~47,000 |
| Şema Satırı | 671 |
| Roller | 9 |
| Yetki | 20+ |
| Modül | 12 (CRM + ERP + Kafe + AI + Chat + Admin) |
