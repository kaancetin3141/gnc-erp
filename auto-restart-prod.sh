#!/bin/bash
cd /home/z/my-project/.next/standalone
while true; do
  PORT=3000 NODE_ENV=production node server.js > /home/z/my-project/server.log 2>&1 &
  PID=$!
  echo "[$(date)] Started prod server (PID: $PID)"
  wait $PID
  echo "[$(date)] Server died (exit: $?), restarting in 3s..."
  sleep 3
done
