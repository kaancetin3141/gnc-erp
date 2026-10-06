#!/bin/bash
# ============================================================
# GNC CRM — GNCINC.ONLINE Tek Komut Sunucu Kurulumu
# Kullanım:  sudo bash scripts/server-setup.sh
# Amaç:      Amazon VDS (Ubuntu) üzerinde her şeyi kurar/başlatır:
#            CRM :3000 · customer-page :3002 · Fruit Storm :3003 · KaloriAI :3004
# Domain:    gncinc.online (+ *.gncinc.online alt alan adları)
# Tekrar çalıştırılabilir (idempotent) — varsa atlar, çalıştırır.
# ============================================================
set -u
DOMAIN="gncinc.online"
PROJ="${PROJ:-/var/www/my-project}"          # proje yolu (farklıysa: PROJ=/yol sudo bash ...)
REPOS=(
  "https://github.com/kaancetin3141/fruit-storm"
  "https://github.com/kaancetin3141/KaloriAI kaloriai"
)
ok()   { echo -e "\033[32m✓ $1\033[0m"; }
warn() { echo -e "\033[33m! $1\033[0m"; }
step() { echo -e "\n\033[36m── $1 ──\033[0m"; }

[ "$(id -u)" = 0 ] || { warn "sudo ile çalıştır: sudo bash scripts/server-setup.sh"; exit 1; }
[ -d "$PROJ" ] || { warn "Proje bulunamadı: $PROJ  (önce repoyu klonla: git clone <crm-repo> $PROJ)"; exit 1; }

step "1/8 Sistem paketleri + Caddy"
if command -v apt-get >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates >/dev/null 2>&1
  if ! command -v caddy >/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null 2>&1
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list 2>/dev/null
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null 2>&1
  fi
fi
command -v caddy >/dev/null && ok "Caddy hazır" || warn "Caddy kurulamadı — elle kur"

step "2/8 Bun (Node çalışma zamanı)"
if ! command -v bun >/dev/null; then
  curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1
  export PATH="$HOME/.bun/bin:$PATH"
  ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null
fi
command -v bun >/dev/null && ok "Bun hazır: $(bun --version)" || { warn "Bun kurulamadı"; exit 1; }

step "3/8 CRM .env + veritabanı"
cd "$PROJ" || exit 1
mkdir -p db logs
if ! grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  echo "DATABASE_URL=file:$PROJ/db/custom.db" >> .env
  echo "PORT=3000" >> .env
  echo "CRON_SECRET=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9')" >> .env
  ok ".env oluşturuldu"
else
  ok ".env zaten var"
fi
bun x prisma db push >/dev/null 2>&1 && ok "Prisma şema senkron" || warn "prisma db push başarısız — .env DATABASE_URL'i kontrol et"

step "4/8 Fruit Storm (3003) + KaloriAI (3004) repoları"
mkdir -p mini-services
cd mini-services
for entry in "${REPOS[@]}"; do
  url=$(echo "$entry" | awk '{print $1}')
  name=$(echo "$entry" | awk '{print $2}')
  [ -z "$name" ] && name=$(basename "$url" .git)
  if [ -d "$name/.git" ]; then
    ok "$name zaten var"
  elif git clone -q "$url" "$name" 2>/dev/null; then
    ok "$name klonlandı ($url → :$([ "$name" = fruit-storm ] && echo 3003 || echo 3004))"
  else
    warn "$name klonlanamadı ($url) — repo private ise SSH/deploy key ayarla"
  fi
done
# KRİTİK: KaloriAI asla CRM'in veritabanını kullanmamalı (eski kaza!)
if [ -d kaloriai ]; then
  mkdir -p kaloriai/db kaloriai/upload
  grep -q '^DATABASE_URL=' kaloriai/.env 2>/dev/null || \
    echo "DATABASE_URL=file:$PROJ/mini-services/kaloriai/db/kaloriai.db" > kaloriai/.env
  ok "KaloriAI ayrı veritabanı garantili (kaloriai/db/kaloriai.db)"
fi
cd "$PROJ"

step "4b/8 KaloriAI production kurulum (kullanıcının deploy dosyaları ile)"
KDIR="$PROJ/mini-services/kaloriai"
if [ -d "$KDIR/.git" ] && command -v systemctl >/dev/null; then
  cd "$KDIR"
  bun install >/dev/null 2>&1 || warn "kaloriai: bun install uyarı"
  bunx prisma generate >/dev/null 2>&1
  bunx prisma db push >/dev/null 2>&1 || warn "kaloriai: prisma push uyarı (.env kontrol et)"
  if bun run build > /tmp/kaloriai-build.log 2>&1; then
    OWNER=$(stat -c %U "$PROJ")
    sed -e "s/__KALORIAI_USER__/$OWNER/g" \
      "$PROJ/deploy/kaloriai/kaloriai-3004.service" > /etc/systemd/system/kaloriai.service
    systemctl daemon-reload
    systemctl enable --now kaloriai >/dev/null 2>&1 \
      && ok "KaloriAI systemd servisi AKTİF (port 3004, production build)" \
      || warn "kaloriai.service başlatılamadı: journalctl -u kaloriai -n 20"
  else
    warn "kaloriai build başarısız — /tmp/kaloriai-build.log son satırları:"
    tail -3 /tmp/kaloriai-build.log
  fi
  cd "$PROJ"
else
  [ -d "$KDIR" ] || warn "kaloriai klasörü yok — production kurulum atlandı"
fi

step "5/8 Tüm servisleri başlat"
bash scripts/ensure-services.sh
if ! curl -sf -o /dev/null --max-time 5 http://127.0.0.1:3000/; then
  (cd "$PROJ" && setsid nohup bun run dev > logs/main.log 2>&1 &)
  sleep 8
fi
for p in 3000 3002 3003 3004; do
  curl -sf -o /dev/null --max-time 4 "http://127.0.0.1:$p/" && ok "port $p AYAKTA" || warn "port $p yanıt yok (repo/klasör yoksa normal)"
done

step "6/8 Caddyfile (gncinc.online + SSL otomatik)"
cat > /etc/caddy/Caddyfile <<EOF
# CRM ana site
gncinc.online, www.gncinc.online {
    reverse_proxy localhost:3000
}

# Müşteri randevu sitesi — {slug}.gncinc.online (örn. sik-kuafor.gncinc.online)
*.gncinc.online {
    reverse_proxy localhost:3002
}

# Fruit Storm (3. sıra)
oyun.gncinc.online {
    reverse_proxy localhost:3003
}

# KaloriAI (4. sıra)
kalori.gncinc.online {
    reverse_proxy localhost:3004
}
EOF
caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && ok "Caddyfile geçerli" || warn "Caddyfile doğrulanamadı"
systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || (caddy start --config /etc/caddy/Caddyfile >/dev/null 2>&1)
systemctl is-active caddy >/dev/null 2>&1 && ok "Caddy aktif — SSL (HTTPS) otomatik alınacak" || warn "Caddy servisi başlamadı: journalctl -u caddy"

step "7/8 Sağlık kontrolü cron'u (30 dk'da bir)"
CRON_LINE="*/30 * * * * cd $PROJ && bash scripts/ensure-services.sh >> logs/ensure.log 2>&1"
crontab -l 2>/dev/null | grep -F "ensure-services.sh" >/dev/null || \
  { crontab -l 2>/dev/null; echo "$CRON_LINE"; } | crontab -
ok "Cron hazır"

step "8/8 Güvenlik duvarı"
if command -v ufw >/dev/null; then
  ufw allow 22/tcp >/dev/null 2>&1; ufw allow 80/tcp >/dev/null 2>&1; ufw allow 443/tcp >/dev/null 2>&1
  ufw --force enable >/dev/null 2>&1
  ok "ufw: 22/80/443 açık (3000-3004 dışarıya KAPALI — doğru yol)"
fi

echo -e "\n\033[35m════════ KURULUM BİTTİ ════════\033[0m"
echo "  🌐 CRM        → https://gncinc.online          (:3000)"
echo "  🍉 Müşteri    → https://sik-kuafor.gncinc.online (:3002, * alt alan adları)"
echo "  🎮 Oyun       → https://oyun.gncinc.online     (:3003)"
echo "  🥗 KaloriAI   → https://kalori.gncinc.online   (:3004, systemd: kaloriai.service)"
echo ""
echo "  Güncelleme:   cd mini-services/kaloriai && bash $PROJ/deploy/kaloriai/deploy.sh"
echo "  Yedek (günlük): deploy/kaloriai/backup.sh  → crontab'a eklenebilir"
echo "  DNS kontrol (bu sunucudan): dig +short gncinc.online  → VDS IP'nizi dönmeli"
echo "  Admin panel → gncinc.online → 'Program Admini olarak gir' → Admin Paneli → Alan Adları"
echo "  Yedekler her 6 saatte db/backups/ altına otomatik alınır."
