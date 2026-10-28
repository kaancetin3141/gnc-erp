#!/bin/bash
# ============================================================
# GNC — Otomatik SSL/vhost provisioning (sunucu tarafı)
# Yeni açılan işletmeler için {slug}.gncinc.online alt alan adlarını
# otomatik keşfeder; nginx vhost'u yoksa oluşturur, SSL sertifikası
# yoksa certbot ile üretir. Cron ile saatte bir çalıştırılır.
#
# KURULUM (sunucuda TEK SEFER):
#   sudo cp deploy/otomatik-sertifika.sh /usr/local/bin/otomatik-sertifika.sh
#   sudo chmod +x /usr/local/bin/otomatik-sertifika.sh
#   (echo "17 * * * * root /usr/local/bin/otomatik-sertifika.sh >> /var/log/otomatik-sertifika.log 2>&1" \
#     | sudo tee /etc/cron.d/otomatik-sertifika)
#
# NASIL ÇALIŞIR:
#   1) CRM API'sinden (127.0.0.1:3000) aktif işletme slug'larını çeker
#   2) Her slug için:
#      · /etc/nginx/sites-available/gnc-isletme-<slug> yoksa oluştur (80 → 3002)
#      · nginx -t başarılıysa symlink + reload
#      · DNS çözümlenmiyorsa certbot'u DENEMEZ (rate-limit yanmasını önler)
#      · cert yoksa: certbot --nginx -d <slug>.DOMAIN (varsa dokunmaz)
#   3) randevu.<DOMAIN> ana liste vhost'unu da kontrol eder
# Notlar:
#   · certbot --nginx --keep-until-expiring ile idempotenttir
#   · flock ile eşzamanlı çalışma engellenir
# ============================================================

DOMAIN="${DOMAIN:-gncinc.online}"
CRM_API="${CRM_API:-http://127.0.0.1:3000/api/public/providers}"
RANDEVU_PORT="${RANDEVU_PORT:-3002}"
NGX_DIR="/etc/nginx/sites-available"
NGX_EN="/etc/nginx/sites-enabled"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
LOG_TAG="[otomatik-sertifika]"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $LOG_TAG $*"; }

# --- eşzamanlı çalışmayı engelle
exec 9>/run/otomatik-sertifika.lock
flock -n 9 || { log "başka süreç çalışıyor — çık"; exit 0; }

# --- nginx var mı?
command -v nginx >/dev/null 2>&1 || { log "nginx yok — çık"; exit 1; }
command -v certbot >/dev/null 2>&1 || log "UYARI: certbot yok — sadece vhost kurulacak"

# --- sunucunun kendi IP'si (DNS doğrulaması için)
SERVER_IP=$(curl -s -m 5 https://api.ipify.org 2>/dev/null || echo "")

# --- slug listesi
SLUGS=$(curl -s -m 10 "$CRM_API" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    items = d.get('items', d if isinstance(d, list) else [])
    slugs = [it.get('slug') for it in items if it.get('slug')]
    print('\n'.join(slugs))
except Exception:
    pass
")
if [ -z "$SLUGS" ]; then
  log "CRM API'den işletme listesi alınamadı ($CRM_API) — çık"
  exit 1
fi

write_vhost() {
  local fqdn="$1" file="$NGX_DIR/gnc-isletme-$2"
  [ -f "$file" ] && return 0
  cat > "$file" <<EOF
# GNC otomatik vhost — $fqdn (otomatik-sertifika.sh tarafından yönetilir)
server {
    listen 80;
    server_name $fqdn;

    location / {
        proxy_pass http://127.0.0.1:$RANDEVU_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  return 0
}

enable_and_reload() {
  local file="$1"
  ln -sf "$file" "$NGX_EN/$(basename "$file")"
  if nginx -t 2>/dev/null; then
    systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null
    return 0
  fi
  log "HATA: nginx -t başarısız — $(basename "$file") devre dışı bırakılıyor"
  rm -f "$NGX_EN/$(basename "$file")"
  nginx -t 2>/dev/null && (systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null)
  return 1
}

dns_resolves() {
  local fqdn="$1"
  local ips
  ips=$(dig +short "$fqdn" A 2>/dev/null | grep -E '^[0-9.]+$' | head -3)
  [ -z "$ips" ] && return 1
  if [ -n "$SERVER_IP" ] && ! echo "$ips" | grep -q "$SERVER_IP"; then
    log "not: $fqdn → $(echo $ips | tr '\n' ' ') (sunucu: $SERVER_IP) — proxy/CDN olabilir, certbot yine denenir"
  fi
  return 0
}

has_cert() {
  local fqdn="$1"
  ls "/etc/letsencrypt/live/$fqdn/fullchain.pem" >/dev/null 2>&1 && return 0
  return 1
}

issue_cert() {
  local fqdn="$1"
  command -v certbot >/dev/null 2>&1 || return 1
  certbot --nginx -d "$fqdn" -m "$ADMIN_EMAIL" --agree-tos --non-interactive \
    --keep-until-expiring --redirect >> /var/log/otomatik-sertifika-certbot.log 2>&1
}

CREATED_VHOST=0
CREATED_CERT=0
FAILED=""

# ---- 1) randevu ana liste vhost'u
if [ ! -f "$NGX_DIR/gnc-randevu" ]; then
  write_vhost "randevu.${DOMAIN}" "randevu" && CREATED_VHOST=$((CREATED_VHOST+1))
  enable_and_reload "$NGX_DIR/gnc-randevu" && log "randevu.${DOMAIN} vhost kuruldu"
fi
if ! has_cert "randevu.${DOMAIN}" && dns_resolves "randevu.${DOMAIN}"; then
  if issue_cert "randevu.${DOMAIN}"; then CREATED_CERT=$((CREATED_CERT+1)); log "SSL: randevu.${DOMAIN} OK"; else FAILED="$FAILED randevu"; fi
fi

# ---- 2) her işletme için
while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  echo "$slug" | grep -qE '^[a-z0-9][a-z0-9-]{1,60}$' || { log "atla: geçersiz slug '$slug'"; continue; }
  case "$slug" in
    randevu|www|crm|app|admin|api|ana|panel|mail|ftp|fruitstorm|meyvepatlat|kaloriai|cubiq) continue ;;
  esac
  fqdn="${slug}.${DOMAIN}"
  file="$NGX_DIR/gnc-isletme-$slug"
  link="$NGX_EN/gnc-isletme-$slug"

  if [ ! -f "$file" ]; then
    if write_vhost "$fqdn" "$slug"; then
      if enable_and_reload "$file"; then
        CREATED_VHOST=$((CREATED_VHOST+1))
        log "vhost kuruldu: $fqdn → 127.0.0.1:$RANDEVU_PORT"
      else
        FAILED="$FAILED $slug(vhost)"
        continue
      fi
    fi
  elif [ ! -L "$link" ]; then
    enable_and_reload "$file" || { FAILED="$FAILED $slug(link)"; continue; }
  fi

  if ! has_cert "$fqdn"; then
    if dns_resolves "$fqdn"; then
      if issue_cert "$fqdn"; then
        CREATED_CERT=$((CREATED_CERT+1))
        log "SSL: $fqdn OK"
      else
        FAILED="$FAILED $slug(cert)"
        log "HATA: certbot başarısız — $fqdn (ayrıntı: /var/log/otomatik-sertifika-certbot.log)"
      fi
    else
      log "bekle: $fqdn DNS henüz çözümlenmiyor (wildcard A kaydı yoksa DNS'e A kaydı ekle: $slug)"
    fi
  fi
done <<< "$SLUGS"

log "bitti: yeni vhost=$CREATED_VHOST, yeni sertifika=$CREATED_CERT${FAILED:+, sorunlu:$FAILED}"
# (END OF FILE)
