# GNC CRM — Dağıtım Kılavuzu

Bu doküman, GNC CRM Süperapp'i 4 platforma (Web, Android, iOS, Masaüstü) nasıl yayınlayacağınızı açıklar.

## 📦 Mimari

Tek bir Next.js codebase → 4 hedef:

```
┌─────────────────────────────────────────────────────────┐
│                  Next.js Codebase                       │
│  (CRM + ERP + Kafe + Market + Site + Randevu + Sosyal)  │
└────────────┬────────────┬──────────────┬───────────────┘
             │            │              │
   ┌─────────▼──────┐  ┌──▼──────┐  ┌────▼─────┐
   │ Web (PWA)      │  │ Mobile  │  │ Desktop  │
   │ next build     │  │ Capacit │  │ Tauri    │
   │ → standalone   │  │ or →    │  │ or →     │
   │ → Vercel/Docker│  │ APK/IPA │  │ .exe/.dmg│
   └────────────────┘  └─────────┘  └──────────┘
```

---

## 🌐 Web — PWA olarak yayınla

### 1. Production build
```bash
bun install
bun run db:push       # şemayı DB'ye uygula
bun run build         # .next/standalone üretir
bun run start         # production server'ı başlat
```

### 2. PWA özellikleri (zaten hazır)
- `public/manifest.json` — install manifest
- `public/sw.js` — service worker (offline destek)
- `public/offline.html` — offline fallback
- `public/icons/` — tüm icon boyutları (192/256/512/maskable/apple-touch)
- `src/app/layout.tsx` — tüm PWA meta tag'leri

### 3. Hosting seçenekleri

**Vercel (önerilen — Next.js'i native destekler):**
```bash
npm i -g vercel
vercel --prod
```

**Docker (kendi sunucunuzda):**
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public
COPY db ./db
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

**Caddy reverse proxy:**
```
gnc-crm.app {
  reverse_proxy localhost:3000
  encode gzip
  header Cache-Control "public, max-age=31536000, immutable"
}

# Service worker cache'lemesin
gnc-crm.app {
  @sw path /sw.js /manifest.json
  handle @sw {
    header Cache-Control "no-cache"
    reverse_proxy localhost:3000
  }
}
```

### 4. Yüklenebilirlik
- Chrome/Edge/Android: otomatik "Yükle" bannerı gösterilir (bizim `InstallPromptProvider` ile)
- iOS Safari: kullanıcı Paylaş → Ana Ekrana Ekle
- Desktop: tarayıcı adres çubuğundaki yükle simgesi

---

## 📱 Android — APK / Play Store

### 1. Ön koşullar
```bash
# Capacitor CLI + Android platform
bun add @capacitor/core @capacitor/cli @capacitor/android @capacitor/app @capacitor/haptics @capacitor/keyboard @capacitor/status-bar @capacitor/splash-screen @capacitor/push-notifications @capacitor/local-notifications @capacitor/network @capacitor/share @capacitor/camera @capacitor/geolocation @capacitor/filesystem
```

### 2. Android projesini ekle
```bash
npx cap add android
npx cap sync android
```

### 3. AndroidManifest.xml izinleri
`android/app/src/main/AndroidManifest.xml` dosyasına ekle:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### 4. APK üret
```bash
bun run build:web
npx cap sync android
npx cap open android     # Android Studio aç
# Build → Generate Signed APK / Bundle
```

### 5. Play Store'a yükle
- Google Play Console'da uygulama oluştur
- App Bundle (.aab) yükle
- Mağaza listesi: ekran görüntüleri, açıklama, kategori (`Business`)
- `public/icons/og-image.png`'i mağaza simgesi olarak kullan

---

## 📱 iOS — IPA / App Store

### 1. Ön koşullar
- macOS + Xcode 15+
- Apple Developer hesabı ($99/yıl)

### 2. iOS projesini ekle
```bash
bun add @capacitor/ios
npx cap add ios
npx cap sync ios
```

### 3. Info.plist izinleri
`ios/App/App/Info.plist` dosyasına ekle:
```xml
<key>NSCameraUsageDescription</key>
<string>GNC CRM, müşteri fotoğrafları çekmek için kamera kullanır</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>GNC CRM, ürün/müşteri görselleri seçmek için fotoğraf kütüphanesine erişir</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>GNC CRM, harita tabanlı potansiyel müşteri bulma için konumunuzu kullanır</string>
<key>NSMicrophoneUsageDescription</key>
<string>GNC CRM, sesli mesaj için mikrofonu kullanır</string>
```

### 4. IPA üret
```bash
bun run build:web
npx cap sync ios
npx cap open ios        # Xcode aç
# Product → Archive → Distribute App
```

### 5. App Store'a yükle
- App Store Connect'te uygulama oluştur
- TestFlight ile beta test (uygulamayı 10.000 testere kadar dağıt)
- App Store incelemesi gönder

---

## 💻 Masaüstü — Windows / Mac / Linux (Tauri)

### 1. Ön koşullar
```bash
# Tauri CLI (Rust gerekli)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
bun add -g @tauri-apps/cli
```

**Platform gereksinimleri:**
- Windows: Microsoft Visual C++ Build Tools + WebView2
- macOS: Xcode Command Line Tools
- Linux: `webkit2gtk`, `libssl-dev`, `librsvg2`

### 2. Masaüstü binary üret
```bash
bun run build:web
bun run tauri:build
```

Bu komut şunları üretir:
- **Windows**: `.msi` (installer) + `.exe` — `src-tauri/target/release/bundle/`
- **macOS**: `.dmg` + `.app` — `src-tauri/target/release/bundle/dmg/`
- **Linux**: `.deb` + `.AppImage` + `.rpm`

### 3. Store dağıtımı
- **Microsoft Store**: `.msix` üret → partner center'a yükle
- **Mac App Store**: `.app` → Apple Developer ID ile imzala → notarize → App Store Connect
- **Linux**: Snapcraft / Flathub veya doğrudan `.deb` dağıtımı

### 4. Otomatik güncelleme (opsiyonel)
`src-tauri/tauri.conf.json` içinde `updater` ekle:
```json
"updater": {
  "active": true,
  "endpoints": ["https://gnccrm.app/updates/{{target}}/{{arch}}/{{current_version}}"],
  "pubkey": "<PUBLIC_KEY>"
}
```

---

## 🚀 Tam Production Dağıtım Kontrol Listesi

### Veritabanı
- [ ] SQLite → PostgreSQL/MySQL'e geçiş (multi-instance için)
- [ ] `prisma/schema.prisma` datasource değiştir
- [ ] Migration çalıştır: `bun run db:migrate`

### Güvenlik
- [ ] `.env` içine güçlü `DATABASE_URL` koy
- [ ] `auth.ts` içinde `createSession` → gerçek JWT + refresh token
- [ ] `src/lib/social/publish.ts` → gerçek OAuth + access token
- [ ] HTTPS zorunlu (Caddy otomatik Let's Encrypt)
- [ ] CSP (Content Security Policy) header'ları ekle
- [ ] Rate limiting (API abuse önlemek için)
- [ ] Audit log retention politikası

### Performans
- [ ] Redis cache ekle (sık API yanıtları için)
- [ ] CDN ile static asset dağıtımı
- [ ] DB index'leri kontrolü (`@@index` leri uygula)
- [ ] Image optimization (Next.js `<Image>` kullan)

### İzleme
- [ ] Sentry — frontend + backend hata izleme
- [ ] LogRocket — kullanıcı davranış izleme
- [ ] Plausible/PostHog — analytics
- [ ] UptimeRobot — sunucu izleme

### Caching
- [ ] Next.js `revalidate` + `unstable_cache` kullan
- [ ] Service worker runtime cache (zaten var)
- [ ] DB query cache (Prisma'da `cacheStrategy`)

### Bildirim (Push)
- [ ] Web Push — VAPID key üret, `/api/push/subscribe` + `/api/push/send` ekle
- [ ] Mobil — FCM (Android) + APNs (iOS) entegrasyonu
- [ ] Cron ile zamanlanmış push (hatırlatmalar, aidat bildirimi)

### Yedekleme
- [ ] Günlük DB yedeği (otomatik cron)
- [ ] Yedekleri S3'e taşı
- [ ] Restore prosedürü test et

---

## 📊 Ölçeklendirme

### Tek sunucu (~1.000 kullanıcı)
- 1× Docker container (2GB RAM)
- SQLite yeterli
- Caddy reverse proxy

### Çoklu sunucu (~10.000+ kullanıcı)
- Load balancer (HAProxy/Nginx)
- PostgreSQL cluster (read replica)
- Redis (cache + session)
- S3 (dosya depolama)
- CDN (Cloudflare)

### Enterprise (50.000+)
- Kubernetes cluster
- Sharded PostgreSQL
- Redis cluster
- ELK stack (log aggregation)
- Multi-region deployment

---

## 🆘 Sorun Giderme

### Service Worker güncellenmiyor
```js
// Tarayıcı konsolunda:
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
// Sonra sayfayı yenile
```

### iOS'te Push çalışmıyor
- iOS 16.4+ gereklidir
- PWA'nın "Ana Ekrana Ekle" ile kurulmuş olması gerekir
- Apple Developer sertifikası gereklidir

### APK derleme hatası
- JDK 17 kullanın (Android Gradle Plugin 8 için)
- `android/gradle.properties` içine `org.gradle.jvmargs=-Xmx4g` ekle

### Tauri derleme hatası
- Rust güncel olmalı: `rustup update`
- WebView2 yüklü olmalı (Windows)
- macOS: `xcode-select --install`

---

Daha fazla bilgi için: [PWA docs](https://web.dev/progressive-web-apps/) | [Capacitor](https://capacitorjs.com/docs) | [Tauri](https://tauri.app/)
