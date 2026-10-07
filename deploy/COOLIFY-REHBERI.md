# 🚀 COOLIFY REHBERİ — Her Şeyi Tek Panelden Yönetme (Ücretsiz)

> **Amaç:** Tüm uygulamalarını (CRM, customer-page, Fruit Storm, KaloriAI) web'de yayınlamak,
> Play Store + App Store'a taşımak ve veritabanları dahil **her şeyi tek web panelinden** yönetmek.
>
> **Kısa cevap:** Plesk değil → **Coolify** (ücretsiz, açık kaynak "kendi Vercel'in").

---

## 1. Neden Coolify? (Plesk ile karşılaştırma)

| Özellik | Plesk | Coolify | Mevcut düzen (pm2 + script) |
|---|---|---|---|
| Fiyat | €10–50/ay | **Ücretsiz** | Ücretsiz |
| RAM kullanımı | ~1 GB+ | ~500 MB | ~0 (script'ler) |
| Web'den deploy (GitHub push → otomatik) | ❌ (ek ücret) | ✅ | ❌ (SSH gerekir) |
| Otomatik SSL (Let's Encrypt) | ✅ | ✅ | manuel certbot |
| Veritabanı kurma (PostgreSQL vb.) | ✅ | ✅ tek tık | SSH + terminal |
| Yedekleme paneli | ✅ | ✅ | script (backup-db.sh) |
| Rollback (eski sürüme dönme) | sınırlı | ✅ tek tık | git manuel |
| Sunucu metrikleri (CPU/RAM grafik) | ✅ | ✅ | ❌ |
| Web terminali | ✅ | ✅ | — |
| Sana uygunluk | gereksiz maliyet | ✅ **ideal** | ✅ çalışıyor ama zor |

**Sonuç:** Coolify = Plesk'in yaptığı işin tamamı, sıfır lisansta ücretiyle.

---

## 2. Hedef Mimari (Tek Sunucu)

```
                        Cloudflare (DNS, ücretsiz)
                                 │
                    ┌────────────▼────────────┐
                    │   Hetzner CX22 (€4,5/ay)│
                    │   Ubuntu 24.04 · 4 GB   │
                    │                         │
                    │   Coolify Paneli        │──► panel.gncinc.online
                    │   ├─ CRM (Next.js)      │──► app.gncinc.online
                    │   ├─ customer-page      │──► randevu.gncinc.online + *.gncinc.online
                    │   ├─ chat-service       │──► (CRM içinden ws)
                    │   ├─ Fruit Storm        │──► fruit.gncinc.online
                    │   └─ KaloriAI           │──► kalori.gncinc.online
                    │   ├─ [DB] SQLite dosya  │  (şimdilik — 100+ kullanıcıda Postgres)
                    │   └─ [Ops.] PostgreSQL  │  (tek tık, istediğin zaman)
                    └─────────────────────────┘
                                 │
              📱 Capacitor: aynı web uygulamaları
                 → Play Store (Android) + App Store (iOS)
```

> **Not:** Fruit Storm gibi tamamen statik oyun sitesi istersen Cloudflare Pages'e de
> taşıyabilirsin (ücretsiz + sınırsız bant genişliği) — ama tek panelde tutmak istersen
> Coolify'da da sorunsuz çalışır. Karar senin.

---

## 3. Adım Adım Kurulum (≈30 dakika)

### 3.1 Sunucu aç
1. hetzner.com → Cloud → **CX22** (2 vCPU / 4 GB RAM / €4,5) → Ubuntu 24.04
2. SSH anahtarını ekle, sunucuyu başlat, IP'yi not et (örn. `5.78.XX.XX`)

### 3.2 DNS (Cloudflare — ücretsiz)
| Tip | Ad | İçerik | Proxy |
|---|---|---|---|
| A | `@` | sunucu IP | 🟠 (önce gri DNS-only, SSL oturunca turuncu yap) |
| A | `*` | sunucu IP | 🟠 → tüm alt alan adları (randevu, sik-kuafor, app, panel...) tek kayıt! |
| A | `panel` | sunucu IP | gri (DNS-only) — ilk kurulum için |

> Wildcard `*` kaydı sayesinde her yeni işletme alt alan adı (sik-kuafor vb.)
> **DNS'e dokunmadan** otomatik çalışır.

### 3.3 Coolify kur (tek komut)
```bash
ssh root@SUNUCU_IP
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
- Bitince `http://SUNUCU_IP:8000` adresinde panel açılır
- İlk giriş: e-posta + şifre oluştur (bu, admin hesabın)
- Sonra Settings → Domains kısmına `http://panel.gncinc.online:8000` yaz → panel artık kendi alan adından açılır

### 3.4 GitHub'ı bağla
1. Coolify → **Sources** → GitHub App → "Connect with GitHub"
2. `kaancetin3141` hesabını seç, `gnc-erp` reposuna izin ver
3. Artık her `git push` sonrası **otomatik deploy** (veya butonla manuel)

---

## 4. Uygulamaları Ekleme

### 4.1 CRM (gnc-repo ana uygulama)
1. **+ New Resource → GitHub** → `gnc-erp` seç
2. Build: **Nixpacks** (Next.js'i otomatik algılar)
   - RAM koruması: Resource → Advanced → `NODE_OPTIONS=--max-old-space-size=1536` environment ekle
3. Environment Variables (repodaki `.env.example`'dan):
   ```
   DATABASE_URL=file:./db/custom.db
   BASE_DOMAIN=gncinc.online
   ADMIN_PASSWORD=314159        (değiştir!)
   AUTH_SECRET=<rastgele-uzun-dizgi>
   ```
4. **Domains** sekmesi → `https://app.gncinc.online` ekle → SSL otomatik gelir
5. **Deploy** butonuna bas 🚀

### 4.2 customer-page (randevu siteleri — 3002)
- Aynı repodan ikinci bir resource aç
- **Advanced → Base Directory:** `mini-services/customer-page`
- Start command: `bun run index.ts` (port 3002'yi Coolify'a `EXPOSE`/Port alanında bildir)
- Domains: `https://randevu.gncinc.online` **ve** wildcard `https://*.gncinc.online`
  → Coolify (Traefik) tüm işletme alt alan adlarını bu servise yönlendirir
- ⚠️ **KRİTİK:** customer-page, SQLite dosyasını CRM ile **paylaşmalı**. İki yol:
  - **Basit yol (önerilen):** İkisini tek **Docker Compose** resource'unda çalıştır,
    aynı volume `/app/db` yoluna mount edilir (compose taslağı §9'da)
  - customer-page'i read-only mount ile çalıştır (`:ro`)

### 4.3 Diğer uygulamalar
| Uygulama | Repo | Base Directory | Domain |
|---|---|---|---|
| Fruit Storm | kendi reposu | — | fruit.gncinc.online (veya Cloudflare Pages'e statik) |
| KaloriAI | kendi reposu | — | kalori.gncinc.online |
| chat-service | gnc-erp | mini-services/chat-service | (dahili, domain gerekmez) |

> Her uygulama = panelde ayrı kart: loglar, restart, redeploy, metrikler tek yerde.

---

## 5. Veritabanı Yönetimi (kolay kısım)

### Şimdilik: SQLite (sıfır bakım)
- Veritabanı = tek dosya (`db/custom.db`) → panelde **Terminal** açıp veya
  backup özelliğiyle yönetilir; bugüne kadar olduğu gibi çalışır
- Coolify **Docker Volume** sayesinde redeploy'larda dosya **kaybolmaz**
  (volume tanımı compose'da `crm-db:/app/db`)

### 100+ kullanıcı olduğunda: PostgreSQL (tek tık)
1. Coolify → **+ New Resource → PostgreSQL** → Deploy (1 dakika)
2. CRM'in `prisma/schema.prisma` dosyasında tek satır:
   ```prisma
   datasource db { provider = "postgresql" }   // sqlite → postgresql
   ```
3. `npx prisma migrate deploy` → veri taşınabilir
4. **Panelin Veritabanları bölümünde** tabloları görsel olarak görürsün,
   sorgu çalıştırırsın, otomatik yedek alırsın — MySQL'e gerek yok,
   Next.js + Prisma ekosisteminde Postgres standarttır (Neon/Supabase de seçenek)

### Yedekleme
- Coolify → Resource → **Backups** → S3 uyumlu herhangi bir depoya otomatik
  (örn. Backblaze B2 ~$1/TB veya Hetzner Storage Box)
- Geçiş yapana kadar mevcut `backup-db.sh` cron'u da çalışmaya devam edebilir

---

## 6. 📱 Mobil Yayın (Play Store + App Store)

### Hazırlık — zaten tamam
- ✅ Capacitor kuruldu (`capacitor.config.ts`, appId: `com.gnccrm.app`)
- ✅ HTTPS, Coolify ile otomatik gelecek (mağazaların zorunlu şartı)

### Android (Play Store — $25, tek seferlik)
1. CRM deploy edilmiş olmalı (canlı HTTPS URL)
2. `npm i @capacitor/android && npx cap add android`
3. `capacitor.config.ts` → `server: { url: "https://app.gncinc.online", cleartext: false }`
4. `npx cap sync android` → Android Studio → **Build > Generate Signed Bundle (AAB)**
5. play.google.com/console → keystore oluştur → AAB yükle → store listing → gönder
6. İnceleme genelde 1–3 gün

### iOS (App Store — $99/yıl)
1. Apple Developer hesabı gerekli + **derleme için macOS** gerekir
   - Mac'in yoksa: **Codemagic** (ücretsiz 500 dk/ay) veya GitHub Actions macOS runner
   - `npx cap add ios` → Codemagic'te repo'yu bağla → build → App Store Connect'e yükle
2. ⚠️ **Apple 4.2 reddi riski:** "sadece web sitesi sarmalayıcı" uygulamaları reddeder.
   Savunma için uygulamada şunları vurgula/görünür yap:
   - 📲 Push bildirimler (randevu hatırlatma — 3011 servisin var zaten!)
   - 📷 Kamera (işletme fotoğrafı / QR tarama)
   - 🔄 Çevrimdışı önbellek
3. İlk inceleme 1–7 gün, reddolursa düzelt ipucu net gelir

### Push bildirimleri (önerilen — "canlı uygulama" hissi)
- **OneSignal** ücretsiz katman: web + Android + iOS push tek panelden
- CRM'de randevu oluşturulunca 3011 reminder servisi → OneSignal API → müşterinin
  telefonuna bildirim. (İstersen bir sonraki iş bu olsun — entegrasyon kodunu yazarım.)

---

## 7. Günlük Kullanım — Artık Bu Kadar Basit

| İşlem | Eski yol | Coolify yolu |
|---|---|---|
| Yeni sürüm yayınlama | SSH → guncelle-gnc.sh | `git push` (otomatik) veya panelde **Redeploy** |
| Hatalı sürümü geri alma | git reset + yeniden deploy | **Rollback** butonu |
| Loglara bakma | `pm2 logs` | Panel → Logs (canlı) |
| SSL ekleme | certbot komutları | Domain ekle — otomatik |
| Yeni DB kurma | apt/ssh | + New Resource → PostgreSQL |
| Sunucu sağlığı | `htop` | Dashboard grafikleri |
| Yeniden başlatma | `pm2 restart all` | Restart butonu |

SSH artık yalnızca acil durumlar için.

---

## 8. Geçiş Planı (mevcut sunucudan yeni düzen'e)

1. Yeni Hetzner sunucusunu aç + Coolify kur (§3)
2. Cloudflare'da `*` wildcard'ı yeni IP'ye çevir (TTL düşük yap: 60 sn)
3. CRM'i deploy et → eski `db/custom.db` dosyasını panel Terminal'den yükle:
   ```bash
   # lokalinden: scp db/custom.db root@YENI_IP:/tmp/
   # panel Terminal: cp /tmp/custom.db /app/db/custom.db (volume içinde)
   ```
4. Test: app.gncinc.online + randevu.gncinc.online + bir işletme alt alan adı
5. Eski sunucuyu 1 hafta beklet → sonra kapat 💰
6. Play Store/App Store için §6'ya geç

> Roller: bu rehberdeki adımları birlikte yürütürüz — senden tek gereken
> Hetzner hesabı açmak ve kart bilgisini girmek.

---

## 9. Ek: CRM + customer-page için docker-compose taslağı
(Coolify'da "Docker Compose Empty" resource'u ile kullanılır — tek volume, iki servis)

```yaml
services:
  crm:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=file:/app/db/custom.db
      - BASE_DOMAIN=gncinc.online
      - NODE_ENV=production
    volumes:
      - crm-db:/app/db
    expose: ["3000"]

  customer-page:
    build:
      context: ./mini-services/customer-page
    environment:
      - BASE_DOMAIN=gncinc.online
      - CRM_DB_PATH=/app/db/custom.db
    volumes:
      - crm-db:/app/db:ro          # salt-okunur paylaşım
    expose: ["3002"]
    depends_on: [crm]

volumes:
  crm-db:
```

> ⚠️ Bu compose dosyası **taslaktır** — repoda Dockerfile'lar oluşturulup
> test edilmeden canlıya alınmamalı. "Başla" demen yeterli, Dockerfile'ları
> hazırlayıp lokalde doğrularım.

---

## 10. Sık Sorulanlar

**Plesk'i gerçekten hiç kullanmamalı mıyım?**
Tek kişilik geliştirici için hayır — ödediğin para + 1 GB RAM karşılığında Coolify'ın
ücretsiz yaptığını yapar. Plesk'in gücü ajan/WordPress tooling'indedir, sende ihtiyaç yok.

**MySQL neden değil?**
Prisma + Next.js dünyasında Postgres standart; SQLite→Postgres geçişi tek satır.
MySQL'e geçiş de aynı kadar kolay ama ekosistem avantajı Postgres'te.

**Maliyet özeti (aylık):**
| Kalem | Tutar |
|---|---|
| Hetzner CX22 | €4,5 |
| Coolify | ₺0 |
| Cloudflare | ₺0 |
| OneSignal push | ₺0 (10k aboneye kadar) |
| Domain (gncinc.online) | ~$10/yıl |
| Play Store | $25 **tek sefer** |
| App Store | $99/yıl |
| **TOPLAM (yıllık)** | **~€54 + mağaza ücretleri** |

**Fruit Storm / KaloriAI nerede?**
Aynı sunucu + aynı panel yeter (CX22 4 GB rahat kaldırır). Trafik patlarsa
Fruit Storm'u Cloudflare Pages'e taşımak 5 dakikadır (statik site).

---
*Hazırlayan: Z.ai — deploy/COOLIFY-REHBERI.md · güncelleme: geçiş yaptıkça bu dosyayı güncelle*
