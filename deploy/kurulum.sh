#!/bin/bash
# ============================================================
#  GNC CRM — AWS Ubuntu TEK KOMUT KURULUM (v1.0)
#  Ne yapar: sistem güncelleme + swap + Node 20 + pm2 + nginx +
#  GitHub'dan kod + build + 7/24 çalıştırma + demo verisi +
#  guncelle-gnc.sh + güvenlik duvarı
#
#  Kullanım:  bash kurulum.sh [domain] [repo]
#  Örnek:     bash kurulum.sh gncinc.online
#  Varsayılan: gncinc.online + https://github.com/kaancetin3141/gnc-erp.git
# ============================================================
set -e

DOMAIN="${1:-gncinc.online}"
REPO="${2:-https://github.com/kaancetin3141/gnc-erp.git}"
APP_DIR="/var/www/gnc-erp"
APP_PORT="3000"

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
step "0/9 Kontrol — domain: $DOMAIN | repo: $REPO"

# ---- 1) Sistem güncelleme + temel paketler ----
step "1/9 Sistem güncelleniyor (2-5 dk)..."
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -y
$SUDO apt-get upgrade -y
$SUDO apt-get install -y git curl nginx certbot python3-certbot-nginx ufw
$SUDO timedatectl set-timezone Europe/Istanbul 2>/dev/null || true

# ---- 2) Swap (1 GB RAM için şart) ----
step "2/9 Swap (2 GB)..."
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
step "3/9 Node.js 20 + pm2..."
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

# ---- 4) Kodu GitHub'dan al ----
step "4/9 Kod GitHub'dan alınıyor..."
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git pull --ff-only || warn "git pull başarısız — mevcut kodla devam ediliyor"
else
  $SUDO mkdir -p /var/www
  $SUDO chown "$(whoami)" /var/www
  git clone "$REPO" "$APP_DIR" || die "Repo klonlanamadı: $REPO (repo adresini kontrol edin)"
  cd "$APP_DIR"
fi

# ---- 5) .env + veritabanı klasörü ----
step "5/9 Ortam dosyası (.env)..."
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

# ---- 6) Bağımlılıklar + şema + derleme ----
step "6/9 npm install (birkaç dk)..."
npm install
step "7/9 Veritabanı şeması..."
npx prisma generate
npx prisma db push
step "8/9 Derleme: npm run build (2-5 dk, swap sayesinde güvenli)..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build

# ---- 7) pm2 ile 7/24 başlat ----
step "9/9 Uygulama pm2 ile başlatılıyor..."
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

# ---- 8) nginx (domain ayarlı) ----
cat > /tmp/gnc-crm.nginx << 'NGINXEOF'
server {
    listen 80;
    server_name __DOMAIN__ __WWW__;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:__PORT__;
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
sed -i "s/__DOMAIN__/$DOMAIN/g; s/__WWW__/www.$DOMAIN/g; s/__PORT__/$APP_PORT/g" /tmp/gnc-crm.nginx
$SUDO mv /tmp/gnc-crm.nginx /etc/nginx/sites-available/gnc-crm
$SUDO ln -sf /etc/nginx/sites-available/gnc-crm /etc/nginx/sites-enabled/gnc-crm
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO nginx -t
$SUDO systemctl reload nginx
info "nginx yapılandırıldı: $DOMAIN + www.$DOMAIN"

# ---- 9) Güvenlik duvarı ----
$SUDO ufw allow OpenSSH >/dev/null 2>&1 || true
$SUDO ufw allow 'Nginx Full' >/dev/null 2>&1 || true
$SUDO ufw --force enable >/dev/null 2>&1 || true

# ---- güncelleme scriptini kur ----
$SUDO tee /usr/local/bin/guncelle-gnc.sh >/dev/null << 'GUNCELLEEOF'
#!/bin/bash
set -e
cd /var/www/gnc-erp
echo "1/5) git pull...";        git pull
echo "2/5) npm install...";    npm install
echo "3/5) prisma db push..."; npx prisma db push
echo "4/5) build...";          NODE_OPTIONS=--max-old-space-size=1536 npm run build
echo "5/5) pm2 restart...";    pm2 restart gnc-crm
pm2 status
echo "GUNCELLEME TAMAM!"
GUNCELLEEOF
$SUDO chmod +x /usr/local/bin/guncelle-gnc.sh
info "Güncelleme komutu kuruldu: guncelle-gnc.sh"

# ---- uygulama ayağa kalkana kadar bekle + demo verisini yükle ----
info "Uygulamanın açılması bekleniyor..."
APP_OK=""
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$APP_PORT" 2>/dev/null || echo "000")
  if [ "$CODE" != "000" ]; then APP_OK="evet"; break; fi
  sleep 2
done
if [ -n "$APP_OK" ]; then
  info "Uygulama çalışıyor (HTTP $CODE) — başlangıç verileri yükleniyor..."
  SEED1=$(curl -s -X POST "http://127.0.0.1:$APP_PORT/api/seed" | head -c 120 || true)
  info "temel veri: $SEED1"
  SEED2=$(curl -s -X POST "http://127.0.0.1:$APP_PORT/api/seed-realistic" | head -c 120 || true)
  info "gerçekçi veri: $SEED2"
else
  warn "Uygulama 60 sn içinde yanıt vermedi. Logları görün: pm2 logs gnc-crm"
fi

# ---- genel IP tespiti ----
PUBLIC_IP=$(curl -s --max-time 5 https://checkip.amazonaws.com || curl -s --max-time 5 ifconfig.me || echo "?")

echo ""
echo -e "${G}============================================================${N}"
echo -e "${G}   KURULUM TAMAMLANDI!${N}"
echo -e "${G}============================================================${N}"
echo -e "  Sunucu IP'niz  : ${B}$PUBLIC_IP${N}   <- BUNU NOT ALIN"
echo -e "  Uygulama testi : ${B}http://$PUBLIC_IP${N}"
echo -e ""
echo -e "  ${Y}KALAN 2 KÜÇÜK ADIM:${N}"
echo -e "  1) Domain panelinizde (Hostinger) DNS kayıtlarını şöyle yapın:"
echo -e "        A · @   · $PUBLIC_IP"
echo -e "        A · www · $PUBLIC_IP"
echo -e "  2) DNS yayılınca (kontrol: ping $DOMAIN -> $PUBLIC_IP) SSL kurun:"
echo -e "        ${B}sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN${N}"
echo -e ""
echo -e "  Faydalı komutlar:"
echo -e "   Güncelleme : ${B}guncelle-gnc.sh${N}"
echo -e "   Durum      : ${B}pm2 status${N}   Loglar: ${B}pm2 logs gnc-crm${N}"
echo -e "${G}============================================================${N}"
