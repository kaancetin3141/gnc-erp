# GNC CRM + ERP — Kullanım Sunumu

> Bu sunum, GNC CRM süperapp'inin nasıl kullanılacağını adım adım anlatır.
> Yeni kullanıcılar ve yöneticiler için hazırlanmıştır.

---

## 🎯 GNC CRM Nedir?

GNC CRM, KOBİ'ler için tasarlanmış **satış odaklı süperapp**'tir. Tek platformda:

- 📊 **CRM** — Müşteri yönetimi, satış pipeline, potansiyel müşteri bulma
- 📦 **ERP** — Ürün, stok, teklif, fatura, sipariş takibi
- ☕ **Kafe ERP** — Masa yönetimi, menü, sipariş, ödeme
- 🤖 **AI** — Potansiyel müşteri analizi, otomatik görevlendirme
- 💬 **İletişim** — Şirket içi mesajlaşma, hazır şablonlar

---

## 🚀 Başlangıç

### 1. Giriş Yapma

Uygulama açıldığında demo kullanıcı listesi görünür. Rolünüze uygun kullanıcıyı seçin:

| Kullanıcı | Rol | Ne Görebilir? |
|-----------|-----|---------------|
| 👨‍💼 Demir Yıldız | Admin | Her şey (tüm modüller + ayarlar) |
| 👩‍💼 Ayşe Kaya | Müdür | Ekip müşterileri + raporlar + ERP |
| 💼 Zeynep Arslan | Temsilci | Kendi müşterileri + kendi satışları |
| 📦 Depo Kullanıcı | Stok | Sadece üretim listesi (fiyat gizli) |
| 💰 Kasa Kullanıcı | Kasa | Kafe: masalar, ödeme |
| 🍸 Barmen | Barmen | Kafe: bar sipariş kuyruğu |
| 🍽️ Komi | Komi | Kafe: masalar, sipariş alma |

### 2. Ana Ekran (Dashboard)

Giriş sonrası **Genel Bakış** ekranı açılır:

```
┌─────────────────────────────────────────────────┐
│  🌅 Merhaba, Demir 👋                          │
│  10 Eylül 2025, Çarşamba                       │
│  11 müşteri iletişimsiz — ilgilenmen gerek     │
│  [Müşteriler] [Yeni Lead Bul]                  │
├──────────┬──────────┬──────────┬───────────────┤
│ 23       │ 3.7M₺    │ 289K₺    │ 17 görev      │
│ Müşteri  │ Pipeline │ Bu Ay    │ 7 gecikmiş    │
├──────────┴──────────┴──────────┴───────────────┤
│ 🌤️ Hava 16°  💬 Mesajlar  📰 Haberler  💵 Döviz │
├─────────────────────────────────────────────────┤
│ 📊 Satış Hunisi (grafik)                       │
├─────────────────────┬───────────────────────────┤
│ 📋 Yaklaşan Görevler│ 📅 Son Aktiviteler       │
└─────────────────────┴───────────────────────────┘
```

**Widget'lar**: Hava durumu, son mesajlar, iş haberleri, döviz kurları, aktivite serisi.

**Dönem Filtresi**: Bugün / 7G / 30G / Bu Ay / Çeyrek / Tümü seçenekleriyle verileri filtreleyin.

---

## 📇 Müşteri Yönetimi

### Müşteri Listesi

Sol menüden **Müşteriler**'e tıklayın:

- **Arama**: İsim, telefon, e-posta, vergi no, adres, ilçe araması
- **Filtreler**: sektör, şehir, ilçe, ülke, segment, durum, sorumlu, etiket
- **İletişimsizler**: 30+ gündür iletişimsiz müşterileri göster
- **Dışa Aktar**: CSV olarak indir
- **Müşteri Ekle**: Yeni müşteri oluşturma dialog'u

**Tablo sütunları**: Müşteri (logo + ad + etiketler), sektör, şehir, segment, sorumlu, son iletişim (renkli nokta), durum, işlemler.

### Müşteri 360° (Detay Sayfası)

Bir müşteriye tıklayın → **9 sekme**:

| Sekme | İçerik |
|-------|--------|
| 🕐 Zaman Çizelgesi | Tüm aktiviteler (arama, toplantı, e-posta, WhatsApp, ziyaret) — ters kronolojik |
| 📝 Notlar | Müşteri notları (sabitleme özellikli) |
| 📈 Fırsatlar | Müşterinin satış fırsatları (değer, aşama, olasılık) |
| 👥 Kişiler | Müşteri şirketindeki kişiler (fotoğraf, pozisyon, iletişim) |
| ✅ Görevler | Müşteriye ait görevler |
| 📁 Dosyalar | Dosya yükleme (sözleşme, teklif, fatura — önizleme) |
| 📄 Teklifler | Müşterinin teklifleri (proforma dahil) |
| 🧾 Faturalar | Müşterinin faturaları (çeki listesi, irsaliye) |
| 📍 Harita | Müşteri konumu (SVG Türkiye haritası) |

**Hızlı Aksiyonlar** (üst kart):
- 📞 Ara — telefon araması başlat
- 💬 WhatsApp — şablonlu mesaj gönder
- ✉️ E-posta — şablonlu mail gönder
- 📝 Not Ekle
- ✅ Görev Oluştur
- 📈 Fırsat Aç

---

## 🗺️ Potansiyel Müşteri Madenciliği

Sol menüden **Potansiyel Müşteri**'ye tıklayın:

1. **Kategori seç**: Diş Kliniği, Kuaför, Restoran, Eczane, Otomotiv, Spor Salonu, Hukuk, Muhasebe
2. **Şehir ve yarıçap seç**
3. **Ara** butonuna bas
4. Sonuçlar tabloda görünür:
   - İsim, kategori, adres, telefon, web, puan, yorum sayısı
   - "CRM'de var" rozeti (mükerrer kontrolü)
5. **Seç ve Lead olarak aktar** — tek tıkla CRM'ne ekle
6. **Harita görünümü**: Marker'lar + cluster + zoom

Lead durumu: Yeni → İletişim → Nitelikli → Müşteriye Dönüştü / Kaybedildi

---

## 📊 Satış Pipeline (Kanban)

Sol menüden **Fırsatlar**'a tıklayın:

- **6 Aşama**: Yeni → İletişim → Teklif → Müzakere → Kazanıldı / Kaybedildi
- **Drag & Drop**: Kartları sürükleyerek aşama değiştir
- **Kazanıldı'ya bırakınca**: Otomatik olasılık %100
- **Kaybedildi'ya bırakınca**: Kayıp sebebi dialog'u (zorunlu)
- **Kart bilgi**: Başlık, müşteri, değer, olasılık, sorumlu, kapanış tarihi
- **Liste görünümü**: Tablo formatında tüm fırsatlar
- **Filtreler**: Sorumlu, aşama, arama

---

## ✅ Görevler ve Otomasyon

Sol menüden **Görevler**'e tıklayın:

### Görev Listesi
- **Tab'lar**: Tümü / Bugün / Bu Hafta / Gecikmiş / Tamamlanan
- **Öncelik chip'leri**: Acil / Yüksek / Orta / Düşük
- **Görev kartı**: Checkbox (tamamlama), başlık, müşteri linki, due date, öncelik
- **Grup görünümü**: Gecikmiş / Bugün / Yarın / Bu Hafta / Sonra / Tamamlanan

### Otomasyon Kartı (yan panel)
- **Canlı durum**: İletişimsiz müşteri sayısı + açık otomatik görev
- **Eşik ayarı**: Kaç gün iletişimsiz olunca görev oluşturulsun? (kalıcı saklama)
- **"Şimdi Çalıştır"**: Otomasyonu manuel tetikle
- **Aç/Kapa**: Otomasyonu aktif/pasif yap

### AI Panel (yan panel)
- **"AI Analizi Çalıştır"**: Müşterileri 0-100 puanla analiz et
- **Skorlama**: Recency (40) + Segment (25) + Deal (20) + Activity (15)
- **Top 10**: En yüksek potansiyelli müşteriler
- **Önerilen aksiyon**: Ara / WhatsApp / E-posta / Takip
- **"Görev Oluştur"**: Tek tıkla görev oluştur
- **"Top 10'a Otomatik Görev"**: Toplu görev oluşturma

---

## 📦 ERP — Ürün & Stok

Sol menüden **Ürün & Stok**'a tıklayın (Admin/Müdür):

- **4 İstatistik**: Toplam ürün, stok değeri, düşük/tükenmiş, kategori
- **Tablo**: Ürün (fotoğraf + ad + SKU), kategori, fiyat, stok, min stok, KDV, durum
- **Düşük stok**: Amber vurgu, tükenmiş: kırmızı badge
- **Ürün detay**: Stok hareket geçmişi + hareket ekleme (giriş/çıkış/düzeltme)
- **Fotoğraf**: Ürüne fotoğraf ekleme

---

## 📄 ERP — Teklifler ve Proforma

Sol menüden **Teklifler**'e tıklayın:

### Teklif Oluşturma
1. **"Yeni Teklif"** butonuna bas
2. Müşteri seç, para birimi seç
3. **Satır ekle**: Ürün seç (otomatik fiyat/KDV doldur) veya manuel
4. **Miktar, birim fiyat, KDV** gir
5. **Canlı toplam**: Ara toplam, KDV, genel toplam anlık hesaplanır
6. **"Proforma olarak işaretle"** — proforma fatura olarak kaydet

### Proforma Gönderme
- Teklif detayında **"Gönder"** butonu:
  - **WhatsApp**: wa.me linki ile mesaj gönder
  - **E-posta**: mailto: ile mail gönder
  - **PDF İndir**: Yazdırılabilir PDF önizleme

### Proforma Onayı → Otomatik Akış
- Proforma durumunu **"Onaylandı"** yap
- Sistem otomatik oluşturur:
  1. **Sipariş** (SIP-xxx)
  2. **Fatura** (FAT-xxx) — proforma satırları kopyalanır

---

## 🧾 ERP — Faturalar

Sol menüden **Faturalar**'a tıklayın:

### Fatura Detayı
- **Bilgi kartları**: Düzenleme, vade, ödeme tarihi, para birimi
- **Toplamlar**: Ara toplam, KDV, genel toplam
- **Kalemler tablosu**: Açıklama, miktar, birim fiyat, KDV %, satır tutarı
- **Belge Yönetimi**:
  - 📦 **Çeki Listesi** (Packing List) — No + tarih
  - 📋 **İrsaliye** (Dispatch Note) — No + tarih
  - 📄 **Sipariş** bağlantısı
- **Durum yönetimi**: Ödeme Bekliyor → Ödendi / Gecikti / İptal
- **Yazdır**: Print-friendly önizleme

### Otomatik Stok Düşme
- Fatura oluşturulunca, ürün bağlantılı satırlar için otomatik stok çıkışı
- StockMovement kaydı oluşturulur

---

## 📋 ERP — Sipariş Takibi

Sol menüden **Siparişler**'e tıklayın:

- **6 Durum**: Hazırlanıyor → Onaylandı → Üretimde → Sevk Edildi → Teslim Edildi / İptal
- **Takip zaman çizelgesi**: Her durum değişimi tarih + not ile loglanır
- **Proforma → Sipariş**: Proforma onayınınca otomatik sipariş
- **Manuel adım ekleme**: Takibe not ekle

---

## 🏭 Üretim Listesi (Depo Rolü)

**Depo rolü** ile giriş yapın:

- **SADECE üretim listesi** görünür (müşteri, fiyat, satış GİZLİ)
- **Tablo**: Ürün (fotoğraf), müşteri, sipariş no, miktar, durum
- **"Üretildi" tik butonu**: Hazırlanan kalemleri işaretle
- **Geri al**: Yanlış işaretleme düzeltme
- **Filtreler**: Bekliyor / Üretiyor / Üretildi / Tümü

---

## ☕ Kafe ERP

Sol menüden **Kafe Yönetimi**'ne tıklayın (Admin) veya kafe rolü ile giriş:

### Masa Yönetimi (Kuş Bakışı)
- **Görsel zemin planı**: Kafenin kuş bakışı görüntüsü
- **Masa ekleme**: Boş alana tıkla → numara gir
- **Sürükleme**: Masayı sürükleerek konumlandır
- **Düzenleme**: Masa no, şekil (kare/yuvarlak), kapasite
- **Durum renkleri**: Boş (yeşil) / Dolu (sarı) / Sipariş (mavi) / Rezerve (mor)

### Menü Yönetimi
- **Kategoriler**: İçecekler, Ana Yemekler, Tatlılar, vb.
- **Ürün ekleme**: İsim, fiyat, fotoğraf, hazırlık süresi
- **İstasyon**: Bar / Mutfak / Tatlı — hangi istasyonda hazırlanacak
- **Reçete**: Hazırlama talimatları (barmen/mutfak görür)

### Sipariş Akışı
```
Komi sipariş alır → Barmen/Mutfak kuyrukta görür → "Hazır" → Kasa görür → Ödeme
```

1. **Komi** (garson): Masayı seç → menüden ürün ekle → notlar → sipariş gönder
2. **Barmen**: Bar istasyonu siparişlerini görür (FIFO kuyruk)
   - "Hazırla" butonu → hazırlanıyor
   - Reçeteyi gör → "Hazır" butonu → kasa görür
3. **Mutfak**: Mutfak istasyonu siparişleri (aynı akış)
4. **Kasa**: Açık siparişleri görür, hazır item'lar vurgulu
   - "Ödeme Al" → nakit/kart/online
   - Ödeme tamamlanınca: sipariş kapanır, masa boşalır

---

## 💬 Şirket İçi Mesajlaşma

Sol menüden **Mesajlar**'a tıklayın:

- **Sol panel**: Kullanıcı listesi (okunmamış badge)
- **Sağ panel**: Sohbet penceresi
- **Mesaj gönder**: Yaz + Enter
- **Otomatik yenileme**: 5 saniyede bir
- **Mobil**: Tek panel, geri butonu

---

## 📊 Raporlar

Sol menüden **Raporlar**'a tıklayın (Müdür/Admin):

### 10 Bölüm
1. **KPI Özeti**: Pipeline, kazanma oranı, dönüşüm, ciro
2. **Satış Hunisi**: Aşama bazlı bar grafik
3. **Ciro Trendi**: 6 aylık area grafik
4. **Kazan/Kayıp**: Pie chart + kayıp sebepleri
5. **Maps Dönüşüm**: Lead funnel + şehir dağılımı
6. **Aktivite Performansı**: Tip bazlı + zaman bazlı grafik
7. **Temsilci Performansı**: Sıralanabilir tablo + **"Detay" butonu** (aktivite log'u)
8. **En İyi Müşteriler**: Top 10 (fırsat değerine göre)
9. **İletişimsiz Müşteriler**: 30+ gün listesi
10. **ERP Metrikleri**: Stok değeri, fatura ciro, en değerli ürünler, teklif dönüşüm

### Gün Sonu Raporu
- **"Gün Sonu Raporu"** butonu ile aç
- Tarih seç + kullanıcı seç (admin)
- 8 özet kart: Arama, WhatsApp, E-posta, Teklif, Müşteri, Görev, Fırsat, Süre
- Aktivite timeline + contacted customers
- CSV export

---

## ⚙️ Ayarlar

Sol menüden **Ayarlar**'a tıklayın (Admin):

| Sekme | İçerik |
|-------|--------|
| 🏢 Şirket | Şirket adı, plan, ülke, iletişim |
| 💰 Para Birimi | Varsayılan para birimi, döviz kurları |
| 🔔 Bildirimler | E-posta, uygulama içi, iletişimsiz uyarı, görev hatırlatma — **otomatik kaydet** |
| 🔐 KVKK & Veri | Açık rıza, veri indirme, anonimleştirme |
| 📋 Denetim Kayıtları | Audit log tablosu |
| 📝 Şablonlar | Hazır yazı şablonları (WhatsApp/e-posta, 10 varsayılan, düzenlenebilir) |

---

## 🛡️ Admin Panel

Sol menüden **Admin Paneli**'ne tıklayın (Admin):

### 3 Kolonlu Düzen
```
┌──────────┬────────────────┬──────────────┐
│  AĞAÇ    │    LİSTE       │   DETAY      │
│          │                │              │
│ 📊 Müş.  │ [Seçilen tür]  │ [Seçilen öğe]│
│ ├☕ Kafe │ müşterileri    │ özet + düzenle│
│ ├🌐 D.T. │                │              │
│ ├🎧 M.H. │                │              │
│ └👤 Müş. │                │              │
│          │                │              │
│ 👥 Kull. │ [Seçilen rol]  │              │
│ ├👑 Admin│ kullanıcıları  │              │
│ ├📋 Müdür│                │              │
│ └...     │                │              │
└──────────┴────────────────┴──────────────┘
```

### Müşteri Türü Değiştirme
- Müşteri seç → "Tür Değiştir"
- 4 seçenek: ☕ Kafe / 🌐 Dış Ticaret / 🎧 Müşteri Hizmetleri / 👤 Müşteri

### Rol Atama
- Kullanıcı seç → "Rol Değiştir"
- Görsel rol ağacı: Yönetim / Satış / Operasyon grupları
- Rol seç → yetki preview → onayla

---

## ⌨️ Kısayollar

| Kısayol | İşlem |
|---------|-------|
| `Ctrl+K` / `Cmd+K` | Global arama (Command Palette) |
| `ESC` | Dialog/palette kapat |
| `↑↓` | Palette'de gezin |
| `Enter` | Palette'de seç |

---

## 📱 Mobil Kullanım

- **Sidebar**: Mobilde drawer (hamburger menü ile açılır)
- **Tablolar**: Yatay scroll edilebilir
- **Dialog'lar**: Tam ekran
- **Kafe masa haritası**: Dokunmatik sürükleme

---

## 🎯 İpuçları

1. **Hızlı müşteri bulma**: `Ctrl+K` → isim yaz → tıkla
2. **İletişimsiz müşteriler**: Müşteri listesinde "İletişimsizler" butonu
3. **Otomasyonu çalıştır**: Görevler → "Şimdi Çalıştır" → eski müşterilere görev oluştur
4. **AI analizi**: Görevler → "AI Analizi Çalıştır" → potansiyelli müşterileri gör
5. **Proforma → fatura**: Tek tıkla proforma onayı → otomatik fatura + sipariş
6. **Şablonlu mesaj**: Müşteri 360 → "Şablonlu WhatsApp" → şablon seç → gönder
7. **Gün sonu**: Raporlar → "Gün Sonu Raporu" → günün özeti
8. **Dışa aktar**: Her listede CSV export butonu

---

## ❓ Sık Sorulan Sorular

**S: Müşteri sildim, geri alabilir miyim?**
Y: Hayır, silme kalıcı. Pasif yapmayı tercih edin.

**S: Proforma onayladım, fatura oluşmadı?**
Y: Faturalar modülünü kontrol edin. Otomatik oluşmuş olmalı.

**S: Depo rolü fiyatları göremiyor?**
Y: Doğru, depo rolü sadece üretim listesi görür, fiyatlar gizli.

**S: Kafe masalarını nasıl eklerim?**
Y: Kafe Yönetimi → Masalar → boş alana tıkla → numara gir.

**S: AI analizi ne sıklıkla çalışmalı?**
Y: Günde bir kez yeterli. Sabah işe başlarken çalıştırın.

---

## 📞 Destek

Sorularınız için: GNC CRM destek ekibi
Dokümantasyon: [README.md](./README.md) | [HANDOVER.md](./HANDOVER.md) | [TODO.md](./TODO.md)
