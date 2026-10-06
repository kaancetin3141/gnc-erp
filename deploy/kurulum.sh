#!/bin/bash
# ============================================================
#  GNC — TEK KOMUT KURULUM (v3.0 — tüm uygulamalar otomatik)
#
#  Ne kurar (hepsi GitHub'dan OTOMATİK indirilir):
#   Sistem   : güncelleme + swap + Node 20 + pm2 + Bun + nginx + certbot + ufw
#   Ana site : gncinc.online            (statik portfolyo, Müşteri Randevu + KaloriAI kartlı)
#   CRM      : crm.gncinc.online        -> port 3000  (repo: kaancetin3141/gnc-erp)
#   Randevu  : randevu.gncinc.online    -> port 3002  (aynı repoda mini-services/customer-page)
#              + HER işletme için {slug}.gncinc.online (sik-kuafor.gncinc.online gibi)
#   FruitStorm: fruitstorm.gncinc.online -> port 3003  (repo: kaancetin3141/fruit-storm)
#   KaloriAI : kaloriai.gncinc.online   -> port 3004  (repo: kaancetin3141/KaloriAI, AYRI veritabanı!)
#
#  Kullanım :  bash kurulum.sh [domain] [tokenli-repo-adresi]
#  Örnek    :  bash kurulum.sh gncinc.online "https://kaancetin3141:ghp_XXXX@github.com/kaancetin3141/gnc-erp.git"
#  NOT: Private repo için 2. parametre ŞART (token'li adres).
#  Tekrar çalıştırılabilir (idempotent) — güncelleme olarak da çalışır.
# ============================================================
set -e

DOMAIN="${1:-gncinc.online}"
REPO="${2:-https://github.com/kaancetin3141/gnc-erp.git}"
APP_DIR="/var/www/gnc-erp"
ANA_DIR="/var/www/gncinc-ana"
APP_PORT="3000"
RANDEVU_PORT="3002"
OYUN_PORT="3003"        # Fruit Storm (eski 3001'den buraya taşınır)
KALORIAI_PORT="3004"
FRUITSTORM_REPO="https://github.com/kaancetin3141/fruit-storm.git"
KALORIAI_REPO="https://github.com/kaancetin3141/KaloriAI.git"
DOMAIN_RX="$(echo "$DOMAIN" | sed 's/\./\\./g')"

# Git ASLA şifre sormasın (script kilitlenmesin)
export GIT_TERMINAL_PROMPT=0

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1;36m'; N='\033[0m'
step(){ echo -e "\n${G}==>${N} $1"; }
info(){ echo -e "${B}   $1${N}"; }
warn(){ echo -e "${Y}! UYARI:${N} $1"; }
die(){ echo -e "${R}HATA: $1${N}"; exit 1; }

# ---- 0) Yetki ve parametre kontrolü ----
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi
if [ "$(id -u)" -ne 0 ] && [ "$(whoami)" != "ubuntu" ]; then
  warn "root veya ubuntu kullanıcısı bekleniyordu — $(whoami) olarak devam ediliyor"
fi
step "0/12 Kontrol — domain: $DOMAIN | repo: $REPO"

# ---- 1) Sistem güncelleme + temel paketler ----
step "1/12 Sistem güncelleniyor (2-5 dk)..."
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -y
$SUDO apt-get upgrade -y
$SUDO apt-get install -y git curl nginx certbot python3-certbot-nginx ufw
$SUDO timedatectl set-timezone Europe/Istanbul 2>/dev/null || true

# ---- 2) Swap (1 GB RAM için şart) ----
step "2/12 Swap (2 GB)..."
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  $SUDO fallocate -l 2G /swapfile
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile
  $SUDO swapon /swapfile
  echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  info "2 GB swap eklendi"
else
  info "Swap zaten var"
fi

# ---- 3) Node 20 + pm2 ----
step "3/12 Node.js 20 + pm2..."
if command -v node >/dev/null 2>&1 && node -v | grep -qE '^v(20|22)\.'; then
  info "Node zaten kurulu: $(node -v)"
else
  if [ "$(id -u)" -eq 0 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  fi
  $SUDO apt-get install -y nodejs
fi
$SUDO npm install -g pm2@latest
info "node $(node -v) | pm2 $(pm2 -v)"

# ---- 3b) Bun (customer-page çalışma zamanı) ----
step "3b/12 Bun..."
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || warn "Bun kurulamadı — customer-page atlanacak"
fi
export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
  $SUDO ln -sf "$BUN_BIN" /usr/local/bin/bun 2>/dev/null || true
  info "bun $(bun --version) hazır"
else
  BUN_BIN=""
  warn "Bun yok — Müşteri Randevu Sitesi bu turda kurulamayacak"
fi

# ---- 4) CRM kodunu GitHub'dan al ----
step "4/12 CRM kodu GitHub'dan alınıyor..."
# Sahiplik düzeltmesi — root'a ait .git ubuntu'nun güncellemesini bloklamasın
if [ -d "$APP_DIR" ] && { [ ! -w "$APP_DIR" ] || [ ! -w "$APP_DIR/.git" ]; }; then
  info "Klasör sahipliği düzeltiliyor: sudo chown -R $(whoami) $APP_DIR"
  $SUDO chown -R "$(whoami)" "$APP_DIR" || true
fi
if [ -d "$ANA_DIR" ] && [ ! -w "$ANA_DIR" ]; then
  $SUDO chown -R "$(whoami)" "$ANA_DIR" || true
fi
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git remote set-url origin "$REPO" 2>/dev/null || true
  git pull --ff-only || warn "git pull başarısız — mevcut kodla devam ediliyor"
else
  $SUDO mkdir -p /var/www
  $SUDO chown "$(whoami)" /var/www
  git clone "$REPO" "$APP_DIR" || die "Repo klonlanamadı: $REPO\n     Private repo için 2. parametreye TOKEN'li adres verin:\n     bash kurulum.sh $DOMAIN \"https://kaancetin3141:TOKEN@github.com/kaancetin3141/gnc-erp.git\""
  cd "$APP_DIR"
fi
[ -f package.json ] || die "$APP_DIR içinde proje kodu yok (package.json bulunamadı) — repo adresini kontrol edin"

# ---- 5) .env + veritabanı klasörü ----
step "5/12 Ortam dosyası (.env)..."
if [ ! -f .env ]; then
  cat > .env << ENVEOF
DATABASE_URL=file:$APP_DIR/db/custom.db
NODE_ENV=production
ENVEOF
  chmod 600 .env
  info ".env oluşturuldu"
else
  info ".env zaten var — korunuyor"
fi
mkdir -p db

# ---- 6-8) Bağımlılıklar + şema + derleme ----
step "6/12 npm install (birkaç dk)..."
npm install
step "7/12 Veritabanı şeması..."
npx prisma generate
npx prisma db push
step "8/12 Derleme: npm run build (2-5 dk, swap sayesinde güvenli)..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build

# ---- 9) CRM pm2 ----
step "9/12 CRM pm2 ile başlatılıyor..."
pm2 delete gnc-crm >/dev/null 2>&1 || true
if [ -f ".next/standalone/server.js" ]; then
  NODE_ENV=production PORT=$APP_PORT pm2 start .next/standalone/server.js --name gnc-crm --time
else
  warn "standalone server.js bulunamadı — 'npm start' ile başlatılıyor"
  NODE_ENV=production PORT=$APP_PORT pm2 start npm --name gnc-crm -- start
fi
pm2 save
if [ "$(id -u)" -eq 0 ]; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
else
  $SUDO env PATH=$PATH:/usr/bin pm2 startup systemd -u "$(whoami)" \
    --hp "$(getent passwd "$(whoami)" | cut -d: -f6)" >/dev/null 2>&1 || true
fi
info "Sunucu yeniden başlarsa uygulama otomatik açılır (pm2)"

# ---- 9b) Müşteri Randevu Sitesi pm2 (port 3002) ----
step "9b/12 Müşteri Randevu Sitesi (port $RANDEVU_PORT)..."
CP_DIR="$APP_DIR/mini-services/customer-page"
if [ -f "$CP_DIR/index.ts" ] && [ -n "$BUN_BIN" ]; then
  pm2 delete gnc-customer-page >/dev/null 2>&1 || true
  ( cd "$CP_DIR" && BASE_DOMAIN="$DOMAIN" NODE_ENV=production \
      pm2 start "$BUN_BIN" --name gnc-customer-page --time -- run index.ts )
  pm2 save
  info "randevu sitesi: http://127.0.0.1:$RANDEVU_PORT (BASE_DOMAIN=$DOMAIN — işletme alt alan adları açık)"
else
  warn "customer-page kodu veya Bun bulunamadı — atlandı"
fi

# ---- 10) ANA SİTE + nginx (tüm alt alan adları) ----
step "10/12 Ana site (portfolyo) + nginx kuruluyor..."
$SUDO mkdir -p "$ANA_DIR"
if [ -d "$APP_DIR/ana-site" ]; then
  $SUDO cp -r "$APP_DIR"/ana-site/. "$ANA_DIR/"
  info "Ana site dosyaları kopyalandı -> $ANA_DIR (Randevu + KaloriAI kartlı)"
else
  warn "ana-site klasörü repoda yok — ana site boş olacak (repo güncel mi?)"
fi

# Eski elle yapılmış parça conf'lar temizlenir (v3 hepsini tek dosyada birleştirir)
$SUDO rm -f /etc/nginx/sites-available/randevu /etc/nginx/sites-enabled/randevu
$SUDO rm -f /etc/nginx/sites-available/kaloriai /etc/nginx/sites-enabled/kaloriai

cat > /tmp/gnc.nginx << 'NGINXEOF'
# ============ ANA SİTE — gncinc.online + www (statik portfolyo) ============
server {
    listen 80;
    server_name __DOMAIN__ __WWW__;

    root __ANA_DIR__;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}

# ============ GNC CRM — crm.__DOMAIN__ (port __APPPORT__) ============
server {
    listen 80;
    server_name crm.__DOMAIN__;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:__APPPORT__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ============ RANDEVU ANA SAYFA — randevu.__DOMAIN__ (port __CPPORT__) ============
server {
    listen 80;
    server_name randevu.__DOMAIN__;

    location / {
        proxy_pass http://127.0.0.1:__CPPORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ============ HER İŞLETME — {slug}.__DOMAIN__ (örn. sik-kuafor) → randevu ============
# Not: nginx TAM eşleşen server_name'leri (crm/randevu/fruitstorm/kaloriai) önce alır;
# bu regex bloğu yalnızca diğer tüm alt alan adlarını yakalar. Host başlığı
# customer-page tarafından okunur → işletme otomatik bulunur.
server {
    listen 80;
    server_name ~^([a-z0-9-]+)\.__DOMAINRX__$;

    location / {
        proxy_pass http://127.0.0.1:__CPPORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ============ FRUIT STORM — fruitstorm + meyvepatlat (port __OYUNPORT__) ============
server {
    listen 80;
    server_name fruitstorm.__DOMAIN__ meyvepatlat.__DOMAIN__;

    location / {
        proxy_pass http://127.0.0.1:__OYUNPORT__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ============ KALORIAI — kaloriai.__DOMAIN__ (port __KALPORT__) ============
server {
    listen 80;
    server_name kaloriai.__DOMAIN__;

    location / {
        proxy_pass http://127.0.0.1:__KALPORT__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF
sed -i "s/__DOMAINRX__/$DOMAIN_RX/g; s/__DOMAIN__/$DOMAIN/g; s/__WWW__/www.$DOMAIN/g; s/__APPPORT__/$APP_PORT/g; s/__CPPORT__/$RANDEVU_PORT/g; s/__OYUNPORT__/$OYUN_PORT/g; s/__KALPORT__/$KALORIAI_PORT/g; s|__ANA_DIR__|$ANA_DIR|g" /tmp/gnc.nginx
$SUDO mv /tmp/gnc.nginx /etc/nginx/sites-available/gnc
$SUDO ln -sf /etc/nginx/sites-available/gnc /etc/nginx/sites-enabled/gnc
$SUDO rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/gnc-crm
$SUDO nginx -t
$SUDO systemctl reload nginx
info "nginx hazır: $DOMAIN | crm | randevu | {slug} | fruitstorm | kaloriai"

# ---- 10b) FRUIT STORM — GitHub'dan otomatik (port 3003) ----
step "10b/12 Fruit Storm (port $OYUN_PORT)..."
FS_MOVE=""
for conf in /var/www/oyunlar/*/.gnc-oyun.conf; do
  [ -f "$conf" ] || continue
  P_=$(grep -m1 -oP 'PORT="\K[0-9]+' "$conf" 2>/dev/null || echo "")
  if [ "$P_" = "3001" ]; then
    N_=$(grep -m1 -oP 'NAME="\K[^"]+' "$conf" 2>/dev/null || basename "$(dirname "$conf")")
    info "$N_ eski kurulumu bulundu (port 3001) → $OYUN_PORT'e taşınıyor..."
    sed -i "s/^PORT=\"3001\"/PORT=\"$OYUN_PORT\"/" "$conf"
    if $SUDO bash "$APP_DIR/deploy/oyun-deploy.sh" "$N_"; then FS_MOVE="evet"; else warn "taşınma başarısız — elle: sudo gnc-oyun $N_"; fi
    break
  fi
done
if [ -z "$FS_MOVE" ]; then
  if [ -f /var/www/oyunlar/fruitstorm/.gnc-oyun.conf ]; then
    info "fruitstorm zaten kurulu — repodan güncelleniyor..."
    $SUDO bash "$APP_DIR/deploy/oyun-deploy.sh" fruitstorm || warn "güncelleme başarısız — elle: sudo gnc-oyun fruitstorm"
  else
    info "GitHub'dan indiriliyor: $FRUITSTORM_REPO"
    $SUDO bash "$APP_DIR/deploy/oyun-deploy.sh" "$FRUITSTORM_REPO" "$OYUN_PORT" fruitstorm \
      || warn "Fruit Storm kurulamadı (repo private/adres yanlış olabilir). Sonra elle: sudo gnc-oyun $FRUITSTORM_REPO $OYUN_PORT fruitstorm"
  fi
fi

# ---- 10c) KALORIAI — GitHub'dan otomatik (port 3004, AYRI veritabanı) ----
step "10c/12 KaloriAI (port $KALORIAI_PORT)..."
KAL_DIR="/var/www/oyunlar/kaloriai"
KAL_FRESH=""
if [ -f "$KAL_DIR/.gnc-oyun.conf" ]; then
  info "kaloriai zaten kurulu — repodan güncelleniyor..."
  $SUDO bash "$APP_DIR/deploy/oyun-deploy.sh" kaloriai || warn "güncelleme başarısız — elle: sudo gnc-oyun kaloriai"
else
  if [ -d "$KAL_DIR" ] && [ ! -d "$KAL_DIR/.git" ]; then
    info "yarım kalmış kaloriai klasörü temizleniyor..."
    $SUDO rm -rf "$KAL_DIR"
  fi
  info "GitHub'dan indiriliyor: $KALORIAI_REPO"
  if $SUDO bash "$APP_DIR/deploy/oyun-deploy.sh" "$KALORIAI_REPO" "$KALORIAI_PORT" kaloriai; then
    KAL_FRESH="evet"
  else
    warn "KaloriAI kurulamadı (repo private/adres yanlış olabilir). Sonra elle: sudo gnc-oyun $KALORIAI_REPO $KALORIAI_PORT kaloriai"
  fi
fi
# İlk kurulumsa ve repoda kurtarılmış veritabanı varsa → kaloriai'nin KENDİ db'sine yükle
if [ "$KAL_FRESH" = "evet" ] && [ -f "$APP_DIR/db/kaloriai-data-recovered.db" ]; then
  KDB="$KAL_DIR/db/custom.db"
  [ -f "$KAL_DIR/.env" ] && KDB=$(grep -m1 '^DATABASE_URL=' "$KAL_DIR/.env" | sed -e 's/^DATABASE_URL=file://' -e 's/^"//' -e 's/"$//')
  if [ -n "$KDB" ] && [ -f "$KDB" ]; then
    $SUDO cp "$APP_DIR/db/kaloriai-data-recovered.db" "$KDB" \
      && info "Kurtarılmış KaloriAI verisi yüklendi -> $KDB" \
      || warn "kurtarılmış veri kopyalanamadı (elle: sudo cp $APP_DIR/db/kaloriai-data-recovered.db $KDB)"
    pm2 restart kaloriai >/dev/null 2>&1 || $SUDO pm2 restart kaloriai >/dev/null 2>&1 || true
  fi
fi

# ---- 11) Güvenlik duvarı ----
$SUDO ufw allow OpenSSH >/dev/null 2>&1 || true
$SUDO ufw allow 'Nginx Full' >/dev/null 2>&1 || true
$SUDO ufw --force enable >/dev/null 2>&1 || true

# ---- güncelleme scriptini kur (repodaki taze kopya öncelikli) ----
if [ -f "$APP_DIR/deploy/guncelle-gnc.sh" ]; then
  $SUDO cp "$APP_DIR/deploy/guncelle-gnc.sh" /usr/local/bin/guncelle-gnc.sh
  info "Güncelleme komutu kuruldu: guncelle-gnc.sh"
fi
$SUDO chmod +x /usr/local/bin/guncelle-gnc.sh 2>/dev/null || true

# ---- gnc-proje: tek komutla yeni alt alan adı ----
if [ -f "$APP_DIR/deploy/yeni-proje.sh" ]; then
  $SUDO cp "$APP_DIR/deploy/yeni-proje.sh" /usr/local/bin/gnc-proje
  $SUDO chmod +x /usr/local/bin/gnc-proje
  info "Yeni proje komutu kuruldu: gnc-proje"
fi

# ---- gnc-oyun: ayrı repo'dan oyun/proje deploy (gnc-erp'den bağımsız) ----
if [ -f "$APP_DIR/deploy/oyun-deploy.sh" ]; then
  $SUDO cp "$APP_DIR/deploy/oyun-deploy.sh" /usr/local/bin/gnc-oyun
  $SUDO chmod +x /usr/local/bin/gnc-oyun
  info "Oyun/proje deploy komutu kuruldu: gnc-oyun"
fi

# ---- uygulama ayağa kalkana kadar bekle + demo verisini yükle ----
info "CRM'in açılması bekleniyor..."
APP_OK=""
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$APP_PORT" 2>/dev/null || echo "000")
  if [ "$CODE" != "000" ]; then APP_OK="evet"; break; fi
  sleep 2
done
if [ -n "$APP_OK" ]; then
  info "CRM çalışıyor (HTTP $CODE) — başlangıç verileri yükleniyor..."
  SEED1=$(curl -s -X POST "http://127.0.0.1:$APP_PORT/api/seed" | head -c 120 || true)
  info "temel veri: $SEED1"
  SEED2=$(curl -s -X POST "http://127.0.0.1:$APP_PORT/api/seed-realistic" | head -c 120 || true)
  info "gerçekçi veri: $SEED2"
else
  warn "CRM 60 sn içinde yanıt vermedi. Logları görün: pm2 logs gnc-crm"
fi

# ---- SAĞLIK KONTROLÜ: tüm portlar ----
info "Port sağlık kontrolü:"
for p in $APP_PORT $RANDEVU_PORT $OYUN_PORT $KALORIAI_PORT; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:$p/" 2>/dev/null || echo "000")
  if [ "$C" != "000" ] && [ "$C" != "502" ]; then
    info "  port $p → HTTP $C AYAKTA ✓"
  else
    warn "  port $p → yanıt yok (repo kurulamadıysa normal — kurulum çıktısına bakın)"
  fi
done

# ---- genel IP tespiti ----
PUBLIC_IP=$(curl -s --max-time 5 https://checkip.amazonaws.com || curl -s --max-time 5 ifconfig.me || echo "?")

echo ""
echo -e "${G}============================================================${N}"
echo -e "${G}   KURULUM TAMAMLANDI! (v3.0 — tüm uygulamalar)${N}"
echo -e "${G}============================================================${N}"
echo -e "  Sunucu IP'niz  : ${B}$PUBLIC_IP${N}   <- BUNU NOT ALIN"
echo -e ""
echo -e "  ${B}SİTE ADRESLERİNİZ (DNS sonrası):${N}"
echo -e "   Ana Site        : ${B}http://$DOMAIN${N}  (portfolyo — Randevu/KaloriAI kartlı)"
echo -e "   GNC CRM         : ${B}http://crm.$DOMAIN${N}"
echo -e "   Müşteri Randevu : ${B}http://randevu.$DOMAIN${N}  ← YENİ"
echo -e "   Her işletme     : ${B}http://{isletme}.$DOMAIN${N} → randevu sayfası"
echo -e "   Fruit Storm     : ${B}http://fruitstorm.$DOMAIN${N}  (meyvepatlat da çalışır)"
echo -e "   Kalori AI       : ${B}http://kaloriai.$DOMAIN${N}  ← YENİ"
echo -e ""
echo -e "  ${Y}HOSTINGER'DA YAPILACAK TEK ŞEY — DNS (2 dakika):${N}"
echo -e "   hPanel → Alan Adları → gncinc.online → DNS Bölgesi'ne ŞU 3 KAYIT:"
echo -e "        ${B}A     · @            · $PUBLIC_IP${N}"
echo -e "        ${B}CNAME · www          · $DOMAIN${N}"
echo -e "        ${B}A     · *  (yıldız)  · $PUBLIC_IP   ← TÜM alt alan adlarını çözer!${N}"
echo -e "   (yıldız istemezseniz ayrıca: A · crm · IP, A · randevu · IP, A · fruitstorm · IP, A · kaloriai · IP)"
echo -e "   ${B}Başka bir şey GEREKMEZ${N} — Hostinger'dan hosting paketi alınmaz, sunucu VPS'te."
echo -e ""
echo -e "  ${Y}SSL (DNS yayılınca 10-30 dk sonra, TEK komut):${N}"
echo -e "        ${B}sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN -d crm.$DOMAIN -d randevu.$DOMAIN -d fruitstorm.$DOMAIN -d kaloriai.$DOMAIN${N}"
echo -e "   İşletme alt alan adları ({slug}.$DOMAIN) için wildcard SSL:"
echo -e "        Cloudflare DNS kullanıyorsan: sudo apt-get install -y python3-certbot-dns-cloudflare"
echo -e "                                        sudo certbot certonly --dns-cloudflare -d *.$DOMAIN -d $DOMAIN"
echo -e "        Yoksa her işletme için: sudo certbot --nginx -d sik-kuafor.$DOMAIN"
echo -e ""
echo -e "  ${B}İLERİDE — GÜNCELLEME VE YENİ PROJE (tek komut):${N}"
echo -e "   Tüm CRM güncellemesi : ${B}guncelle-gnc.sh${N}   (git pull + build + restart + ana site)"
echo -e "   Fruit Storm güncelle : ${B}sudo gnc-oyun fruitstorm${N}"
echo -e "   KaloriAI güncelle    : ${B}sudo gnc-oyun kaloriai${N}"
echo -e "   Yeni proje/alt alan  : ${B}sudo gnc-proje <altalanadi> <port>${N}"
echo -e "   Teşhis               : ${B}sudo gnc-oyun liste${N} | ${B}sudo gnc-oyun doktor <isim>${N}"
echo -e "   Durum                : ${B}pm2 status${N}   Loglar: ${B}pm2 logs gnc-crm${N}"
echo -e "${G}============================================================${N}"
