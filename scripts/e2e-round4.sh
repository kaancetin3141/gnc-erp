#!/bin/bash
# GNC CRM — Tur 4 E2E: Kasa transferi + Üyelik hatırlatma + Sadakat arama + Döviz widget
BASE="http://localhost:3000"
JAR="/tmp/gnc-e2e-r4.txt"
PASS=0; FAIL=0

say() { echo "[$1] $2"; }
check() {
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); say "PASS" "$1"
  else FAIL=$((FAIL+1)); say "FAIL" "$1 → $(echo "$3" | head -c 300)"; fi
}
jqget() { echo "$1" | python3 -c "import sys,json;print(json.load(sys.stdin)$2)" 2>/dev/null; }
# kullanım: jqget "$R" "['items'][0]['id']"  (baştaki NOKTA YOK — python sözdizimi)

rm -f "$JAR"

# ─── 1. Login (tenant admin) ───
R=$(curl -s -c "$JAR" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"email":"demo@anadolu.com","password":"1234"}')
check "login" '"user"' "$R"

# ─── 2. Döviz widget (gerçek API + offline fallback) ───
R=$(curl -s -b "$JAR" "$BASE/api/widgets" --max-time 25)
check "widgets-currency" 'USD' "$R"
SRC=$(jqget "$R" "['currency']['source']")
if [ "$SRC" = "er-api" ] || [ "$SRC" = "frankfurter" ] || [ "$SRC" = "offline" ]; then
  PASS=$((PASS+1)); say "PASS" "widgets-source ($SRC)"
else
  FAIL=$((FAIL+1)); say "FAIL" "widgets-source → '$SRC'"
fi

# ─── 3. Kasa: hesap listesi + bakiye anlık görüntüsü ───
R=$(curl -s -b "$JAR" "$BASE/api/cash/accounts")
check "cash-accounts-list" '"items"' "$R"
ACC_A=$(jqget "$R" "['items'][0]['id']")
ACC_B=$(jqget "$R" "['items'][1]['id']")
BAL_A=$(jqget "$R" "['items'][0]['balance']")
CUR_A=$(jqget "$R" "['items'][0]['currency']")
CUR_B=$(jqget "$R" "['items'][1]['currency']")
say "INFO" "hesapA=$ACC_A (bakiye=$BAL_A, $CUR_A) hesapB=$ACC_B ($CUR_B)"

# ─── 4. Transfer: aynı para birimi iki hesap ───
if [ -n "$ACC_A" ] && [ -n "$ACC_B" ] && [ "$ACC_A" != "$ACC_B" ] && [ "$CUR_A" = "$CUR_B" ]; then
  R=$(curl -s -b "$JAR" -X POST "$BASE/api/cash/transfer" -H 'Content-Type: application/json' \
    -d "{\"fromAccountId\":\"$ACC_A\",\"toAccountId\":\"$ACC_B\",\"amount\":250,\"description\":\"E2E tur4 transfer testi\"}")
  check "transfer-create" 'groupId' "$R"
  TR_GROUP=$(jqget "$R" "['groupId']")

  # Bakiye doğrulama: A -250, B +250
  R2=$(curl -s -b "$JAR" "$BASE/api/cash/accounts")
  NEW_A=$(jqget "$R2" "['items'][0]['balance']")
  NEW_B=$(jqget "$R2" "['items'][1]['balance']")
  say "INFO" "transfer sonrası: A=$NEW_A (önce $BAL_A), B=$NEW_B"
  DIFF=$(python3 -c "print(1 if abs(($NEW_A)-($BAL_A-250))<0.01 else 0)" 2>/dev/null)
  if [ "$DIFF" = "1" ]; then PASS=$((PASS+1)); say "PASS" "transfer-balance-src-250"
  else FAIL=$((FAIL+1)); say "FAIL" "transfer-balance-src-250 ($BAL_A→$NEW_A)"; fi
  DIFFB=$(python3 -c "print(1 if abs(($NEW_B)-($BAL_A+250))<0.01 else 0)" 2>/dev/null)
  if [ "$DIFFB" = "1" ]; then PASS=$((PASS+1)); say "PASS" "transfer-balance-dst-250"
  else FAIL=$((FAIL+1)); say "FAIL" "transfer-balance-dst-250 (→$NEW_B)"; fi

  # Transfer bacakları hareket listesinde görünmeli
  R=$(curl -s -b "$JAR" "$BASE/api/cash/transactions?accountId=$ACC_A&take=10")
  check "transfer-out-leg-visible" 'E2E tur4 transfer testi' "$R"

  # Hatalı: aynı hesaba transfer
  R=$(curl -s -b "$JAR" -X POST "$BASE/api/cash/transfer" -H 'Content-Type: application/json' \
    -d "{\"fromAccountId\":\"$ACC_A\",\"toAccountId\":\"$ACC_A\",\"amount\":10,\"description\":\"aynı hesap\"}")
  check "transfer-same-account-rejected" 'aynı olamaz' "$R"

  # Hatalı: negatif tutar
  R=$(curl -s -b "$JAR" -X POST "$BASE/api/cash/transfer" -H 'Content-Type: application/json' \
    -d "{\"fromAccountId\":\"$ACC_A\",\"toAccountId\":\"$ACC_B\",\"amount\":-5,\"description\":\"negatif\"}")
  check "transfer-negative-rejected" 'Geçersiz tutar' "$R"
else
  say "SKIP" "transfer (2 hesap/aynı kur gerekli; A=$CUR_A B=$CUR_B)"
fi

# ─── 5. Sadakat: canlı arama (POS lookup) ───
R=$(curl -s -b "$JAR" "$BASE/api/loyalty/accounts?q=Zeynep")
check "loyalty-lookup-by-name" '"items"' "$R"
R=$(curl -s -b "$JAR" "$BASE/api/loyalty/accounts")
check "loyalty-list-all" '"items"' "$R"

# ─── 6. Üyelik hatırlatma (yanlış hariç — gerçek tarama) ───
R=$(curl -s -b "$JAR" -X POST "$BASE/api/automation/membership-reminders" -H 'Content-Type: application/json' -d '{"days":30}')
check "membership-reminders-run" 'scanned' "$R"
say "INFO" "hatırlatma: $(echo "$R" | head -c 250)"

# Tekrar çalıştır — remindedAt işaretlendiği için 0 dönmeli
R=$(curl -s -b "$JAR" -X POST "$BASE/api/automation/membership-reminders" -H 'Content-Type: application/json' -d '{"days":30}')
SCANNED=$(jqget "$R" "['scanned']")
if [ "$SCANNED" = "0" ]; then PASS=$((PASS+1)); say "PASS" "membership-reminders-dedupe"
else FAIL=$((FAIL+1)); say "FAIL" "membership-reminders-dedupe → scanned=$SCANNED"; fi

# ─── 7. Yetkisiz erişim ───
R=$(curl -s "$BASE/api/cash/accounts")
check "unauth-401" 'Oturum' "$R"

echo ""
echo "════════ TUR 4 SONUÇ: $PASS PASS / $FAIL FAIL ════════"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
