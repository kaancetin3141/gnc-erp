# 🚀 GNC CRM — Yayın (Deployment) Rehberi

> Bu doküman, GNC CRM uygulamasını **nerede ve nasıl yayınlayacağınızı** adım adım anlatır:
> Web hosting mi, VDS mi? Database nasıl kurulur, yedeklenir, taşınır?

---

## 📌 1. Kısa Cevap (Özet)

| Soru | Cevap |
|---|---|
| **Bu uygulama ne tür bir yazılım?** | Next.js 16 (Node.js) sunucu uygulaması + SQLite dosya veritabanı |
| **Klasik web hosting'de (PHP/cPanel) çalışır mı?** | ❌ Doğrudan çalışmaz — Node.js süreci gerekir. Hosting'te **"Setup Node.js App"** özelliği varsa *kısıtlı* çalışabilir (Bölüm 5) |
| **Önerilen yöntem?** | ✅ **VDS sunucu** (tam kontrol, kararlı çalışma, cron/backup özgürlüğü) |
| **Veritabanı kurulumu gerekiyor mu?** | ✅ Hayır! SQLite **tek dosyadır** (`db/custom.db`) — MySQL/PostgreSQL sunucusu kurmanız gerekmez |

> 💡 **Neden?** Bu uygulama PHP gibi "her istekte çalıştırılan" bir site değil; sürekli ayakta duran bir
> **Node.js sunucu süreci**dir. Paylaşımlı web hosting'ler PHP için tasarlanmıştır ve uzun ömürlü Node.js
> süreçlerini düzgün çalıştıramaz.

---

## 📊 2. Web Hosting vs VDS Karşılaştırması

| Kriter | Web Hosting (cPanel) | VDS / VPS |
|---|---|---|
| Node.js desteği | ⚠️ Sadece "Setup Node.js App" (CloudLinux) varsa, sürüm eski olabilir | ✅ İstediğiniz sürüm (Node 20/22) |
| Süreç sürekliliği | ❌ Passenger süreci uykuya dalabilir, yeniden başlatma kontrolünüzde değil | ✅ pm2 ile 7/24 ayakta, sunucu yeniden başlasa bile otomatik açılır |
| Build (derleme) belleği | ❌ Paylaşımlı bellek limiti Next.js build'i için genelde yetersiz | ✅ 4 GB RAM + swap ile rahat |
| Cron / zamanlanmış görev | ⚠️ Sınırlı | ✅ Sınırsız (hatırlatıcılar, yedekleme) |
| Nginx / SSL kontrolü | ⚠️ cPanel ne veriyorsa o | ✅ Tam kontrol (Let's Encrypt ücretsiz) |
| Aylık maliyet | ~50–150 ₺ (mevcut paketiniz) | ~150–500 ₺ (2 vCPU / 4 GB) |
| Bu proje için | ⚠️ Deneme/test için idare eder | ✅ **Tavsiye edilen yol** |

### Karar kılavuzu
- **Önce şunu kontrol edin:** cPanel'e girin → "Setup Node.js App" menüsü var mı?
  - **YOKSA** → web hosting ile bu uygulama yayınlanamaz. VDS alın (Bölüm 3).
  - **VARSA** → Bölüm 5'teki adımlarla deneyebilirsiniz; ama kalıcı kullanım için yine VDS önerilir.

---

## 🖥️ 3. VDS Kurulumu (Önerilen Yol)

### 3.1 Sunucu donanım önerisi

| Profil | Konfigürasyon | Uygun olduğu ölçek |
|---|---|---|
| **Başlangıç** ✅ | 2 vCPU · 4 GB RAM · 50 GB NVMe SSD · 1 Gbps · Ubuntu 22.04/24.04 LTS | 1–15 kullanıcı, günlük birkaç bin istek |
| **Büyüme** | 4 vCPU · 8 GB RAM · 100 GB NVMe SSD | 15–50 kullanıcı, rapor/ihraç yoğunluğu |
| **Ek öneriler** | Bant genişliği sınırsız veya 2 TB+; anlık görüntü (snapshot) yedekleme özelliği olan sağlayıcı | Hetzner, Contabo, DigitalOcean, Vultr veya Türkiye'deki sağlayıcılar |

> ⚠️ **Önemli:** Next.js build'i bellek ister. 2 GB RAM altındaki sunucularda mutlaka **swap** ekleyin (3.3. adım).

### 3.2 Sunucu hazırlığı (ilk kez)

```bash
# Sunucuya bağlanın (sağlayıcınızın verdiği IP ve root şifresi)
ssh root@SUNUCU_IP

# Sistemi güncelleyin
apt update && apt upgrade -y

# Zaman dilimini ayarlayın
timedatectl set-timezone Europe/Istanbul

# Node.js 20 LTS kurulumu
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# pm2 (süreç yöneticisi) ve nginx kurulumu
npm install -g pm2
apt install -y nginx sqlite3 git

# Sürümleri doğrulayın
node -v   # v20.x beklenir
nginx -v
```

### 3.3 Swap ekleme (2–4 GB RAM'li sunucular için)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3.4 Kodu sunucuya taşıma

**Yol A — Git (önerilen):** Projeyi GitHub'dan sunucuya klonlayın.

**Depo PUBLIC (herkese açık) ise** — örnek gerçek deponuz:

```bash
sudo mkdir -p /var/www && sudo chown $USER /var/www
cd /var/www
git clone https://github.com/kaancetin3141/gnc-erp.git
cd gnc-erp
```

**Depo PRIVATE ise** sunucunun erişim anahtarı (PAT) olması gerekir:

1. GitHub → sağ üst avatar → **Settings** → en altta **Developer settings**
   → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
2. Not: `gnc-server` · Scope: **repo** işaretleyin → Generate → çıkan `ghp_...`
   değerini **yalnızca bir kez görürsünüz**, hemen kopyalayın
3. Sunucuda token ile klonlayın:

```bash
cd /var/www
git clone https://ghp_TOKENINIZ@github.com/kaancetin3141/gnc-erp.git gnc-erp
cd gnc-erp
```

> 🔐 Alternatif: `git config --global credential.helper store` çalıştırın; ilk `git pull`da
> bir kez kullanıcı adı + PAT sorar, sonra hatırlar.
> 📦 **GitHub'dan GELENLER:** kaynak kod, `prisma/schema.prisma`, `package.json`, `next.config.ts`.
> **GELMEYENLER (olmaması doğru):** `.env`, `db/custom.db`, `node_modules/`, `.next/`
> → `.env`'i sunucuda oluşturacağız (3.5), veritabanını isterseniz taşıyacaksınız (4.5).

**Yol B — Doğrudan kopyalama (kendi bilgisayarınızdan):**

```bash
# node_modules ve .next'i KESİNLİKLE göndermeyin; sadece kaynak kod + prisma + db
rsync -avz --exclude node_modules --exclude .next --exclude .env \
  ./ gnc-crm/ root@SUNUCU_IP:/var/www/gnc-crm/
```

> 📦 Gönderilmesi gerekenler: `src/`, `prisma/schema.prisma`, `public/`, `package.json`,
> `next.config.ts`, `tsconfig.json`. **Gönderilmeyecekler:** `node_modules/`, `.next/`, `db/custom.db`
> (isterseniz mevcut veritabanınızı da taşıyabilirsiniz — 4.5'e bakın).

### 3.5 Uygulamayı kurma ve derleme

```bash
cd /var/www/gnc-crm

# 1) Ortam dosyası (.env) oluşturun
cat > .env << 'EOF'
DATABASE_URL=file:/var/www/gnc-crm/db/custom.db
NODE_ENV=production
EOF
chmod 600 .env

# 2) Veritabanı klasörünü oluşturun
mkdir -p db

# 3) Bağımlılıkları kurun
npm install

# 4) Prisma istemcisini üretin + şemayı veritabanına uygulayın
npx prisma generate
npx prisma db push

# 5) Derleyin (build) — 2-5 dakika sürebilir
npm run build
```

> 📝 `npm run build` çıktısı **standalone** moddadır: `.next/standalone/server.js` tek başına çalışan sunucu dosyasıdır.

### 3.6 pm2 ile 7/24 çalıştırma

```bash
# Uygulamayı başlatın (port 3000)
pm2 start .next/standalone/server.js --name gnc-crm \
  --env NODE_ENV=production --env PORT=3000

# Sunucu yeniden başladığında otomatik açılma
pm2 save
pm2 startup   # çıkan komutu kopyalayıp çalıştırın

# Durum ve loglar
pm2 status
pm2 logs gnc-crm
```

> 🔍 Test: `curl http://localhost:3000` → HTML dönmeli.

### 3.7 Nginx ters vekil (reverse proxy) + alan adı

```bash
nano /etc/nginx/sites-available/gnc-crm
```

İçeriğe:

```nginx
server {
    listen 80;
    server_name sirketiniz.com www.sirketiniz.com;   # kendi alan adınız

    client_max_body_size 25M;   # dosya/belge yüklemeleri için

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/gnc-crm /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 3.8 Ücretsiz SSL (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d sirketiniz.com -d www.sirketiniz.com
# Otomatik yenileme testi
certbot renew --dry-run
```

### 3.9 Güvenlik duvarı

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

> ✅ Kurulum bitti! Uygulamanız `https://sirketiniz.com` adresinde yayında.

---

## 🗄️ 4. Veritabanı (SQLite) — Anlatım ve Yönetim

### 4.1 SQLite nedir, neden seçildi?

Bu uygulama **SQLite** kullanır: MySQL/PostgreSQL gibi ayrı bir veritabanı sunucusu **kurmazsınız**.
Tüm veriler **tek bir dosyada** tutulur: `db/custom.db`.

| Avantaj | Açıklama |
|---|---|
| Sıfır kurulum | Ayrı sunucu/şifre yok; uygulama doğrudan dosyaya yazar |
| Taşınması kolay | Dosyayı kopyalamak = veritabanını taşımak |
| Yedeklemesi kolay | Dosyayı kopyalamak = yedek |
| Performans | Küçük-orta ölçekli işletme verisi (on binlerce kayıt) için gayet hızlı |

Önemli kavramlar:

- **Şema (schema):** Tablo yapısının tanımı → `prisma/schema.prisma` dosyası.
- **Prisma:** Uygulamanın veritabanıyla konuşmasını sağlayan katman. Şemayı değiştirince
  `npx prisma db push` komutu değişikliği dosyaya uygular (veri kaybolmaz; sadece yeni kolonlar eklenir).
- **DATABASE_URL:** `.env` dosyasında veritabanı dosyasının **tam yolu**:
  `DATABASE_URL=file:/var/www/gnc-crm/db/custom.db`

### 4.2 Veritabanı komutları (sunucuda, proje klasöründe)

```bash
npx prisma db push        # şemayı uygula (güvenli, veriyi korur)
npx prisma generate       # Prisma istemcisini yeniden üret
npx prisma studio         # tarayıcıda veri görüntüleme arayüzü (port 5555)
```

### 4.3 Performans önerisi: WAL modu

Aynı anda hem okuma hem yazma yoğunluğu için bir kez çalıştırın:

```bash
sqlite3 db/custom.db "PRAGMA journal_mode=WAL;"
```

### 4.4 Yedekleme (ÇOK ÖNEMLİ!)

**Otomatik günlük yedek** (cron ile) — sunucuda:

```bash
mkdir -p /var/backups/gnc-crm
crontab -e
```

Şu satırı ekleyin (her gece 03:00):

```cron
0 3 * * * sqlite3 /var/www/gnc-crm/db/custom.db ".backup /var/backups/gnc-crm/backup-$(date +\%Y\%m\%d).db" && find /var/backups/gnc-crm -name "backup-*.db" -mtime +14 -delete
```

> Bu, her gece veritabanının **tutarlı bir kopyasını** alır ve 14 günden eski yedekleri siler.
> (sqlite3 `.backup`, uygulama çalışırken bile bozulmasız kopya alır.)

**Yedekleri sunucu dışına da alın** (sunucu çalınsa/yanarsa):

```bash
# Kendi bilgisayarınızdan, haftalık:
scp root@SUNUCU_IP:/var/backups/gnc-crm/backup-$(date +%Y%m%d).db ./yedekler/
```

### 4.5 Mevcut verilerinizi (bu demo ortamındaki) taşımak

Geliştirme ortamındaki `db/custom.db` dosyasında çalışan gerçek verileriniz varsa:

```bash
# Kendi bilgisayarınızdan / bu ortamdan indirin
scp root@SUNUCU_IP:/var/www/gnc-crm/db/custom.db ./local-custom.db   # (ters yön örneği)

# Sunucuya gönderin
scp db/custom.db root@SUNUCU_IP:/var/www/gnc-crm/db/custom.db
chown www-data:www-data /var/www/gnc-crm/db/custom.db   # nginx/pm2 kullanıcısına yazma izni
pm2 restart gnc-crm
```

> ⚠️ Şema sürümleri farklıysa önce `npx prisma db push` çalıştırıp ardından dosyayı taşıyın.

### 4.6 SQLite ne zaman yeterli olmaz?

| Durum | Çözüm |
|---|---|
| 50+ eşzamanlı kullanıcı, saniyede yüzlerce yazma | PostgreSQL'e geçiş |
| Birden fazla sunucuda aynı veriye erişim | PostgreSQL / MySQL (zorunlu) |
| Geçiş gerekirse | `prisma/schema.prisma` içinde `provider = "sqlite"` satırını `postgresql` yapın, `DATABASE_URL`'i PostgreSQL bağlantısıyla değiştirin, `npx prisma db push` — kod değişikliği gerekmez |

---

## 🌐 5. Web Hosting (cPanel) ile Deneme Yolu — Var ama Kısıtlı

> ⚠️ Bu yol **yalnızca** hosting paketinizde **"Setup Node.js App"** (CloudLinux Passenger) varsa çalışır.
> Yoksa bu bölümü atlayın → VDS'e geçin.

### Adımlar

1. **cPanel → Setup Node.js App → Create Application**
   - Node.js version: **20.x** (veya en yüksek)
   - Application mode: **Production**
   - Application root: `gnc-crm`
   - Application URL: alan adınız
   - Startup file: **`server.js`** (aşağıda oluşturacağız)
2. **Dosyaları yükleyin** (cPanel Dosya Yöneticisi): kaynak kod + `prisma/` klasörü.
   `node_modules` ve `.next` **yüklemeyin**.
3. **Lokalde derleyin, sunucuya yükleyin** (cPanel belleği build için genelde yetersizdir):

   ```bash
   # kendi bilgisayarınızda
   npm install
   npx prisma generate
   npm run build
   # ardından .next klasörünü zip'leyip cPanel'e yükleyin
   ```
4. **.env oluşturun** (cPanel dosya yöneticisinden):
   `DATABASE_URL=file:/home/CPANEL_KULLANICI/gnc-crm/db/custom.db`
5. cPanel Node.js App ekranında **Environment variables**:
   `NODE_ENV=production`, `PORT=3000`
6. **Run NPM Install** butonuna basın, sonra `npx prisma db push`'u terminallerden çalıştırın
   (cPanel → Terminal varsa).
7. Aşağıdaki **`server.js`** köprü dosyasını proje köküne ekleyin:

   ```js
   // server.js — Passenger için Next.js standalone köprüsü
   const { createServer } = require('http');
   const next = require('.next/standalone/server.js');
   // basit yönlendirme: standalone sunucuyu başlat
   process.env.NODE_ENV = 'production';
   require('/home/CPANEL_KULLANICI/gnc-crm/.next/standalone/server.js');
   ```
8. **Restart** butonuna basın ve alan adınızı tarayıcıda açın.

### Bu yolun sınırları (neden önerilmediği)

- Passenger süreci boştayken **uykuya dalabilir** → ilk istekler yavaş açılır.
- Uygulama **çökerse otomatik başlatma garantisi** zayıftır (pm2 gibi değil).
- **Cron/arka plan görevleri** kısıtlıdır (randevu hatırlatıcıları sorun çıkabilir).
- Sürücü yolu, izinler ve güncellemeler (her sürümde zip yükleme) zahmetlidir.

---

## ✅ 6. Yayına Alma Sonrası Kontrol Listesi

- [ ] `https://` ile açılıyor, kilit simgesi var (SSL aktif)
- [ ] Giriş yapılıyor, rol seçimi çalışıyor
- [ ] Demo/test kullanıcıları **kapatıldı veya şifreleri değiştirildi**
- [ ] `.env` dosyası `chmod 600` — repoya dahil **değil**
- [ ] `pm2 status` → **online**, sunucu yeniden başlatıldığında otomatik açılıyor (`pm2 startup`)
- [ ] Günlük SQLite yedeği cron'a bağlı; yedek dosyası oluştuğunu kontrol ettiniz
- [ ] Yedeklerin sunucu dışına (kendi bilgisayarınıza/buluta) kopyası yapılıyor
- [ ] `ufw` aktif; 22/80/443 dışındaki portlar kapalı

---

## 🔧 7. Güncelleme / Yeni Sürüm Yayınlama (VDS)

**Yeni sürüm geldiğinde her şeyi BAŞTAN yapmak YOKTUR!** Nginx, SSL, pm2, Node,
veritabanı bir kez kurulur ve hep yerinde kalır. Yeni sürümde yapılacak tek şey:

```bash
cd /var/www/gnc-erp
git pull                      # yeni kod (sadece değişen dosyalar gelir)
npm install                   # bağımlılık değiştiyse
npx prisma db push            # şema değiştiyse (VERİ KORUNUR)
npm run build
pm2 restart gnc-crm
```

> 🔒 **Verileriniz güvende:** `db/custom.db` ve `.env` GitHub'da olmadığı için `git pull`
> asla onlara dokunmaz. Müşteriler, randevular, satışlar — hepsi yerinde kalır.
> Nginx/SSL kurulumu tekrar gerekmez.

**Tek komutluk güncelleme (kurun, ömür boyu rahat edin):**

```bash
cat > /usr/local/bin/guncelle-gnc.sh << 'EOF'
#!/bin/bash
set -e
cd /var/www/gnc-erp
echo "1/5) Yeni kod çekiliyor..."
git pull
echo "2/5) Bağımlılıklar kontrol ediliyor..."
npm install
echo "3/5) Veritabanı şeması güncelleniyor..."
npx prisma db push
echo "4/5) Derleme yapılıyor (2-5 dk)..."
npm run build
echo "5/5) Uygulama yeniden başlatılıyor..."
pm2 restart gnc-crm
pm2 status
echo "✅ Güncelleme tamam!"
EOF
chmod +x /usr/local/bin/guncelle-gnc.sh
```

Artık güncelleme = SSH'de tek satır: `guncelle-gnc.sh`

> Rollback gerekirsa: `git checkout <eski-sürüm-etiketi>` ve aynı adımlar; veritabanı dosyası
> yedeklerinizde güvende.

---

## 🆘 8. Sık Karşılaşılan Sorunlar

| Belirti | Neden | Çözüm |
|---|---|---|
| 502 Bad Gateway | Uygulama kapalı / port farklı | `pm2 status`, `pm2 logs gnc-crm`; nginx `proxy_pass` portu 3000 mi? |
| "Cannot find module .next/standalone/server.js" | Build eksik | `npm run build` tekrar çalıştırın |
| Veritabanı hatası: "file is not a database" | Yanlış DATABASE_URL / bozuk dosya | `.env`'de **mutlak yol** (`file:/var/www/...`) olduğundan emin olun; yedeğinizi geri yükleyin |
| Build sırasında "Killed" / JS heap out of memory | RAM yetersiz | Swap ekleyin (3.3), `NODE_OPTIONS="--max-old-space-size=3072" npm run build` |
| Saatler kayık görünüyor | Zaman dilimi | `timedatectl set-timezone Europe/Istanbul` + `pm2 restart gnc-crm` |
| Dosya yükleme başarısız | nginx boyut limiti | `client_max_body_size 25M;` ekleyin, `nginx -t && systemctl reload nginx` |

---

## 🏠 9. Kendi Bilgisayarınızı Sunucu Yapmak (Ev Sunucusu)

> **Soru:** "Alan adım var, kendi bilgisayarımı sunucu olarak kullanabilir miyim?"
> **Cevap:** Evet, mümkün — hatta **Cloudflare Tunnel** ile port bile açmadan. Aşağıda iki yöntem ve
> dürüst bir karşılaştırma var.

### 9.1 Önce gerçekleri bilin (Türkiye şartları)

| Konu | Açıklama |
|---|---|
| **CGNAT sorunu** | Türk İSS'lerin (Türk Telekom, Turkcell vb.) ev internetlerinde **statik/gerçek IP** yoksa modeminize dışarıdan erişilemez (CGNAT arkasındasınızdır). Çözüm: İSS'den **"gerçek IP"** talep etmek (bazılarında ücretsiz, bazılarında küçük ücretli) **veya** 9.2'deki Cloudflare Tunnel (CGNAT'i hiç umursamaz ✅) |
| **Port engeli** | Bazı ev bağlantılarında 80/443 portları İSS tarafından engellenir. Tunnel yönteminde port açmanız gerekmez |
| **7/24 çalışma** | Bilgisayar uyumaya/eşleşmeye girmemeli: Windows güç ayarlarından **uykuyu kapatın**. Elektrik kesintisi = site kesintisi |
| **Upload hızı** | Ziyaretçilere upload yönünüzden servis verirsiniz. VDSL ev paketlerinde upload 5–25 Mbps — küçük ekip için yeterli |
| **Elektrik maliyeti** | Ortalama bir PC 7/24 açık ≈ ayda 60–150 ₺ elektrik (VDS'in fiyatına yaklaşıyor!) |
| **Windows olur mu?** | Olur ✅ (Node.js Windows'ta çalışır, Bölüm 9.4). Ama Linux/Ubuntu daha sorunsuz ve hafiftir |

### 9.2 Yöntem A — Cloudflare Tunnel (ÖNERİLEN, ücretsiz)

**Avantajları:** Port açmazsınız, CGNAT/İSS engeli umursanmaz, ücretsiz SSL otomatik,
DDNS'e gerek yok, modeminize dışarıdan kimse direkt erişemez (güvenli).

**Adımlar:**

1. **Alan adınızı Cloudflare'e bağlayın** (ücretsiz plan yeterli):
   - cloudflare.com → Add site → alan adınızı girin
   - Cloudflare'in verdiği **2 nameserver**'ı alan adı satıcınızın paneline yazın
2. **cloudflared'i kurun:**
   - **Windows:** https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ → `cloudflared-windows-amd64.exe` indirin, `cloudflared.exe` olarak `C:\cloudflared\` koyun
   - **Linux:** `curl -fsSL https://pkg.cloudflare.com/cloudflared-anywhere.sh | sudo bash`
3. **Giriş yapın ve tünel oluşturun:**

   ```bash
   cloudflared tunnel login                       # tarayıcı açılır, alan adınızı seçin
   cloudflared tunnel create gnc-crm              # tünel + kimlik dosyası oluşur
   ```

4. **Yapılandırma dosyası** (`~/.cloudflared/config.yml` — Windows'ta `C:\Users\<ad>\.cloudflared\config.yml`):

   ```yaml
   tunnel: gnc-crm
   credentials-file: C:\Users\<ad>\.cloudflared\<tünel-id>.json
   ingress:
     - hostname: sirketiniz.com
       service: http://localhost:3000
     - service: http_status:404
   ```

5. **DNS'i bağlayın:** `cloudflared tunnel route dns gnc-crm sirketiniz.com`
6. **Uygulamayı başlatın** (Bölüm 3.5/9.4'teki gibi build + pm2/servis, port 3000)
7. **Tunnel'i kalıcı servise çevirin:**

   ```bash
   cloudflared service install        # PC yeniden başlasa bile otomatik bağlanır
   ```

> ✅ Bitti! `https://sirketiniz.com` artık evinizdeki bilgisayarı işaret eder. SSL otomatik,
> modeminizde açık port yok.

### 9.3 Yöntem B — Gerçek IP + Port Yönlendirme (klasik)

İSS'den gerçek (statik) IP aldıysanız:

1. Modem arayüzüne girin (genelde `192.168.1.1`) → **Port Yönlendirme / NAT / Virtual Server**
2. TCP **80** ve **443** → bilgisayarınızın yerel IP'sine yönlendirin (ör. `192.168.1.50` —
   bilgisayara modemden **statik yerel IP** verin, DHCP rezervasyonu)
3. Alan adınızın **A kaydını** ev IP'nize yönlendirin (IP değişirse DDNS kullanın: DuckDNS vb.)
4. Windows güvenlik duvarında 3000'e (veya nginx 80/443'e) izin verin
5. SSL: Let's Encrypt `certbot` (Linux) veya `win-acme` (Windows)

> ⚠️ Bu yöntemde modeminiz doğrudan internete açılır; Windows güncellemeleri, güçlü şifreler ve
> güvenlik duvarı şart. Tunnel yöntemi bu riskleri taşımadığı için önceliklidir.

### 9.4 Windows'ta uygulama çalıştırma (hızlı özet)

```powershell
# 1) Node.js 20 LTS kurun: https://nodejs.org
node -v

# 2) Projeyi kopyalayın (veya zip indirip açın), klasöre girin
cd C:\gnc-crm

# 3) .env oluşturun (Windows yolu)
#    DATABASE_URL=file:C:/gnc-crm/db/custom.db

# 4) Kurulum + şema + derleme
npm install
npx prisma generate
npx prisma db push
npm run build

# 5) pm2 ile 7/24 çalıştırma
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start .next\standalone\server.js --name gnc-crm
pm2 save

# 6) Yedekleme: db\custom.db dosyasını Task Scheduler ile günlük kopyalayın
```

> 💡 **İpucu:** Uykuyu kapatmayı unutmayın: Ayarlar → Sistem → Güç → **Hiçbir zaman uyku**.
> Ayrıca BIOS'ta "AC Power Loss → Power On" açıksa elektrik kesilip gelince PC kendisi açılır.

### 9.5 Ev Sunucusu vs VDS — Dürüst Karşılaştırma

| Kriter | 🏠 Ev PC + Tunnel | ☁️ VDS |
|---|---|---|
| Başlangıç maliyeti | ✅ 0 ₺ (mevcut PC) | ~150–500 ₺/ay |
| Aylık gerçek maliyet | Elektrik ~60–150 ₺ | Aynı |
| Kesinti riski | ❌ Elektrik/internet kesintisi = site kapalı | ✅ %99.9 uptime, yedek güç |
| Güvenlik | ⚠️ Ev ağınıza bağımlı | ✅ İzole veri merkezi |
| Performans | ⚠️ PC kalitesine bağlı | ✅ Garantili kaynak |
| Bakım yükü | Sizde | Sağlayıcı altyapıda |
| **Tavsiye** | Deneme / küçük ekip (1–5 kişi) / bütçe sıfır | ✅ **Gerçek iş kullanımı** |

> 🎯 **Pratik öneri:** Küçük işletmeyseniz ve hemen bugün sıfır maliyetle başlamak istiyorsanız
> **Ev PC + Cloudflare Tunnel** makul bir başlangıçtır. Verileriniz büyüyüp ekip günlük işini
> bu uygulamaya bağladığında **VDS'e geçin** — geçiş de çok kolay: `db/custom.db` dosyasını
> yeni sunucuya kopyalamanız yeterli (Bölüm 4.5).

---

## ☁️ 10. AWS'den Ücretsiz VDS Alma — Windows Kullanıcıları İçin Adım Adım

> Bu bölüm, AWS hesabı açıp **ücretsiz (Free Tier)** sunucuda GNC CRM çalıştırmak isteyen
> **daha önce Linux kullanmamış** Windows kullanıcıları için yazılmıştır.

### 10.1 Windows mu Ubuntu mu? — Net Cevap: UBUNTU

"Windows bana tanıdık geliyor" hissi çok normal, ama bu kararda tanıdıklık değil
**teknik gerçek** belirleyici:

| Kriter | Ubuntu Server 24.04 | Windows Server |
|---|---|---|
| Free tier makinesindeki RAM | 1 GB — **rahat çalışır** | 1 GB — **çalışmaz, sürekli donar** ❌ |
| Gerekli RAM (gerçekçi) | 1 GB yeterli (swap ile) | En az 2–4 GB |
| Uygulama kurulumu | ~10 komut (aşağıda hazır) | IIS kurulumu, PowerShell betikleri, karmaşık |
| GNC CRM kurulum rehberi | ✅ Bu rehberin tamamı Linux | ❌ Bu rehberdeki hiçbir adım uymaz |
| 12 ay sonrası maliyet | 0 ₺ (her zaman ücretsiz) | Windows lisansı ek ücret başlar |
| Node.js / Next.js ekosistemi | ✅ Birinci sınıf destek | ⚠️ Kurulur ama sorunlu |

**Neden Windows olmaz?** AWS Free Tier'ın ücretsiz makinesi **1 GB RAM**'lidir.
Windows Server'ın kendisi bile açılırken 1,5–2 GB RAM ister → makine sürekli diske
takas yapar, RDP ekranı açılmaz, uygulama hiç konuşlanamaz. Windows Server'ı
kullanılabilir kılmak için ücretli en az 4 GB'lık makine gerekir (aylık ~$30+).

**Neden Ubuntu'dan korkmayın?** Kurulumdan sonra hiçbir şey "yönetmeyeceksiniz":
pm2 uygulamanızı 7/24 çalıştırır, sunucu açılınca otomatik başlatır, certbot SSL'i
otomatik yeniler. Sizin günlük hayatta kullanacağınız şey **~10 kopyala-yapıştır
komuttur** (10.6'da hazır) — DOS komutlarının İngilizcesi gibi düşünün (`dir`→`ls`).

> 🏠 **Alternatif hatırlatma:** Ubuntu'ya hiç bulaşmak istemiyorsanız Bölüm 9'daki
> "Kendi PC'niz + Cloudflare Tunnel" yolu tamamen Windows'unuzda kalır. Ama gerçek
> iş kullanımı (7/24, elektrik kesintisiz) için VDS daha doğru — bir kez kurup unutursunuz.

### 10.2 Hangi Model (Instance Type) Seçilmeli?

Free Tier'a dahil olan **tek** makine ailesi:

| Model | CPU / RAM | Ücretsiz mi? |
|---|---|---|
| **t3.micro** (tercih edilen) | 2 vCPU, 1 GB RAM | ✅ 750 saat/ay (bölgeye göre) |
| **t2.micro** (t3 yoksa) | 2 vCPU, 1 GB RAM | ✅ 750 saat/ay |
| t4g.small, t3.small, ARM'lar | — | ❌ ÜCRETSİZ DEĞİL, para keser! |
| Windows Server AMI | — | ✅ ama 1 GB RAM'de kullanılamaz (10.1) |

**750 saat/ay ≈ tüm ay 7/24 çalıştırmak** demektir (31 gün × 24 saat = 744 saat).
Yani CRM'inizi kesintisiz çalıştırabilirsiniz.

**Seçerken altın kural:** Instance oluşturma ekranında **"Free tier eligible"**
etiketini/filtresini kullanın — o etiketli olanlar arasından **t3.micro** seçin;
bölgenizde yoksa **t2.micro**. Etiketli olmayan hiçbir şeye dokunmayın.

### 10.3 Hesap Açarken ve Bölge Seçerken

1. **Kayıt:** https://aws.amazon.com/free → hesap açın (kredi kartı ister;
   ücretsiz sınırlarda para kesmez, ama sınırları aşarsanız keser → 10.8'deki alarım kurun).
2. **Bölge (Region):** Sağ üstten **Frankfurt (eu-central-1)** seçin — Türkiye'ye
   gecikme ~40–50 ms, en stabil Avrupa bölgesi. İstanbul bölgesi (eu-south-1) de
   olur ama instance tipi bulunabilirliği Frankfurt'ta daha iyidir.
3. **Free plan sürümü notu:** 2025 ortasından sonra açılan yeni hesaplarda AWS
   "kredi tabanlı yeni Free Plan"e geçti (kaydırmalı 6 aylık dönem + $100–200 kredi).
   Eski "12 ay Free Tier" hesaplarında 750 saat 12 ay boyunca geçerlidir. Hangisinde
   olduğunuzu farketmez — t3.micro/t2.micro her iki planda da ücretsiz kapsamdadır;
   **Billing konsolundan "Free tier" sayfasını takip edin.**

### 10.4 Instance Oluşturma — Tık Tık Adımlar

AWS konsolu → aramaya **EC2** yazın → **Launch instance**:

1. **Name:** `gnc-crm`
2. **Application and OS Images (AMI):** **Ubuntu Server 24.04 LTS** seçin
   (❌ "Amazon Linux" varsayılan olarak seçilidir — **değiştirin**;
   ❌ Windows Server seçmeyin). "Free tier eligible" etiketli olana dikkat.
3. **Instance type:** **t3.micro** (yoksa t2.micro) — "Free tier eligible" etiketli.
4. **Key pair:** **Create new key pair** → Ad: `gnc-key` → Type: **RSA**,
   Format: **PEM** → Create (`.pem` dosyası iner — **bu dosyayı kaybederseniz
   sunucuya bir daha giremezsiniz**, güvenli bir yere arşivleyin).
5. **Network settings → Edit:**
   - **Auto-assign public IP:** Enable (varsayılan)
   - **Security group rules:**
     | Tür | Port | Kaynak | Amaç |
     |---|---|---|---|
     | SSH | 22 | **My IP** | Sadece siz bağlanın |
     | HTTP | 80 | Anywhere (0.0.0.0/0) | Site erişimi |
     | HTTPS | 443 | Anywhere (0.0.0.0/0) | SSL erişimi |
   - ❌ "Allow HTTP 8080", "All traffic" gibi geniş kurallar eklemeyin.
6. **Configure storage:** **30 GB** gp3 (Free Tier sınırı 30 GB; 20 GB da yeterli).
7. **Launch instance** → birkaç dakikada hazır.
8. Instance durum "Running" olunca seçin → **Public IPv4 address**'i kopyalayın
   (ör. `3.71.123.45`). Bu IP = sunucunuz.

> ⚠️ **IP sabitliği:** Public IP, makineyi **stop–start** yaptığınızda **değişir**.
> Sabit IP isterseniz EC2 → **Elastic IP** → Allocate + instance'a associate edin.
> (Çalışan instance'a bağlı Elastic IP ücretsizdir; boşta bırakırsanız ücret keser.)

### 10.5 Windows'tan Sunucuya Bağlanma (SSH)

Windows 10/11'de ekstra program kurmanız **gerekmez** — PowerShell gömülü SSH içerir:

1. `.pem` dosyasını güvenli bir klasöre taşıyın, ör: `C:\Users\SIZ\.ssh\gnc-key.pem`
2. **PowerShell** açın ve bağlanın (IP'yi kendi IP'nizle değiştirin):

```powershell
ssh -i "C:\Users\SIZ\.ssh\gnc-key.pem" ubuntu@3.71.123.45
```

3. İlk bağlantıda soruya **yes** yazın. Karşınıza `ubuntu@ip-...:~$` satırı
   çıkarsa **başardınız** — artık sunucudasınız! 🎉

**Sık hata — "UNPROTECTED PRIVATE KEY FILE":** Dosya izni çok açıksa SSH reddeder.
PowerShell'de düzeltin:

```powershell
icacls "C:\Users\SIZ\.ssh\gnc-key.pem" /inheritance:r /grant:r "$env:USERNAME:R"
```

> 💡 İleri seviye kolaylık: MobaXterm (ücretsiz) ile görsel dosya yükleme (SFTP)
> de yapabilirsiniz; ama komut satırı + Bölüm 3.4'teki `scp` komutları yeterli.

### 10.6 İlk 5 Komut — Kopyala-Yapıştır

SSH'ye girdikten sonra sırayla yapıştırın (Ubuntu'yu ilk kez tanıştırıyoruz):

```bash
# 1) Sistemi güncelle
sudo apt update && sudo apt upgrade -y

# 2) Zaman dilimi Türkiye
sudo timedatectl set-timezone Europe/Istanbul

# 3) 1 GB RAM'e swap ekle (build sırasında bellek yetmezliği olmasın)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 4) Node.js 20 LTS kur
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 5) pm2 + nginx kur
sudo npm install -g pm2
sudo apt install -y nginx
node -v && pm2 -v && nginx -v   # sürümleri doğrula
```

### 10.7 Kurulumun Devamı

Sunucu hazır — şimdi **Bölüm 3.4'ten (Kodu Sunucuya Taşıma) itibaren** rehberin
normal akışıyla devam edin:

- 3.4 → Kodu `scp` ile gönderin (komutlar PowerShell'de çalışır)
- 3.5 → `.env` + kurulum + `prisma db push` + `npm run build`
- 3.6 → pm2 ile 7/24 çalıştırma + otomatik başlatma
- 3.7 → nginx + alan adı (alan adınız varsa)
- 3.8 → Let's Encrypt SSL
- 4.5 → Mevcut demo veritabanınızı (`db/custom.db`) taşımak isterseniz

### 10.8 Ücretsiz Sınırlar ve Para Kesmemek İçin Tuzaklar

| Kalem | Ücretsiz limit | Dikkat |
|---|---|---|
| t3.micro / t2.micro | 750 saat/ay (12 ay veya free plan süresi) | Tek instance ile tüm ay ✅ |
| EBS disk (gp3) | 30 GB | 30 GB'ı aşmayın |
| Veri transferi | Ayda 100 GB çıkış (genişlik) | CRM için bolca yeterli |
| Elastic IP | Instance'a bağlıyken ücretsiz | **Boşta bırakmayın** |
| Instance **stop** | — | Durmuş instance EBS diski için ücret işler; ama 7/24 hedeflediğimiz için zaten kapatmayacaksınız |

**Zorunlu güvenlik adımı — faturalama alarmı:**
Billing Console → **Budgets** → **Create budget** → "Zero spend budget" veya
aylık **$5** eşiği + e-posta bildirimi. Böylece her şey ücretsiz sınırdaysa
sizi e-posta uyarır; yanlışlıkla ücretli kayna açarsanız hemen görürsünüz.

**12 ay (veya free plan süresi) bittiğinde:** t3.micro yaklaşık **$7–8/ay**
(boş kullanımda daha az, burst'a göre) olur. O noktada karar sizin: devam ya da
`db/custom.db`'yi yeni sağlayıcıya taşıyın (Bölüm 4.5 — tek dosya yeterli).

### 10.9 AWS Sık Hataları

| Hata | Nedeni | Çözüm |
|---|---|---|
| `Connection timed out` | Security group'ta 22 kapalı / kısıtlı | SG'de SSH 22 → My IP kuralını kontrol edin |
| `Permission denied (publickey)` | Yanlış pem / yanlış kullanıcı | Kullanıcı **ubuntu** (Amazon Linux'taki `ec2-user` değil) |
| Site açılmıyor | Uygulama çalışmıyor / 80 kapalı | `pm2 status` + SG'de HTTP 80 kontrol |
| `npm run build` yarıda ölüyor | 1 GB RAM yetmiyor | 10.6/3. adımdaki **swap**'i kurmadan build'lemeyin |
| Faturada küçük tutarlar | Elastic IP boşta / disk 30 GB üstü / ücretli instance | Billing → aykırı kaynağı bulun; 10.8 alarımını kurun |

---

## 🎯 11. Baştan Sona Özet: AWS + GitHub + gncinc.online (Sizin Senaryonuz)

> Elinizde olanlar: AWS ücretsiz Ubuntu sunucusu (Bölüm 10), GitHub deposu
> `kaancetin3141/gnc-erp`, alan adı **gncinc.online**. Aşağıdaki 10 adımı sırayla yapın —
> her adımın detayı ilgili bölümde hazırdır.

### 🔀 AWS yerine hazır VDS kullanıyorsanız (Hostinger vb.) — ne değişir?

Alan adınız **gncinc.online şu anda bir Hostinger sunucusuna (2.57.91.91) bağlı**.
Hostinger VDS kullanmaya karar verdiyseniz AWS'ye hiç gerek yok; rehberin tamamı
aşağıdaki farklarla aynen geçerlidir:

| Konu | AWS | Hostinger VDS |
|---|---|---|
| Sunucu IP'si | Elastic IP almanız gerekir | VPS IP'si sabittir (2.57.91.91) — hiçbir şey yapmayın |
| DNS | Adım 1'deki A kayıtlarını ekleyin | **ZATEN YAPILMIŞ** — domain zaten bu IP'de ✅ |
| Bağlanma | `ssh -i key.pem ubuntu@IP` | `ssh root@2.57.91.91` + hPanel'de belirlediğiniz şifre |
| Kullanıcı adı | ubuntu | **root** (komutlarda `sudo`ya gerek yok ama zararı yok) |
| Panel | EC2 konsolu | hPanel → VPS → Overview (tarayıcı içi "Browser terminal" de var) |
| Kapasite | 1 GB RAM (ücretsiz) | Planınıza göre (KVM 2 = 8 GB, bol bol yeter) |
| Faturalama alarmı | Şart (Bölüm 10.8) | Sabit aylık ücret — gerek yok |
| Diğer her şey (swap, git clone, build, pm2, nginx, SSL, güncelleme) | Aynı | Aynı |

> ⚠️ Önemli ayrım: hPanel'deki ürününüz **VPS** olmalı. "Web Hosting" (paylaşımlı)
> alırsanız Node.js uygulaması çalışmaz (Bölüm 5'teki kısıtlar geçerli olur).
>
> ✅ **Kısa yol:** Hostinger VDS + bu domain ile → Adım 1'i (DNS) tamamen ATLAYIN,
> Adım 2'den başlayın. SSH komutlarınız `ssh root@2.57.91.91` olacak.

### 🔀 Hiç VDS'iniz yok mu? — 3 yol

Domain `gncinc.online` Hostinger'da kayıtlı. Sunucunuz (VDS/VPS) henüz yoksa:

| Yol | Maliyet | Kolaylık | Not |
|---|---|---|---|
| **A) Hostinger VPS almak** ✅ Önerilen | ~$5–7/ay (KVM 1 yeter) | ⭐⭐⭐ En kolay | Domain aynı panelde → bağlamak 2 tık; RAM bol (4 GB'lar); tarayıcı içi terminal bile var |
| B) AWS Free Tier (Bölüm 10) | 12 ay 0 ₺ | ⭐⭐ | 1 GB RAM; "Free tier eligible" etiket şart; faturalama alarmı şart |
| C) Kendi PC + Cloudflare Tunnel (Bölüm 9) | 0 ₺ | ⭐⭐ | PC 7/24 açık kalmalı; elektrik/internet kesintisi = site kapalı |

> ❌ Hostinger'daki **"Web Hosting"** (paylaşımlı hosting) ürünü bu işe YARAMAZ —
> Node.js/Next.js çalıştırmaz. **VPS** ürünü gerekir.

**Sunucuyu alınca domaini ona bağlamak (Hostinger hPanel, tık tık):**

1. Yeni sunucunuzun IP'sini not edin (Hostinger: hPanel → VPS → Overview → IP Address;
   AWS: Elastic IP)
2. hPanel → **Domainler** → `gncinc.online` → **DNS / Ad Sunucuları** → **DNS Kayıtları**
3. Listede mevcut **A** kayıtlarını bulun (şu an `2.57.91.91` görünenler) → kalem/düzenle →
   **değeri yeni sunucu IP'siyle değiştirin**:
   - A · `@` · YENİ-IP
   - A · `www` · YENİ-IP
   (A kaydı hiç yoksa: **Kayıt Ekle** → Tür A · Ad `@` · İşaret edilen: YENİ-IP)
4. **Kaydet** → 5 dakika–2 saat içinde yayılır
5. PowerShell'de doğrulayın: `ping gncinc.online` → yeni IP görünmeli
6. Sonra rehber Bölüm 2'den (sunucu hazırlığı) itibaren devam edin

### 🔀 Hızlı Yol: TEK KOMUTLUK KURULUM SCRIPTI (deploy/kurulum.sh) — v2.0

Adım 2–9'un tamamını **artı ana siteyi ve alt alan adlarını** tek seferde yapan resmi
kurulum scripti projede hazır: **`deploy/kurulum.sh`** — şunları otomatik yapar:
sistem güncelleme, saat dilimi, 2 GB swap, Node 20, pm2, nginx, GitHub'dan kod,
`.env`, prisma, build, 7/24 çalıştırma, güvenlik duvarı, başlangıç + gerçekçi demo
verisi, `guncelle-gnc.sh` ve **gncinc.online ana portfolyo sitesi + subdomain ayarları**.

> ⚠️ **Eski script çalıştıysa ve "Repository not found" hatası verdiyse:** sunucudaki
> script eski Neuse0 adresini kullanıyordur. Aşağıdaki YENİ komutu kullanın — script
> artık remote adresini otomatik düzeltir. En temizi: `sudo rm -rf /var/www/gnc-erp`
> deyip script'i token'lı adrese yeniden çalıştırın.

Kullanımı — SSH ile sunucuya girdikten sonra (repo PRIVATE olduğu için TOKEN şart):

```bash
# 1) Scripti indir (private repo — token ile):
curl -fsSL -H "Authorization: token BURAYA_TOKEN" https://raw.githubusercontent.com/kaancetin3141/gnc-erp/main/deploy/kurulum.sh -o kurulum.sh

# 2) Çalıştır — 2. parametre TOKEN'LI repo adresi OLMALI (yoksa şifre sorar/bozulur):
sudo bash kurulum.sh gncinc.online "https://kaancetin3141:BURAYA_TOKEN@github.com/kaancetin3141/gnc-erp.git"

# (Alternatif: sohbetten gelen script bloğunu yapıştırıp aynı parametrelerle çalıştırın)
```

> 💡 Script artık **şifre ASLA sormaz** (`GIT_TERMINAL_PROMPT=0`) — token'lı adres
> vermezseniz uyarıyla durur, donmaz.

Script bitince ekranda sunucunuzun IP'si, site adresleriniz ve kalan 2 küçük adım
(DNS + SSL) yazacaktır. Mimarinin tamamı için **Bölüm 13**'e bakın.

### Adım 1 — Alan adını sunucuya bağlayın (DNS) — ÖNCE BUNU YAPIN

DNS yayılması saatler sürebildiği için en baştan başlayın:

1. AWS EC2 → **Elastic IPs** → **Allocate Elastic IP address** → Allocate
2. IP'yi seçin → **Actions → Associate Elastic IP address** → instance'ınızı seçin → Associate
   (artık IP stop/start'ta değişmez — DNS bozulmaz)
3. **Alan adını aldığınız panelde** (isimtescil, Turhost, GoDaddy, namecheap vb.)
   DNS yönetimine şu 2 kaydı ekleyin:

| Tür | Ad (Host) | Değer | TTL |
|---|---|---|---|
| A | `@` | Elastic-IP'niz (ör. 3.71.123.45) | 3600 |
| A | `www` | Aynı IP | 3600 |

> 🔍 Kontrol: PowerShell'de `ping gncinc.online` → sizin IP'yi göstermeli (yayılma
> 5 dakika–2 saat). Beklerken sunucu tarafını kurabilirsiniz.

### Adım 2 — Sunucu temel kurulumu

Bölüm 10.5 ile SSH bağlanın → Bölüm 10.6'nın 5 komutu (güncelleme → saat dilimi →
**swap** → Node 20 → pm2 + nginx). Swap'i atlarsanız build "Killed" ile ölür!

### Adım 3 — Kodu GitHub'dan çekin

Bölüm 3.4 Yol A:

```bash
cd /var/www
git clone https://github.com/kaancetin3141/gnc-erp.git    # private ise PAT'li yöntem
cd gnc-erp
```

### Adım 4 — Kurulum + derleme

Bölüm 3.5'in komutları (klasör yolu `/var/www/gnc-erp` olacak):

```bash
cd /var/www/gnc-erp
cat > .env << 'EOF'
DATABASE_URL=file:/var/www/gnc-erp/db/custom.db
NODE_ENV=production
EOF
chmod 600 .env
mkdir -p db
npm install
npx prisma generate && npx prisma db push
npm run build        # 2-5 dk; swap şart
```

### Adım 5 — Veritabanı kararı

- **Boş başla:** hiçbir şey yapmayın — `db push` boş veritabanı oluşturdu; uygulama
  ilk açılışta kurulum/yönetici oluşturma akışını sunar.
- **Bu ortamdaki gerçekçi verilerle başla:** demo sunucusundan `db/custom.db`'yi
  PowerShell'den şöyle taşıyın (Bölüm 4.5):

```powershell
scp -i "C:\Users\SIZ\.ssh\gnc-key.pem" db\custom.db ubuntu@IP:/var/www/gnc-erp/db/custom.db
```

> Taşıdıysanız `pm2 start`'tan ÖNCE yetkiyi düzeltin: `sudo chown ubuntu:ubuntu /var/www/gnc-erp/db/custom.db`

### Adım 6 — pm2 ile 7/24 çalıştırma

Bölüm 3.6:

```bash
cd /var/www/gnc-erp
pm2 start .next/standalone/server.js --name gnc-crm \
  --env NODE_ENV=production --env PORT=3000
pm2 save && pm2 startup   # çıkan komutu da çalıştırın
curl http://localhost:3000   # HTML dönmeli ✅
```

### Adım 7 — nginx'e gncinc.online'u tanıtın

Bölüm 3.7'deki yapılandırmayı aynen kullanın, sadece satır şöyle olsun:

```nginx
server_name gncinc.online www.gncinc.online;
```

### Adım 8 — Ücretsiz SSL (Let's Encrypt)

Bölüm 3.8:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d gncinc.online -d www.gncinc.online
```

> ⚠️ Bu adım DNS'in yayılmış olmasını ister — Adım 1 beklenmediyse "no A record" hatası
> alırsınız; 30 dk bekleyip tekrar deneyin.

### Adım 9 — Güvenlik duvarı + faturalama alarmı

Bölüm 3.9 (`ufw allow OpenSSH; ufw allow 'Nginx Full'; ufw enable`) +
Bölüm 10.8'deki **$5 Budget alarmı** (AWS Billing → Budgets).

### Adım 10 — Test ve bundan sonrası

- Tarayıcıda **https://gncinc.online** → CRM açılmalı 🎉
- **Güncelleme yapmak:** projede değişiklik → GitHub'a push → sunucuda Bölüm 7:

```bash
cd /var/www/gnc-erp && git pull
npm install && npx prisma db push && npm run build
pm2 restart gnc-crm
```

- **Yedekleme:** Bölüm 4.4 — `db/custom.db`'yi düzenli indirin (cron/machine task).

---

## 🎮 12. Tek Sunucuda Birden Fazla Uygulama (gnc-erp + meyvepatlat + ...)

> Amaç: aynı VDS'de birden fazla uygulama çalıştırmak. Örnek: CRM + "Meyve Patlat".
> **Önce yöntem seçimi:** İki yol var, biri açık ara önerilir:

| Yöntem | Adres örneği | Kod değişikliği | Öneri |
|---|---|---|---|
| **A) Alt alan adı (subdomain)** | `meyvepatlat.gncinc.online` | **YOK** — her app kök dizinde yaşar | ✅ **ÖNERİLEN** |
| B) Klasör (path) | `gncinc.online/meyvepatlat` | **Gerekir** (bkz. 12.3) | ⚠️ Sıkıntılı |

### 12.1 Yöntem A — Alt Alan Adı (ÖNERİLEN, ~15 dakika)

Her uygulama kendi portu ve kendi alt alan adıyla yaşar, birbirine hiç karışmaz:

```
gncinc.online              → CRM          (port 3000)
meyvepatlat.gncinc.online  → Meyve Patlat (port 3001)
baskeapp.gncinc.online     → ...          (port 3002)
```

**Adım 1 — DNS:** Domain panelinize (Adım 11.1'deki gibi) bir A kaydı daha ekleyin:

| Tür | Ad | Değer |
|---|---|---|
| A | `meyvepatlat` | Aynı Elastic IP |

**Adım 2 — Uygulamayı sunucuya yükleyin** (3.4'teki gibi clone, 3.5'teki gibi kur):

```bash
cd /var/www
git clone https://github.com/Neuse0/meyvepatlat.git   # kendi repo adresiniz
cd meyvepatlat
# .env oluşturun (uygulamaya göre), sonra:
npm install
npx prisma generate && npx prisma db push   # veritabanı kullanıyorsa
npm run build
```

**Adım 3 — Farklı portta pm2 ile başlatın:**

```bash
pm2 start .next/standalone/server.js --name meyvepatlat \
  --env NODE_ENV=production --env PORT=3001
pm2 save
curl http://localhost:3001   # HTML dönmeli ✅
```

**Adım 4 — nginx'e yeni site tanıtın:**

```bash
sudo nano /etc/nginx/sites-available/meyvepatlat
```

İçeriği (CRM'in config'inden tek farkı `server_name` ve `port 3001`):

```nginx
server {
    listen 80;
    server_name meyvepatlat.gncinc.online;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/meyvepatlat /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**Adım 5 — SSL:**

```bash
certbot --nginx -d meyvepatlat.gncinc.online
```

✅ Bitti: `https://meyvepatlat.gncinc.online` yayında. CRM'e hiçbir şey olmadı.

> 💡 **Her yeni uygulama = bu 5 adımın tekrarı** (yeni port: 3002, 3003...).
> Uygulama Next.js değilse (PHP, Python vb.) kurulum/port değişir ama nginx server bloğu aynı mantıktır.

### 12.2 Neden "Klasör Yöntemi" Tavsiye Etmiyorum? (Dürüst Açıklama)

`gncinc.online/meyvepatlat` gibi klasörlü adresler **teknik olarak mümkündür**, ancak
Next.js uygulamalarında her uygulamada şu değişiklikleri şart kılar:

1. `next.config.ts` içine `basePath: '/meyvepatlat'` eklemek (uygulama artık SADECE bu
   klasör altında çalışır)
2. Kod içindeki **bütün `fetch('/api/...')` çağrılarını** `/meyvepatlat/api/...`'a
   uyarlamak — Next.js bunları otomatik çevirmez!
3. Elle yazılmış `<img src="/logo.png">` gibi yolları da uyarlamak

GNC CRM gibi yüzlerce API çağrısı olan bir uygulamada bu, hataya çok açık bir
kod değişikliği demektir. Alt alan adında ise **hiçbir koda dokunulmaz**. Bu yüzden
klasörlü adres yerine `meyvepatlat.gncinc.online` kullanın — profesyonel görüntü de aynıdır.

### 12.3 Israr Ediyorum, Klasörlü İstiyorum (Kısa Tarif)

- Uygulamayı `basePath: '/meyvepatlat'` ile build edin (next.config.ts + tüm API
  çağrılarını düzeltin — kod işi, riskli)
- nginx'te ayrı `location /meyvepatlat/ { proxy_pass http://127.0.0.1:3001; }` bloğu
  ekleyin
- Yine de CSS/JS varsa kırılabilir; her build sonrası test edin

### 12.4 Kapasite Gerçeği (1 GB RAM AWS Free Tier)

- Çalışan her Next.js uygulaması ~100–150 MB RAM kullanır → **1 GB + 2 GB swap ile
  2–3 küçük/orta uygulama rahat çalışır**
- **Build'leri ASLA aynı anda çalıştırmayın** — sırayla yapın (build en çok RAM yiyen iştir)
- Aylık 100 GB ücretsiz trafik limitini birden fazla uygulama paylaşır (2-3 app için bol)
- 4+ uygulamaya çıkarsanız veya yavaşlama hissederseniz: 2 GB'lık ücretli instance'a
  geçme zamanı (aylık ~$12)

---

## 🌍 13. Ana Site + Alt Alan Adları Mimarisi (v2)

Artık tek bir CRM sitesi değil, **bir portfolyo + yanında projeler** mimarisi var:

```
gncinc.online  (ANA SİTE — portfolyo, "Projeler" bölümü)
│
├── crm.gncinc.online          → GNC ERP & CRM  (port 3000)
├── meyvepatlat.gncinc.online  → Meyve Patlat oyunu (port 3001, ileride)
└── (gelecek projeler)         → her yeni proje yeni bir alt alan adı
```

- **Ana site** statik bir HTML sayfasıdır (`ana-site/index.html`) — nginx direkt
  sunar, RAM harcamaz, saniyeler içinde açılır. Üzerinde: hero, **Projeler**
  bölümü (kartlar canlı adreslere linkedir), Hizmetler ve İletişim bölümleri var.
- **CRM** `crm.gncinc.online` alt alan adında aynen çalışır — koda dokunulmaz.
- **Yeni proje eklemek** 3 adım: (1) kodu sunucuda boş bir porta koyun,
  (2) nginx'e bir `server { server_name yeniproje.gncinc.online; ... }` bloğu ekleyin,
  (3) `ana-site/index.html`'e bir proje kartı ekleyip `guncelle-gnc.sh` çalıştırın.

### 13.1 DNS — Hostinger paneline girilecek 3 kayıt

| Tür | Ad (Host) | Değer | Ne işe yarar |
|---|---|---|---|
| A | `@` | Elastic-IP | ana site: gncinc.online |
| CNAME | `www` | `gncinc.online` | www.yönlendirmesi |
| **A** | **`*` (yıldız)** | **Elastic-IP** | **TÜM alt alan adları otomatik: crm. / meyvepatlat. / ileridekiler** |

> ⭐ Yıldız (wildcard) kaydı sayesinde **yarın yeni bir proje daha eksenini
> düşünmenize gerek kalmaz** — `oyun2.gncinc.online` gibi her adres zaten çözülür.
> İstemezseniz her alt alan adı için ayrı `A · crm · IP`, `A · meyvepatlat · IP`
> kayıtları da ekleyebilirsiniz.

### 13.2 SSL — tüm adresler için TEK komut

DNS kayıtları yayıldıktan sonra (ping ile kontrol edin):

```bash
sudo certbot --nginx -d gncinc.online -d www.gncinc.online -d crm.gncinc.online -d meyvepatlat.gncinc.online
```

Sonrasında **dört adres de** `https://` ile çalışır ve sertifikalar otomatik yenilenir.

### 13.3 Ana site içeriğini değiştirmek

`ana-site/index.html` tek dosyadır — herhangi bir editörle açıp düzenleyin:

- E-posta adresi: `info@gncinc.online` yazan yeri kendi adresinizle değiştirin
- Yeni proje kartı: `<!-- MEYVE PATLAT -->` bloğunun kopyasını alıp metinlerini değiştirin
- Renkler: dosyanın başındaki `:root { --em: ... }` değişkenlerinden yönetilir

Değişiklik repoya push edilip sunucuda `guncelle-gnc.sh` çalışınca ana site de
otomatik güncellenir.

### 13.4 Sunucuda elle kontrol

```bash
# Ana site testi (DNS beklemeden):
curl -H "Host: gncinc.online" http://localhost/
# CRM testi:
curl -H "Host: crm.gncinc.online" http://localhost/ -o /dev/null -w "%{http_code}\n"
# nginx config doğrulama:
sudo nginx -t
```

---

*Bu rehber GNC CRM v1.0 (Next.js 16 + Prisma 6 + SQLite) için hazırlanmıştır. Sorularınız için
proje dokümantasyonuna ve `worklog.md` geçmişine bakabilirsiniz.*
