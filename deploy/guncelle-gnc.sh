#!/bin/bash
# ============================================================
#  GNC GUNCELLEME v5 — CRM + Müşteri Randevu Sitesi + Cubiq + izin self-heal + sağlık kontrolü
#
#  v5: Cubiq (port 3006) desteği — kuruluysa repodan günceller, kurulu
#      değilse github.com/kaancetin3141/cubiq'tan OTOMATİK kurar.
#
#  Kullanım :  bash guncelle-gnc.sh        (veya sadece: guncelle-gnc.sh)
#  Kurulumu :  kurulum.sh v3.0+ otomatik kurar (/usr/local/bin).
#              Elle kurmak: sudo cp /var/www/gnc-erp/deploy/guncelle-gnc.sh /usr/local/bin/
# ============================================================
set -e
APP_DIR="/var/www/gnc-erp"
ANA_DIR="/var/www/gncinc-ana"
APP_PORT="3000"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

# ---- 0/7) Yazma izni (Permission denied önleyici) ----
if [ ! -d "$APP_DIR" ]; then
  echo -e "${RED}HATA: $APP_DIR yok — önce kurulum.sh çalıştırın${NC}"; exit 1
fi
if [ ! -w "$APP_DIR" ] || [ ! -w "$APP_DIR/.git" ]; then
  echo "0/7) İzinler düzeltiliyor (root sahipliği -> $(whoami))..."
  sudo chown -R "$(whoami):$(whoami)" "$APP_DIR" 2>/dev/null \
    || sudo chown -R "$(whoami)" "$APP_DIR" \
    || echo "   ! chown başarısız — 'sudo chown -R $(whoami) $APP_DIR' elle çalıştırın"
fi
if [ -d "$ANA_DIR" ] && [ ! -w "$ANA_DIR" ]; then
  sudo chown -R "$(whoami):$(whoami)" "$ANA_DIR" 2>/dev/null \
    || sudo chown -R "$(whoami)" "$ANA_DIR" || true
fi

cd "$APP_DIR"

echo "1/8) git pull...";        git pull --ff-only 2>/dev/null || git pull || echo "   (pull başarısız — mevcut kodla devam)"
echo "2/8) npm install...";    npm install || { echo "   ! peer-deps çakışması — --legacy-peer-deps ile tekrar"; npm install --legacy-peer-deps; }
echo "3/8) veritabanı...";     npx prisma db push
# Program Admini geçişi (idempotent): admin@gnccrm.app / 314159 — hata güncellemeyi bloklamaz
if [ -f scripts/update-program-admin.cjs ]; then
  node scripts/update-program-admin.cjs || echo "   ! program admin geçişi atlandı (yukarıdaki hataya bak)"
fi
# --- 4/8) BUILD — küçük RAM'li sunucu koruması --------------------------------
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "${SWAP_MB:-0}" -lt 2000 ]; then
  echo -e "${YELLOW}! Swap küçük (${SWAP_MB:-0}MB) — build takılırsa 4G ekleyin:${NC}"
  echo "     sudo fallocate -l 4G /swapfile2 && sudo chmod 600 /swapfile2 && sudo mkswap /swapfile2 && sudo swapon /swapfile2"
fi
echo "4/8) build... (RAM boşaltmak için servisler GEÇİCİ durduruluyor — site birkaç dk kapalı)"
pm2 stop all >/dev/null 2>&1 || true
BUILD_OK=1
NODE_OPTIONS=--max-old-space-size=1536 npm run build || BUILD_OK=0
pm2 restart all >/dev/null 2>&1 || pm2 resurrect >/dev/null 2>&1 || true
if [ "$BUILD_OK" != "1" ]; then
  echo -e "${RED}! BUILD BAŞARISIZ — servisler eski .next ile yeniden başlatıldı${NC}"
  echo "   Çözüm: swap büyütme (yukarıdaki komut) + 'pm2 delete gnc-customer-page' ile RAM boşalt + tekrar deneyin"
  exit 1
fi
echo "5/8) pm2 restart (CRM + Randevu)..."
pm2 restart gnc-crm 2>/dev/null || sudo pm2 restart gnc-crm 2>/dev/null \
  || echo "   ! pm2'de gnc-crm bulunamadı — kurulum.sh'ı çalıştırın"
# Müşteri Randevu Sitesi (3002, bun) — kodu repodan geldi, taze başlat
pm2 delete gnc-customer-page >/dev/null 2>&1 || true
if [ -f mini-services/customer-page/index.ts ] && command -v bun >/dev/null 2>&1; then
  ( cd mini-services/customer-page && \
      BASE_DOMAIN=${BASE_DOMAIN:-gncinc.online} NODE_ENV=production \
      pm2 start "$(command -v bun)" --name gnc-customer-page --time -- run index.ts ) \
    && echo "   randevu sitesi (3002) yeniden başlatıldı" \
    || echo "   ! randevu sitesi başlatılamadı — kurulum.sh 9b adımını çalıştırın"
fi
echo "6/8) ana site + araçlar güncelle..."
if [ -d ana-site ]; then cp -r ana-site/. "$ANA_DIR/" 2>/dev/null || sudo cp -r ana-site/. "$ANA_DIR/"; fi
# sunucu araçlarını repodan tazele (gnc-proje, gnc-oyun)
for t in "yeni-proje.sh gnc-proje" "oyun-deploy.sh gnc-oyun"; do
  set -- $t
  if [ -f "deploy/$1" ]; then
    sudo cp "deploy/$1" "/usr/local/bin/$2" 2>/dev/null || cp "deploy/$1" "/usr/local/bin/$2"
    sudo chmod +x "/usr/local/bin/$2" 2>/dev/null || chmod +x "/usr/local/bin/$2"
    echo "   araç güncel: $2"
  fi
done

# --- 6b/8) CUBIQ (port 3006) — kuruluysa güncelle, değilse otomatik kur ---
echo "6b/8) Cubiq (port 3006)..."
CUBIQ_CONF="/var/www/oyunlar/cubiq/.gnc-oyun.conf"
CUBIQ_REPO="https://github.com/kaancetin3141/cubiq.git"
if [ -f "$CUBIQ_CONF" ]; then
  sudo bash deploy/oyun-deploy.sh cubiq \
    && echo "   cubiq repodan güncellendi" \
    || echo "   ! cubiq güncellenemedi — elle: sudo gnc-oyun cubiq"
else
  echo "   cubiq kurulu değil — GitHub'dan kuruluyor (port 3006)..."
  sudo bash deploy/oyun-deploy.sh "$CUBIQ_REPO" 3006 cubiq \
    && echo "   cubiq kuruldu (port 3006)" \
    || echo "   ! cubiq kurulamadı — elle: sudo gnc-oyun $CUBIQ_REPO 3006 cubiq"
fi
# nginx'te cubiq alt alan adı yoksa bağla (kurulum.sh v3.4+ zaten ekler)
if ! grep -qs 'server_name[[:space:]]*.*\bcubiq\.' /etc/nginx/sites-available/* 2>/dev/null; then
  CUB_DOMAIN="gncinc.online"
  if [ -f /etc/nginx/sites-available/gnc ]; then
    CUB_DOMAIN=$(grep -m1 -oE '[a-z0-9.-]+\.[a-z]{2,}' /etc/nginx/sites-available/gnc | head -1 || echo "gncinc.online")
  fi
  cat > /tmp/gnc.cubiq.nginx << CUBEOF
# ============ CUBIQ — cubiq.__DOMAIN__ (port 3006) ============
server {
    listen 80;
    server_name cubiq.__DOMAIN__;

    location / {
        proxy_pass http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
CUBEOF
  sed -i "s/__DOMAIN__/$CUB_DOMAIN/g" /tmp/gnc.cubiq.nginx
  if sudo nginx -t 2>/dev/null; then
    { sudo cp /tmp/gnc.cubiq.nginx /etc/nginx/sites-available/gnc-cubiq \
      && sudo ln -sf /etc/nginx/sites-available/gnc-cubiq /etc/nginx/sites-enabled/gnc-cubiq \
      && sudo nginx -t && sudo systemctl reload nginx \
      && echo "   nginx: cubiq.$CUB_DOMAIN bağlandı (SSL için: sudo certbot --nginx -d cubiq.$CUB_DOMAIN)"; } \
      || echo "   ! cubiq nginx bloğu eklenemedi — elle: sudo gnc-proje cubiq 3006"
  else
    echo "   ! nginx config hatası — cubiq bloğu eklenemedi, elle kontrol edin"
  fi
  rm -f /tmp/gnc.cubiq.nginx
fi

echo "7/8) Sağlık kontrolü..."
if curl -s -o /dev/null -m 5 "http://127.0.0.1:$APP_PORT"; then
  echo -e "   ${GREEN}CRM (port $APP_PORT): AYAKTA ✓${NC}"
else
  echo -e "   ${RED}CRM (port $APP_PORT): YANIT YOK — pm2 logs gnc-crm${NC}"
fi
for p in 3002 3003 3004 3006; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -m 4 "http://127.0.0.1:$p/" 2>/dev/null || echo "000")
  if [ "$C" != "000" ] && [ "$C" != "502" ]; then
    echo -e "   ${GREEN}port $p: AYAKTA ✓${NC}"
  else
    echo -e "   ${YELLOW}port $p: yanıt yok (kurulum.sh 9b/10b/10c adımları kurar)${NC}"
  fi
done
L80=$(ss -tln 2>/dev/null | grep -c ':80 ' || true)
L443=$(ss -tln 2>/dev/null | grep -c ':443 ' || true)
echo "   nginx dinleme: 80=${L80}  443=${L443}"
if [ "${L443:-0}" = "0" ]; then
  echo -e "   ${YELLOW}! nginx 443 dinlemiyor -> sudo certbot --nginx -d <adresler>${NC}"
fi
echo "   Hatırlatma: AWS Security Group'ta sadece TCP 22 + 80 + 443 açık olmalı;"
echo "   uygulama portları (3000/3001/3002...) ASLA eklenmez."
echo ""
echo -e "${GREEN}GUNCELLEME TAMAM! — ana site + CRM + randevu + cubiq güncel${NC}"
echo "   Diğer uygulamalar: Fruit Storm → sudo gnc-oyun fruitstorm | KaloriAI → sudo gnc-oyun kaloriai | Cubiq → sudo gnc-oyun cubiq"
