#!/bin/bash
# ============================================================
#  GNC GUNCELLEME v3 — izinleri kendisi düzeltir + sağlık kontrolü
#
#  Kullanım :  bash guncelle-gnc.sh        (veya sadece: guncelle-gnc.sh)
#  Kurulumu :  kurulum.sh v2.2+ otomatik kurar (/usr/local/bin).
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

echo "1/7) git pull...";        git pull --ff-only 2>/dev/null || git pull || echo "   (pull başarısız — mevcut kodla devam)"
echo "2/7) npm install...";    npm install
echo "3/7) veritabanı...";     npx prisma db push
echo "4/7) build...";          NODE_OPTIONS=--max-old-space-size=1536 npm run build
echo "5/7) pm2 restart..."
pm2 restart gnc-crm 2>/dev/null || sudo pm2 restart gnc-crm 2>/dev/null \
  || echo "   ! pm2'de gnc-crm bulunamadı — kurulum.sh'ı çalıştırın"
echo "6/7) ana site + araçlar güncelle..."
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

echo "7/7) Sağlık kontrolü..."
if curl -s -o /dev/null -m 5 "http://127.0.0.1:$APP_PORT"; then
  echo -e "   ${GREEN}uygulama (port $APP_PORT): AYAKTA ✓${NC}"
else
  echo -e "   ${RED}uygulama (port $APP_PORT): YANIT YOK — pm2 logs gnc-crm${NC}"
fi
L80=$(ss -tln 2>/dev/null | grep -c ':80 ' || true)
L443=$(ss -tln 2>/dev/null | grep -c ':443 ' || true)
echo "   nginx dinleme: 80=${L80}  443=${L443}"
if [ "${L443:-0}" = "0" ]; then
  echo -e "   ${YELLOW}! nginx 443 dinlemiyor -> sudo certbot --nginx -d <adresler>${NC}"
fi
echo "   Hatırlatma: AWS Security Group'ta sadece TCP 22 + 80 + 443 açık olmalı;"
echo "   uygulama portları (3000/3001/3002...) ASLA eklenmez."
echo ""
echo -e "${GREEN}GUNCELLEME TAMAM! — ana site + CRM güncel${NC}"
