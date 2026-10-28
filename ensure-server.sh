#!/bin/bash
# GNC ERP/CRM — dev server ayaktaysa geç, değilse başlat ve 200'ü bekle.
# NOT: yalnızca BU repoya (cwd) bağlı Next.js süreçlerini temizler —
# aynı sunucuda koşan diğer servisler etkilenmez.
cd "$(dirname "$0")" || exit 1

PORT=3001

CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://localhost:$PORT/" 2>/dev/null)
if [ "$CODE" = "200" ]; then echo "server:alive"; exit 0; fi

# Bu repoya ait kalmış next süreçlerini temizle (cwd eşleşmesiyle)
for pid in $(pgrep -f "next dev -p $PORT" 2>/dev/null) $(pgrep -f "next-server" 2>/dev/null); do
  [ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" = "$(pwd)" ] && kill -9 "$pid" 2>/dev/null
done
sleep 1

nohup bun run dev >> dev.log 2>&1 &

for i in $(seq 1 60); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://localhost:$PORT/" 2>/dev/null)
  if [ "$CODE" = "200" ]; then echo "server:restarted"; exit 0; fi
done
echo "server:failed"
exit 1
