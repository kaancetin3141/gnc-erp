#!/bin/bash
# ============================================================
# GNC CRM mini-service bekçisi
# chat-service (3003), appointment-reminders (3011), cron-automation (3010)
# PORT tabanlı sağlık kontrolü yapar; ölmüşse yeniden başlatır.
# Not: sandbox resume sonrası `bun run dev` node_modules'ı yeniden
# kurarken child erken başlayıp import hatasıyla zombie kalabiliyor;
# bu yüzden süreç değil, servisin HEALTH PORT'u kontrol edilir.
# Cron ile 30 dakikada bir çağrılır (fixed_rate).
# ============================================================
BASE="/home/z/my-project/mini-services"
RESTARTED=""

# --- Env self-healing: sandbox resume bazen .env dosyalarını geri sarıyor ---
if [ -f "$BASE/../scripts/.cron-env" ]; then
  SECRET_LINE=$(grep CRON_SECRET "$BASE/../scripts/.cron-env" | head -1)
  # 1) ana .env
  if [ -f "$BASE/../.env" ] && ! grep -q CRON_SECRET "$BASE/../.env"; then
    echo "$SECRET_LINE" >> "$BASE/../.env"
  fi
  # 2) appointment-reminders/.env
  if [ ! -f "$BASE/appointment-reminders/.env" ]; then
    printf '%s\nAPP_URL=http://localhost:3000\n' "$SECRET_LINE" > "$BASE/appointment-reminders/.env"
    chmod 600 "$BASE/appointment-reminders/.env"
  fi
fi

port_alive() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; }
  return 1
}

ensure() {
  local name="$1" port="$2" dir="$BASE/$1" attempt
  if [ ! -d "$dir" ]; then return; fi
  if port_alive "$port"; then return; fi
  # 3 deneme: her başlatmadan sonra portu bekle (max ~20 sn)
  for attempt in 1 2 3; do
    (cd "$dir" && nohup bun run dev > /home/z/my-project/logs/$name.log 2>&1 &)
    for i in $(seq 1 10); do
      sleep 2
      port_alive "$port" && return
    done
  done
  RESTARTED="$RESTARTED $name(SORUNLU:$port)"
  return
}

ensure chat-service 3003
ensure appointment-reminders 3011
ensure cron-automation 3010

if [ -n "$RESTARTED" ]; then
  echo "OK: yeniden başlatıldı:$RESTARTED"
else
  echo "OK: tüm mini servisler çalışıyor"
fi
