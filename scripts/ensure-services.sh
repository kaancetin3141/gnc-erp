#!/bin/bash
# ============================================================
# GNC CRM mini-service bekçisi
# chat-service (3003), appointment-reminders, cron-automation
# süreçlerini kontrol eder; ölmüşse yeniden başlatır.
# Cron ile 30 dakikada bir çağrılır (fixed_rate).
# ============================================================
BASE="/home/z/my-project/mini-services"
RESTARTED=""

ensure() {
  local name="$1" dir="$BASE/$1"
  if [ ! -d "$dir" ]; then return; fi
  # cwd'si bu dizin olan çalışan bir bun süreci var mı?
  if pgrep -f "bun --hot index.ts" | while read pid; do
      [ "$(readlink /proc/$pid/cwd 2>/dev/null)" = "$dir" ] && echo ok
    done | grep -q ok; then
    return
  fi
  (cd "$dir" && nohup bun run dev > /tmp/$name.log 2>&1 &)
  RESTARTED="$RESTARTED $name"
}

ensure chat-service
ensure appointment-reminders
ensure cron-automation

if [ -n "$RESTARTED" ]; then
  echo "OK: yeniden başlatıldı:$RESTARTED"
else
  echo "OK: tüm mini servisler çalışıyor"
fi
