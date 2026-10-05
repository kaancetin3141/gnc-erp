#!/bin/bash
# GNC CRM — Tur 4c E2E: Üyelik yenileme (renew action)
BASE="http://localhost:3000"
JAR="/tmp/gnc-e2e-r4.txt"
PASS=0; FAIL=0
say() { echo "[$1] $2"; }
check() {
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); say "PASS" "$1"
  else FAIL=$((FAIL+1)); say "FAIL" "$1 → $(echo "$3" | head -c 250)"; fi
}
jget() { echo "$1" | python3 -c "import sys,json;print(json.load(sys.stdin)$2)" 2>/dev/null; }

# Login
R=$(curl -s -c "$JAR" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"email":"demo@anadolu.com","password":"1234"}')
check "login" '"user"' "$R"

# 1) Test paketi tanımla (validity 30 gün, 5 seans)
R=$(curl -s -b "$JAR" -X POST "$BASE/api/membership/packages" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Renew Paketi","description":"yenileme testi","price":1500,"sessionCount":5,"validityDays":30}')
check "package-create" '"id"\|E2E Renew' "$R"
PKG_ID=$(jget "$R" "['id']")

# 2) Satış yap
R=$(curl -s -b "$JAR" -X POST "$BASE/api/membership/subscriptions" -H 'Content-Type: application/json' \
  -d "{\"packageId\":\"$PKG_ID\",\"customerName\":\"E2E Yenile Müşteri\",\"customerPhone\":\"05559998877\"}")
check "sub-sell" 'E2E Yenile' "$R"
SUB_ID=$(jget "$R" "['id']")
say "INFO" "sub=$SUB_ID"

# 3) 2 seans düş
curl -s -b "$JAR" -X PATCH "$BASE/api/membership/subscriptions/$SUB_ID" -H 'Content-Type: application/json' -d '{"action":"use-session"}' > /dev/null
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/membership/subscriptions/$SUB_ID" -H 'Content-Type: application/json' -d '{"action":"use-session"}')
check "use-2-sessions" 'sessionsUsed' "$R"

# 4) Hatırlatma işaretle (remindedAt set olsun — renew sıfırlamalı)
curl -s -b "$JAR" -X POST "$BASE/api/automation/membership-reminders" -H 'Content-Type: application/json' \
  -d "{\"days\":30,\"subscriptionId\":\"$SUB_ID\"}" > /dev/null

# 5) YENİLE
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/membership/subscriptions/$SUB_ID" -H 'Content-Type: application/json' -d '{"action":"renew"}')
check "renew-ok" 'aktif' "$R"
NEW_USED=$(jget "$R" "['sessionsUsed']")
NEW_TOTAL=$(jget "$R" "['sessionsTotal']")
NEW_EXP=$(jget "$R" "['expiryDate']")
REM =$(jget "$R" "['remindedAt']")
say "INFO" "yenileme sonrası: used=$NEW_USED total=$NEW_TOTAL bitiş=$NEW_EXP"
if [ "$NEW_USED" = "0" ]; then PASS=$((PASS+1)); say "PASS" "renew-sessions-reset"
else FAIL=$((FAIL+1)); say "FAIL" "renew-sessions-reset → $NEW_USED"; fi
if [ "$NEW_TOTAL" = "5" ]; then PASS=$((PASS+1)); say "PASS" "renew-total-from-package"
else FAIL=$((FAIL+1)); say "FAIL" "renew-total-from-package → $NEW_TOTAL"; fi
# bitiş ~30 gün sonrası olmalı (kalan süreden devam: satış bugün + 30 gün + 30 gün)
DAYS_AHEAD=$(python3 -c "from datetime import datetime;print((datetime.fromisoformat('$NEW_EXP'.replace('Z','+00:00'))-datetime.now(datetime.timezone.utc)).days)" 2>/dev/null)
if [ "$DAYS_AHEAD" -ge 58 ] && [ "$DAYS_AHEAD" -le 61 ]; then PASS=$((PASS+1)); say "PASS" "renew-expiry-+30d ($DAYS_AHEAD gün)"
else FAIL=$((FAIL+1)); say "FAIL" "renew-expiry-+30d → $DAYS_AHEAD gün"; fi

# 6) Geçersiz action reddedilmeli
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/membership/subscriptions/$SUB_ID" -H 'Content-Type: application/json' -d '{"action":"hocus-pocus"}')
check "invalid-action-rejected" 'Geçersiz' "$R"

# 7) Kullanım geçmişinde yenileme notu
R=$(curl -s -b "$JAR" "$BASE/api/membership/subscriptions/$SUB_ID")
check "usage-renew-note" 'Yenileme' "$R"

# 8) Temizlik: test aboneliği + paketi sil
curl -s -b "$JAR" -X DELETE "$BASE/api/membership/subscriptions/$SUB_ID" > /dev/null
curl -s -b "$JAR" -X DELETE "$BASE/api/membership/packages/$PKG_ID" > /dev/null
PASS=$((PASS+1)); say "PASS" "cleanup"

echo ""
echo "════════ TUR 4c (Üyelik Yenileme) SONUÇ: $PASS PASS / $FAIL FAIL ════════"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
