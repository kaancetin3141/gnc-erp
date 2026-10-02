#!/bin/bash
# ============================================================
#  GNC PROJE — Tek Komutla Yeni Alt Alan Adı (v1.0)
#
#  Ne yapar:
#   1. <sub>.<domain> için nginx server block oluşturur
#      - port verilirse  -> 127.0.0.1:<port>'a reverse proxy (websocket destekli)
#      - port verilmezse -> statik site (/var/www/<sub>.<domain>)
#   2. nginx testi + yeniden yükleme
#   3. SSL sertifikası (certbot, otomatik — istemezsen --no-ssl)
#
#  Kullanım:
#   sudo gnc-proje oyun2 3002        # proxy: oyun2.gncinc.online -> port 3002
#   sudo gnc-proje tanitim           # statik: /var/www/tanitim.gncinc.online
#   sudo gnc-proje oyun2 3002 --no-ssl   # SSL kurmadan
#
#  Gereksinimler: DNS'de * (yıldız) A kaydı bu sunucuyu göstermeli
#  (AWS kullanıyorsanız Security Group'ta 80 + 443 açık olmalı)
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[1;36m'; NC='\033[0m'
step(){ echo -e "\n${GREEN}==>${NC} $1"; }
info(){ echo -e "   $1"; }
warn(){ echo -e "${YELLOW}! UYARI:${NC} $1"; }
die(){ echo -e "${RED}HATA: $1${NC}"; exit 1; }

[ "$(id -u)" -ne 0 ] && die "sudo ile çalıştırın: sudo gnc-proje <subdomain> [port]"

SUB="$1"; PORT="$2"
NO_SSL=0
[[ " $* " == *" --no-ssl "* ]] && NO_SSL=1

# Port sayı değilse (örn. --no-ssl yanlışlıkla 2. argümansa) port yok say
if [ -n "$PORT" ] && ! echo "$PORT" | grep -qE '^[0-9]+$'; then PORT=""; fi
if [ -n "$PORT" ] && { [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; }; then
  die "Geçersiz port: $PORT (1-65535 arası olmalı)"
fi

[ -z "$SUB" ] && die "Kullanım: sudo gnc-proje <subdomain> [port]\n  Örnek: sudo gnc-proje oyun2 3002"
echo "$SUB" | grep -qE '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' || die "Alt alan adı sadece küçük harf, rakam ve tire içerebilir: $SUB"

# ---- Domain'i mevcut nginx conf'tan otomatik tespit et ----
DOMAIN=""
if [ -f /etc/nginx/sites-available/gnc ]; then
  DOMAIN=$(grep -m1 -oE '[a-z0-9.-]+\.[a-z]{2,}' /etc/nginx/sites-available/gnc | head -1 || true)
fi
DOMAIN="${DOMAIN:-gncinc.online}"
FQDN="$SUB.$DOMAIN"

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE} GNC PROJE — $FQDN kuruluyor${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"

# ---- 1) nginx conf ----
step "1/3 nginx ayarı yazılıyor..."
CONF="/etc/nginx/sites-available/gnc-proje-$SUB"

if [ -n "$PORT" ]; then
  cat > "$CONF" << EOF
# ============ $FQDN -> 127.0.0.1:$PORT (gnc-proje ile kuruldu) ============
server {
    listen 80;
    server_name $FQDN;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  info "Türü: reverse proxy -> port $PORT"
else
  SITE_DIR="/var/www/$FQDN"
  mkdir -p "$SITE_DIR"
  if [ ! -f "$SITE_DIR/index.html" ]; then
    cat > "$SITE_DIR/index.html" << EOF
<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$FQDN</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#04101f;color:#eaf4ff}
div{text-align:center}h1{background:linear-gradient(90deg,#60a5fa,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}p{color:#8fb0d4}</style>
</head><body><div><h1>$FQDN</h1><p>Bu proje yakında burada yayınlanacak.</p><p style="font-size:12px;opacity:.6">GNC Yazılım · gncinc.online</p></div></body></html>
EOF
  fi
  cat > "$CONF" << EOF
# ============ $FQDN -> statik $SITE_DIR (gnc-proje ile kuruldu) ============
server {
    listen 80;
    server_name $FQDN;

    root $SITE_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
  info "Türü: statik site -> $SITE_DIR (index.html'i değiştirin)"
fi

ln -sf "$CONF" "/etc/nginx/sites-enabled/gnc-proje-$SUB"

# ---- 2) test + reload ----
step "2/3 nginx test ediliyor..."
if nginx -t 2>/dev/null; then
  systemctl reload nginx
  info "nginx yeniden yüklendi ✓"
else
  rm -f "/etc/nginx/sites-enabled/gnc-proje-$SUB"
  nginx -t && systemctl reload nginx || true
  die "nginx ayarı hatalı — conf geri alındı. Şablonu kontrol edin: $CONF"
fi

# ---- 3) SSL ----
if [ "$NO_SSL" -eq 1 ]; then
  warn "SSL atlandı (--no-ssl) — site: http://$FQDN"
else
  step "3/3 SSL sertifikası (certbot)..."
  info "DNS'in yayılmış olması gerekir (yıldız kaydı + 1-30 dk)"
  sleep 3
  if certbot --nginx -d "$FQDN" --non-interactive --agree-tos 2>&1 | tail -2; then
    info "SSL hazır ✓  Site: https://$FQDN"
  else
    warn "SSL ŞİMDİ kurulamadı — büyük olasılıkla DNS henüz yayılmadı."
    info "Site şimdilik: http://$FQDN (HTTP çalışır)"
    info "15-30 dk sonra TEK komutla SSL:  sudo certbot --nginx -d $FQDN"
  fi
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN} TAMAM! $FQDN yayında${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
if [ -n "$PORT" ]; then
  echo -e "  Hatırlatma: uygulamayı $PORT portunda çalıştırın:"
  echo -e "    ${BLUE}PORT=$PORT pm2 start <uygulama> --name $SUB${NC}"
fi
echo -e "  Açılmazsa kontrol sırası:"
echo -e "   1) DNS yıldız kaydı:  ${BLUE}nslookup $FQDN${NC}  -> sunucu IP dönmeli"
echo -e "   2) AWS Security Group: inbound  TCP 80 + 443  açık mı?"
echo -e "   3) SSL:               ${BLUE}sudo certbot --nginx -d $FQDN${NC}"
echo ""
