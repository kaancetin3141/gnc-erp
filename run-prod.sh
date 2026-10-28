#!/bin/bash
while true; do
  pkill -9 -f "node.*server.js" 2>/dev/null
  sleep 1
  cd /home/z/my-project/.next/standalone
  PORT=3000 NODE_ENV=production node server.js > /home/z/my-project/server.log 2>&1
  echo "[$(date)] Server died, restarting..." >> /home/z/my-project/watchdog.log
  sleep 2
done
