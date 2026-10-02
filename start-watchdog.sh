#!/bin/bash
# GNC CRM — Watchdog script
# Next.js dev server'ı izler, çökerse otomatik yeniden başlatır

cd /home/z/my-project

MAX_RESTARTS=10
RESTART_COUNT=0
MIN_UPTIME=30  # saniye — bu süreden kısa sürede çökerse beklet

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  echo "[$(date)] === Next.js başlatılıyor (deneme $((RESTART_COUNT+1))/$MAX_RESTARTS) ==="
  
  # Önce esek process'leri temizle
  pkill -9 -f "next dev" 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
  sleep 2
  
  # Bellek temizle
  sync 2>/dev/null
  echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
  
  # Next.js'i başlat
  NODE_OPTIONS="--max-old-space-size=2560" NEXT_TELEMETRY_DISABLED=1 npx next dev -p 3000 > dev.log 2>&1 &
  NEXT_PID=$!
  echo "[$(date)] PID: $NEXT_PID"
  
  # Hazır olana kadar bekle
  sleep 15
  
  # Sağlıklı mı kontrol et
  START_TIME=$(date +%s)
  HEALTHY=0
  
  while true; do
    if ! kill -0 $NEXT_PID 2>/dev/null; then
      echo "[$(date)] ✗ Process öldü!"
      break
    fi
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://localhost:3000/ 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
      if [ $HEALTHY -eq 0 ]; then
        echo "[$(date)] ✓ Server sağlıklı (HTTP 200)"
        HEALTHY=1
      fi
      # Her 30 saniyede health check
      sleep 30
    else
      echo "[$(date)] ⚠ HTTP: $HTTP_CODE — bekleniyor..."
      sleep 10
    fi
    
    # Eğer process hala yaşıyorsa ve healthy ise, devam et
    if [ $HEALTHY -eq 1 ]; then
      CURRENT_TIME=$(date +%s)
      UPTIME=$((CURRENT_TIME - START_TIME))
      # Process hala çalışıyor — bu loop'ta kal, watchdog gibi
      continue
    fi
  done
  
  RESTART_COUNT=$((RESTART_COUNT+1))
  echo "[$(date)] Yeniden başlatılıyor... ($RESTART_COUNT/$MAX_RESTARTS)"
  sleep 5
done

echo "[$(date)] Maksimum yeniden başlatma sayısına ulaşıldı."
