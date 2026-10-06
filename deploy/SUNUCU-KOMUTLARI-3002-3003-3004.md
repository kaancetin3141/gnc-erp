# SUNUCU KURULUM KOMUTLARI — Port 3002 / 3003 / 3004 + Alt Alan Adları

> Sunucun: nginx + pm2 + certbot (kurulum.sh v2.3 ile kurulmuş).
> Aşağıdaki komutların hepsi `ubuntu` kullanıcısıyla, sunucuda SSH oturumunda çalıştırılır.
> Sırayla uygula; her bölümün sonunda test komutu var.

---

## 0) Alt alan adı mı, yol mu? (kısa karar rehberi)

| Yöntem | Örnek | Artı | Eksi |
|---|---|---|---|
| **Alt alan adı (ÖNERİLEN)** | `sik-kuafor.gncinc.online` | Temiz URL, her işletme bağımsız görünür, tarayıcıda ikon/logo ayrı, müşteri sayfası Host başlığından işletmeyi otomatik bulur | DNS'de `*.gncinc.online` kaydı + SSL için wildcard/ek sertifika gerekir |
| Yol (path) | `gncinc.online/sik-kuafor` | Tek sertifika, DNS değişikliği yok | Her işletme "alt dizin" gibi görünür, cache/çerez karmaşası, ileride taşınması zor |

**Karar: alt alan adı kullan.** CRM'in Alan Adları paneli zaten `{slug}.gncinc.online` şemasını üretiyor;
müşteri sayfası (port 3002) `BASE_DOMAIN=gncinc.online` ile Host başlığından `sik-kuafor` kısmını okuyup
o işletmenin sayfasını gösteriyor. Yapman gereken tek şey: **DNS'de wildcard kaydı + nginx'te tek catch-all bloğu** (aşağıda).

---

## 1) DNS kayıtları (Hosting/Cloudflare panelinde)

```
A    @            → SUNUCU_IP     (zaten var — ana site)
A    crm          → SUNUCU_IP     (zaten var — CRM :3000)
A    meyvepatlat  → SUNUCU_IP     (zaten var — oyun)
A    *            → SUNUCU_IP     ← YENİ: tüm alt alan adlarını (sik-kuafor, kaloriai, randevu…) aynı IP'ye taşır
```

> Cloudflare kullanıyorsan wildcard A kaydı "Proxied" olabilir; SSL modu **Full** olsun.
> Cloudflare'de wildcard SSL'i ücretsiz olarak Cloudflare kenarında çözülür (origin'e Flexible/Full gider).

Test: `dig +short sik-kuafor.gncinc.online` → SUNUCU_IP dönmeli.

---

## 2) customer-page → port 3002 (randevu müşteri sitesi)

### 2a) Kodu sunucuya al
```bash
cd /var/www                      # veya uygulamaları tuttuğun klasör
# CRM deposundan:
sudo git clone https://github.com/kaancetin3141/gnc-erp.git gnc-erp-src 2>/dev/null || true
sudo cp -r gnc-erp-src/mini-services/customer-page /var/www/customer-page
sudo chown -R ubuntu:ubuntu /var/www/customer-page
```

### 2b) bun kur (customer-page Bun ile çalışır)
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### 2c) pm2 ile 7/24 başlat (port 3002 sabit)
```bash
cd /var/www/customer-page
pm2 delete gnc-customer-page >/dev/null 2>&1 || true
BASE_DOMAIN=gncinc.online pm2 start bun --name gnc-customer-page -- run index.ts
pm2 save
```
> `BASE_DOMAIN=gncinc.online` ZORUNLU — alt alan adı modunu açar.
> Test: `curl http://localhost:3002/healthz` → `{"ok":true,...}`

### 2d) nginx: randevu + tüm işletme alt alan adları → 3002
`sudo nano /etc/nginx/sites-available/randevu` oluştur:
```nginx
# randevu.gncinc.online → müşteri ana sayfası
server {
    listen 80;
    server_name randevu.gncinc.online;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# TÜM işletmeler: sik-kuafor.gncinc.online, diger-berber.gncinc.online ... → 3002
server {
    listen 80;
    server_name ~^(?<bizslug>[a-z0-9-]+)\.gncinc\.online$;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;              # ÖNEMLİ: slug buradan okunur
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Aktifleştir + SSL:
```bash
sudo ln -sf /etc/nginx/sites-available/randevu /etc/nginx/sites-enabled/randevu
sudo nginx -t && sudo systemctl reload nginx
# SSL (randevu ana sayfası için):
sudo certbot --nginx -d randevu.gncinc.online
# İşletme alt alan adları için wildcard SSL (Cloudflare DNS ise):
sudo apt-get install -y python3-certbot-dns-cloudflare
sudo certbot certonly --dns-cloudflare -d "*.gncinc.online" -d gncinc.online
# Cloudflare yoksa her işletme için: sudo certbot --nginx -d sik-kuafor.gncinc.online
```

> CRM'in **Admin Paneli → Alan Adları** sekmesinde her işletmenin slug'ı görünür;
> oradan slug düzenleyebilir, koordinat ekleyebilirsin (harita için gerekli).

---

## 3) Fruit Storm → port 3001'den 3003'e taşıma

```bash
# 3a) oyunun .env/portunu değiştir (oyun /var/www/... veya nerede ise)
#     oyun-deploy.sh kullanıyorsan: PORT değerini .env içinde değiştir:
sudo grep -rn "3001" /var/www/*oyun*/.env 2>/dev/null   # konumu bul
# bulduysan:
sudo sed -i 's/^PORT=3001/PORT=3003/' /var/www/*oyun*/.env   # yol örnektir

# 3b) pm2'de yeniden başlat (isim örnektir: pm2 list ile gör)
pm2 list
pm2 delete meyvepatlat 2>/dev/null || pm2 delete gnc-oyun 2>/dev/null || true
cd /var/www/*oyun*    # oyun klasörüne gir
PORT=3003 pm2 start npm --name meyvepatlat -- run start   # veya oyunun mevcut start komutu
pm2 save

# 3c) nginx portu güncelle
sudo sed -i 's/127.0.0.1:3001/127.0.0.1:3003/g' /etc/nginx/sites-available/*
sudo nginx -t && sudo systemctl reload nginx

# 3d) test
curl -I http://localhost:3003 | head -1      # 200/30x dönmeli
curl -I https://meyvepatlat.gncinc.online | head -1
```

---

## 4) KaloriAI → port 3004 (GitHub'dan yeni kurulum)

> ⚠️ **KRİTİK:** KaloriAI **kendi veritabanını** kullanır. CRM'in `DATABASE_URL`'ini ASLA verme —
> iki uygulama aynı SQLite dosyasına yazarsa şemalar birbirini EZER (başımıza geldi!).

```bash
# 4a) kod
cd /var/www
sudo git clone https://github.com/kaancetin3141/KaloriAI.git kaloriai
sudo chown -R ubuntu:ubuntu /var/www/kaloriai
cd /var/www/kaloriai

# 4b) bağımlılıklar
npm install

# 4c) .env — KENDİ DB'si ve KENDİ portu
cat > .env << 'EOF'
DATABASE_URL="file:/var/www/kaloriai/prisma/data.db"
PORT=3004
APP_URL=http://localhost:3000
EOF
# (gerekirse GitHub repo'daki .env.example içeriğine göre tamamla)

# 4d) prisma + derleme
npx prisma db push
NODE_OPTIONS="--max-old-space-size=1536" npm run build

# 4e) pm2 7/24
pm2 delete kaloriai >/dev/null 2>&1 || true
PORT=3004 pm2 start npm --name kaloriai -- run start
pm2 save
curl -I http://localhost:3004 | head -1
```

Alt alan adı: `/etc/nginx/sites-available/kaloriai`:
```nginx
server {
    listen 80;
    server_name kaloriai.gncinc.online;
    location / {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -sf /etc/nginx/sites-available/kaloriai /etc/nginx/sites-enabled/kaloriai
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kaloriai.gncinc.online
```

---

## 5) Sunucu yeniden başlasın da her şey ayakta kalsın

```bash
pm2 save
pm2 startup          # çıktıdaki komutu kopyala+çalıştır (sudo env ... olur)
sudo systemctl enable nginx
```

## 6) Hızlı sağlık kontrolü (hepsi 200/30x dönmeli)

```bash
for p in 3000 3002 3003 3004; do printf "port %s → " $p; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$p/; done
pm2 list
sudo nginx -t
```

## 7) Sık hatalar

| Belirti | Sebep | Çözüm |
|---|---|---|
| Alt alan adı "Welcome to nginx" gösteriyor | catch-all server bloğu yok/etkin değil | Bölüm 2d'yi kontrol et, `nginx -t`, reload |
| İşletme sayfası 404 | `proxy_set_header Host $host;` eksik | nginx bloğunda Host satırı olmalı |
| 502 Bad Gateway | pm2 süreci ölü / port farklı | `pm2 list`, `pm2 logs gnc-customer-page` |
| Wildcard SSL hatası | DNS-01 doğrulaması gerekli | Cloudflare plugin (Bölüm 2d) veya her sub için ayrı certbot |
| KaloriAI şema hatası veriyor | CRM DB'sini paylaşmış | .env DATABASE_URL KaloriAI'ye özel olmalı |

---

### Özet şema

```
gncinc.online          → ana site (statik, /var/www/gncinc-ana)
crm.gncinc.online      → CRM            :3000 (pm2: gnc-crm)
randevu.gncinc.online  → müşteri sitesi :3002 (pm2: gnc-customer-page, bun)
{slug}.gncinc.online   → müşteri sitesi :3002 (aynı servis, Host'tan işletme)
meyvepatlat.gncinc.online → Fruit Storm :3003
kaloriai.gncinc.online → KaloriAI       :3004 (pm2: kaloriai)
```
