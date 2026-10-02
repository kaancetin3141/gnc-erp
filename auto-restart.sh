#!/bin/bash
# Simple auto-restart — Next.js dev server'ı çökerse yeniden başlat
cd /home/z/my-project

while true; do
  # Önce eski process'leri temizle
  pkill -9 -f "next dev" 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
  pkill -9 -f "npm exec next" 2>/dev/null
  sleep 2

  # Next.js'i başlat — bu sefer bash içinde, watchdog'la birlikte
  NEXT_DISABLE_TURBOPACK=1 NODE_OPTIONS="--max-old-space-size=2048" NEXT_TELEMETRY_DISABLED=1 npx next dev -p 3000 > dev.log 2>&1 &
  PID=$!
  echo "[$(date)] Started Next.js (PID: $PID)"

  # Process ölününe kadar bekle
  wait $PID
  echo "[$(date)] Process died (exit: $?), restarting in 5s..."
  sleep 5
done
