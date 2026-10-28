#!/bin/bash
# ============================================================
# GNC ERP/CRM — Dev Server Watchdog (port 3001)
# ------------------------------------------------------------
# Görevi:
#  1. Dev server kapalıysa başlat
#  2. HTTP 200 dönene kadar bekle
#  3. Ayakta kaldığı sürece izle; ölürse (OOM vb.) yeniden başlat
#
# Güvenlik:
#  - Yalnızca BU repoya (cwd) bağlı next süreçlerini temizler;
#    aynı sunucudaki diğer servisler (kaloriai, randevu, ...) etkilenmez.
#  - Bellek kapısı: ~1.4GB boş RAM yoksa başlatmayı bekler
#    (4GB sandbox'ta OOM killer'a karşı çırpışmayı önler).
# ============================================================
cd "$(dirname "$0")" || exit 1

PORT=3001
# .env'i açıkça yükle — sandbox'ın kalıtsal DATABASE_URL'i (SQLite) process.env'i ezebilir;
# Next.js'te process.env > .env olduğu için PostgreSQL URL'ini AÇIKÇA export etmek zorunludur.
if [ -f .env ]; then
  set -a; . ./.env; set +a
  echo "[watchdog] DATABASE_URL .env'den yüklendi: ${DATABASE_URL:0:30}..."
fi
MAX_RESTARTS=30
RESTART_COUNT=0
RAM_GATE_MB=1800

cleanup_repo_procs() {
  for pid in $(pgrep -f "next dev -p $PORT" 2>/dev/null) $(pgrep -f "next-server" 2>/dev/null); do
    [ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" = "$(pwd)" ] && kill -9 "$pid" 2>/dev/null
  done
}

ram_available_mb() {
  awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo
}

echo "[$(date '+%H:%M:%S')] watchdog başladı (port $PORT)"

while [ "$RESTART_COUNT" -lt "$MAX_RESTARTS" ]; do
  cleanup_repo_procs
  sleep 2

  # Bellek kapısı — yeterli boş RAM yoksa bekle
  while [ "$(ram_available_mb)" -lt "$RAM_GATE_MB" ]; do
    echo "[$(date '+%H:%M:%S')] RAM düşük ($(ram_available_mb)MB) — bekleniyor..."
    sleep 20
  done

  echo "[$(date '+%H:%M:%S')] dev server başlatılıyor (deneme $((RESTART_COUNT + 1))/$MAX_RESTARTS)"
  NODE_OPTIONS="--max-old-space-size=1024" NEXT_TELEMETRY_DISABLED=1 \
    nohup bun run dev >> dev.log 2>&1 &
  PID=$!

  # 200 dönene kadar bekle (en fazla ~4 dk)
  READY=0
  for i in $(seq 1 48); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "http://localhost:$PORT/" 2>/dev/null)
    if [ "$CODE" = "200" ]; then READY=1; break; fi
    kill -0 "$PID" 2>/dev/null || break
    sleep 5
  done

  if [ "$READY" = "1" ]; then
    echo "[$(date '+%H:%M:%S')] ✓ HTTP 200 — izleme modu"
    while true; do
      CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "http://localhost:$PORT/" 2>/dev/null)
      if [ "$CODE" != "200" ]; then
        sleep 8
        CODE2=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "http://localhost:$PORT/" 2>/dev/null)
        [ "$CODE2" = "200" ] && continue
        echo "[$(date '+%H:%M:%S')] ⚠ sağlık kontrolü başarısız (HTTP $CODE2) — yeniden başlatılıyor"
        break
      fi
      sleep 20
    done
  else
    echo "[$(date '+%H:%M:%S')] ⚠ 200 alınamadı — yeniden denenecek"
  fi

  RESTART_COUNT=$((RESTART_COUNT + 1))
  sleep 10
done

echo "[$(date '+%H:%M:%S')] Maksimum yeniden başlatma sayısına ulaşıldı."
