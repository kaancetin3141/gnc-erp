#!/bin/bash
# Sunucu ayaktaysa geç, değilse başlat ve bekle
CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 3 http://localhost:3000/ 2>/dev/null)
if [ "$CODE" = "200" ]; then echo "server:alive"; exit 0; fi
pkill -9 -f "next dev" 2>/dev/null; pkill -9 -f "next-server" 2>/dev/null
sleep 1
cd /home/z/my-project
nohup bun run dev >> dev.log 2>&1 &
for i in $(seq 1 40); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 3 http://localhost:3000/ 2>/dev/null)
  if [ "$CODE" = "200" ]; then echo "server:restarted"; exit 0; fi
done
echo "server:failed"
exit 1
