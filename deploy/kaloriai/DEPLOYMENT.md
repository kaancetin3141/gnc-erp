# KaloriAI — Ubuntu VDS Dağıtım Rehberi

> Uygulama Ubuntu VDS'e dağıtıma **tamamen uygundur**: tek Node/Bun süreci +
> SQLite dosya DB + yerel disk upload + süreç içi zamanlayıcı ile tek-nokta
> (single-instance) mimari olarak tasarlandı. Aşağıdaki adımlar sıfır bir
> Ubuntu 22.04/24.04 sunucusunda çalışır duruma getirir.

---

## 1. Gereksinimler

| Bileşen | Sürüm | Not |
|---|---|---|
| Ubuntu | 22.04 / 24.04 LTS | 1 vCPU / 1 GB RAM yeterli başlangıç için |
| Node.js | 20 LTS veya 22 LTS | `next build` için |
| Bun | ≥ 1.1 | bağımlılık kurulumu + prod çalıştırıcı |
| nginx | stable | reverse proxy + TLS |
| certbot | — | Let's Encrypt (HTTPS **zorunlu**: kamera + web push secure-context ister) |

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
# Bun
curl -fsSL https://bun.sh/install | bash
# nginx + certbot
sudo apt-get update && sudo apt-get install -y nginx certbot python3-certbot-nginx
```

> Swap önerisi (1 GB RAM VDS): `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

## 2. Kodu Alma + Ortam

```bash
sudo adduser --disabled-password kaloriai
sudo -iu kaloriai
git clone https://github.com/kaancetin3141/KaloriAI.git
cd KaloriAI

cp .env.example .env
nano .env
```

`.env` üretim değerleri:

```ini
DATABASE_URL=file:./db/custom.db

# Üretimde önerilir: harici pinger uptime-kitor/cron ile push taraması
CRON_SECRET=<openssl rand -hex 32 çıktısı>

# Web push (bildirimler) için anahtar çifti — BİR KEZ üret:
#   bunx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=<üretilen public>
VAPID_PRIVATE_KEY=<üretilen private>
VAPID_CONTACT=mailto:admin@siteniz.com

# İsteğe bağlı
# USDA_API_KEY=
```

## 3. Kurulum + Build

```bash
bun install
bunx prisma generate
bunx prisma db push          # boş DB şeması
bun run build                # .next/standalone üretir (build script statik+public'i kopyalar)
```

İlk çalıştırma + DB optimizasyonu (WAL):

```bash
NODE_ENV=production bun .next/standalone/server.js &   # test: :3000 dinler
curl -s localhost:3000/api/auth/demo | head -c 80      # "accounts" JSON dönmeli
```

## 4. systemd Servisi

`scripts/deploy/kaloriai.service` dosyasını kopyalayın:

```bash
sudo cp scripts/deploy/kaloriai.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kaloriai
systemctl status kaloriai --no-pager
journalctl -u kaloriai -f          # canlı log
```

## 5. nginx + HTTPS

`scripts/deploy/nginx-kaloriai.conf` şablonunu kendi alan adınıza göre düzenleyin:

```bash
sudo cp scripts/deploy/nginx-kaloriai.conf /etc/nginx/sites-available/kaloriai
sudo ln -sf /etc/nginx/sites-available/kaloriai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
# TLS (proxy_set_header X-Forwarded-Proto ile Secure cookie otomatik aktifleşir)
sudo certbot --nginx -d alanadiniz.com -d www.alanadiniz.com
```

> **Neden HTTPS zorunlu:** kamera (getUserMedia), service worker ve web push
> yalnız secure-context'te çalışır; oturum çerezi `X-Forwarded-Proto: https`
> görünce otomatik `Secure; SameSite=None; Partitioned` moduna geçer
> (src/lib/auth.ts).

## 6. Yedekleme

`scripts/deploy/backup.sh` — SQLite **online** yedek (WAL-safe `.backup`),
upload/ dizini ve .env kopyası alır. Cron örneği (her gece 03:15):

```bash
sudo cp scripts/deploy/backup.sh /usr/local/bin/kaloriai-backup && sudo chmod +x /usr/local/bin/kaloriai-backup
sudo -u kaloriai crontab -e
# 15 3 * * * /usr/local/bin/kaloriai-backup >> /home/kaloriai/backup.log 2>&1
```

Geri yükleme: servisi durdur → `db/custom.db` + `upload/` kopyasını geri koy → başlat.

## 7. Güncelleme

```bash
sudo cp scripts/deploy/deploy.sh /usr/local/bin/kaloriai-deploy && sudo chmod +x /usr/local/bin/kaloriai-deploy
sudo -iu kaloriai ./deploy.sh        # pull → install → generate → db push → build → restart
```

## 8. Üretim Kontrol Listesi

- [ ] `.env` içinde `CRON_SECRET` + VAPID anahtarları set
- [ ] `https://` ile açılıyor; kilit ikonu var (Secure cookie)
- [ ] Kamera izni çalışıyor (`Permissions-Policy: camera=(self)` zaten set)
- [ ] Tarayıcı bildirimi izni verilebiliyor (Profile → Bildirimler)
- [ ] `systemd` aktif + `Restart=always` (çökmede otomatik toparlama)
- [ ] `ufw`: sadece 22/80/443 açık (`sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`)
- [ ] Günlük yedek cron çalışıyor (bir yedeği manuel test edin)
- [ ] `journalctl -u kaloriai` temiz (Exception yok)
- [ ] **Node doğrudan dışa açık DEĞİL**: yalnız nginx `127.0.0.1:3000`'e bağlanabilmeli; uygulama içi rate limiter `X-Real-IP`/`X-Forwarded-For` SON elemanından IP okur — nginx şablonundaki `proxy_set_header X-Real-IP $remote_addr` satırı aktif olmalı (aksi halde header spoof ile limitleme bypass edilebilir)

## 9. Bilinen Mimari Sınırlar (ölçekleme)

| Konu | Durum | Eşik |
|---|---|---|
| SQLite tek dosya | Tek VDS için ideal | Çoklu sunucu / yüksek eşzamanlı yazıda Postgres'e geçiş |
| In-memory rate limiter | Tek süreçte doğru | Çoklu replikada Redis tabanlı paylaşımlı store gerekir |
| Upload disk | Yerel disk | Çoklu replikada S3/R2 benzeri object storage gerekir |
| Push zamanlayıcı | Süreç içi (her dk) | Tek instance varsayımı — birden fazla instance çalıştırmayın |
| Abonelik | Simülasyon | Gerçek ödeme sağlayıcısı (RevenueCat/IAP/Stripe) bağlanana kadar monetizasyona hazır DEĞİL |
