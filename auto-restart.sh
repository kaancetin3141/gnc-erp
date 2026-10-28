#!/bin/bash
# GNC ERP/CRM — dev server çökerse yeniden başlat (sonsuz döngü).
# NOT: yalnızca BU repoya (cwd) bağlı Next.js süreçlerini temizler —
# aynı sunucuda koşan diğer servisler etkilenmez.
cd "$(dirname "$0")" || exit 1

PORT=3001

cleanup_repo_procs() {
  for pid in $(pgrep -f "next dev -p $PORT" 2>/dev/null) $(pgrep -f "next-server" 2>/dev/null); do
    [ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" = "$(pwd)" ] && kill -9 "$pid" 2>/dev/null
  done
}

while true; do
  cleanup_repo_procs
  sleep 2

  NODE_OPTIONS="--max-old-space-size=1024" NEXT_TELEMETRY_DISABLED=1 \
    nohup bun run dev >> dev.log 2>&1 &
  PID=$!
  echo "[$(date '+%H:%M:%S')] dev server başlatıldı (PID $PID)"

  # Süreç ölünceye kadar bekle — ölünce döngü yeniden başlatır
  wait "$PID"
  echo "[$(date '+%H:%M:%S')] dev server sonlandı (exit $?) — 10 sn sonra yeniden başlatılıyor..."
  sleep 10
done
