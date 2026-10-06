#!/usr/bin/env bash
# E2E test — Tur 3: kasa transferi, üyelik hatırlatma, sadakat, vardiya, yetkisiz erişim
# Kullanım: bash scripts/e2e-round3.sh
set -u
BASE="http://localhost:3000"
JAR="/tmp/gnc-e2e-r3-cookies.txt"
PASS=0; FAIL=0
rm -f "$JAR"

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS: $1"
  else FAIL=$((FAIL+1)); echo "FAIL: $1 (beklenen=$2, gelen=$3)"; fi
}

jqget() { echo "$1" | python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(\"d$2\"))" 2>/dev/null; }

# HTTP status + body birlikte
req() { # method, path, body(yoksa -)
  local m=$1 p=$2 b=$3
  if [ "$b" = "-" ]; then
    curl -s -w "\n%{http_code}" -b "$JAR" -X "$m" "$BASE$p"
  else
    curl -s -w "\n%{http_code}" -b "$JAR" -X "$m" "$BASE$p" -H 'Content-Type: application/json' -d "$b"
  fi
}

# ── 1. Login (demo tenant admin) ──
LOGIN=$(curl -s -c "$JAR" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"email":"demo@anadolu.com","password":"1234"}')
UID_LEN=${#LOGIN}
check "login (cevap geldi)" "0" "$(python3 -c "print(0 if $UID_LEN > 100 else 1)")"

# ── KASA TRANSFERİ ──
ACC=$(req GET "/api/cash/accounts" -)
ACC_STATUS=$(echo "$ACC" | tail -1); ACC_BODY=$(echo "$ACC" | sed '$d')
check "hesap listesi 200" "200" "$ACC_STATUS"

ACC1=$(jqget "$ACC_BODY" "['items'][0]['id']")
ACC2=$(jqget "$ACC_BODY" "['items'][1]['id']")

# 2 hesap yoksa oluştur (E2E izolasyonu)
if [ -z "$ACC1" ]; then
  CA=$(req POST "/api/cash/accounts" '{"name":"E2E Kasa 1","type":"kasa","initialBalance":1000}')
  check "hesap 1 oluşturma 201" "201" "$(echo "$CA" | tail -1)"
  ACC1=$(echo "$CA" | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
fi
if [ -z "$ACC2" ]; then
  CB=$(req POST "/api/cash/accounts" '{"name":"E2E Banka 1","type":"banka","initialBalance":500}')
  check "hesap 2 oluşturma 201" "201" "$(echo "$CB" | tail -1)"
  ACC2=$(echo "$CB" | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
fi
echo "  hesap1=$ACC1 hesap2=$ACC2"

# hesaplar oluşturulduysa güncel listeyi yeniden çek
if [ -n "$ACC1" ]; then
  ACC=$(req GET "/api/cash/accounts" -)
  ACC_BODY=$(echo "$ACC" | sed '$d')
fi

if [ -n "$ACC1" ] && [ -n "$ACC2" ] && [ "$ACC1" != "$ACC2" ]; then
  BAL1_BEFORE=$(echo "$ACC_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items={i['id']:i['balance'] for i in d['items']}
print(items.get('$ACC1'))")
  BAL2_BEFORE=$(echo "$ACC_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items={i['id']:i['balance'] for i in d['items']}
print(items.get('$ACC2'))")

  # aynı hesaba transfer reddi
  SAME=$(req POST "/api/cash/transfer" "{\"fromAccountId\":\"$ACC1\",\"toAccountId\":\"$ACC1\",\"amount\":10,\"description\":\"test\"}")
  check "aynı hesaba transfer 400" "400" "$(echo "$SAME" | tail -1)"

  # geçerli transfer
  TR=$(req POST "/api/cash/transfer" "{\"fromAccountId\":\"$ACC1\",\"toAccountId\":\"$ACC2\",\"amount\":250,\"description\":\"E2E kasa transferi\"}")
  TR_STATUS=$(echo "$TR" | tail -1); TR_BODY=$(echo "$TR" | sed '$d')
  check "transfer oluşturma 201" "201" "$TR_STATUS"
  OUTID=$(jqget "$TR_BODY" "['out']['id']")

  ACC_NOW=$(req GET "/api/cash/accounts" -)
  ACC_NOW_BODY=$(echo "$ACC_NOW" | sed '$d')
  BAL1_NEW=$(echo "$ACC_NOW_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items={i['id']:i['balance'] for i in d['items']}
print(items.get('$ACC1'))")
  BAL2_NEW=$(echo "$ACC_NOW_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items={i['id']:i['balance'] for i in d['items']}
print(items.get('$ACC2'))")
  check "kaynak bakiye -250" "$(python3 -c "print(round($BAL1_BEFORE-250,2))")" "$BAL1_NEW"
  check "hedef bakiye +250" "$(python3 -c "print(round($BAL2_BEFORE+250,2))")" "$BAL2_NEW"

  # iki bacak da listede transfer refType + bu koşunun groupId'si ile
  GROUP=$(jqget "$TR_BODY" "['groupId']")
  TXS=$(req GET "/api/cash/transactions?limit=20" -)
  LEGS=$(echo "$TXS" | sed '$d' | python3 -c "
import sys,json
d=json.load(sys.stdin)
legs=[t for t in d['items'] if t.get('refType')=='transfer' and t.get('refId')=='$GROUP']
print(len(legs))")
  check "transfer 2 bacak (bu koşu)" "2" "$LEGS"

  # bir bacağı sil → ikisi de silinmeli
  DEL=$(req DELETE "/api/cash/transactions/$OUTID" -)
  DEL_BODY=$(echo "$DEL" | sed '$d')
  check "transfer bacak silme 200" "200" "$(echo "$DEL" | tail -1)"
  check "çift silme deleted=2" "2" "$(jqget "$DEL_BODY" "['deleted']")"
  ACC_FINAL=$(req GET "/api/cash/accounts" -)
  BAL1_RESTORED=$(echo "$ACC_FINAL" | sed '$d' | python3 -c "
import sys,json
d=json.load(sys.stdin)
items={i['id']:i['balance'] for i in d['items']}
print(items.get('$ACC1'))")
  check "silme sonrası bakiye geri" "$(python3 -c "print(round($BAL1_BEFORE,2))")" "$BAL1_RESTORED"
else
  echo "SKIP: 2 hesap yok — transfer testleri atlandı"
fi

# ── ÜYELİK HATIRLATMA ──
REM=$(req POST "/api/automation/membership-reminders" '{"days":3}')
check "hatırlatma API 200" "200" "$(echo "$REM" | tail -1)"
REM_BODY=$(echo "$REM" | sed '$d')
echo "  sonuç: scanned=$(jqget "$REM_BODY" "['scanned']") emailed=$(jqget "$REM_BODY" "['emailed']") tasks=$(jqget "$REM_BODY" "['tasksCreated']")"

# idempotentlik — ikinci çağrı 0 hatırlatmalı
REM2=$(req POST "/api/automation/membership-reminders" '{"days":3}')
check "hatırlatma idempotent" "0" "$(echo "$REM2" | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin).get('reminded',0))")"

# ── SADAKAT ──
LOY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/loyalty/accounts?q=a")
check "sadakat listesi 200" "200" "$LOY_STATUS"

# ── VARDİYA ──
TODAY=$(date +%F)
NEXTWEEK=$(date -d "+6 days" +%F 2>/dev/null || date -v+6d +%F)
EMPS=$(req GET "/api/hr/employees" -)
EMP1=$(echo "$EMPS" | sed '$d' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['items'][0]['id'] if d['items'] else '')" 2>/dev/null)
if [ -n "$EMP1" ]; then
  SHIFT=$(req POST "/api/hr/shifts" "{\"employeeId\":\"$EMP1\",\"date\":\"$TODAY\",\"startTime\":\"09:00\",\"endTime\":\"17:00\",\"note\":\"E2E\"}")
  check "vardiya oluşturma 201" "201" "$(echo "$SHIFT" | tail -1)"
  SID=$(echo "$SHIFT" | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  # geçersiz saat
  BAD=$(req POST "/api/hr/shifts" "{\"employeeId\":\"$EMP1\",\"date\":\"$TODAY\",\"startTime\":\"18:00\",\"endTime\":\"09:00\"}")
  check "vardiya saat kontrolü 400" "400" "$(echo "$BAD" | tail -1)"
  # haftalık liste
  WEEK=$(req GET "/api/hr/shifts?from=$TODAY&to=$NEXTWEEK" -)
  check "haftalık vardiya listesi 200" "200" "$(echo "$WEEK" | tail -1)"
  # sil
  if [ -n "$SID" ]; then
    DELS=$(req DELETE "/api/hr/shifts/$SID" -)
    check "vardiya silme 200" "200" "$(echo "$DELS" | tail -1)"
  fi
else
  echo "SKIP: personel yok — vardiya testleri atlandı"
fi

# ── YETKİSİZ ERİŞİM ──
NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/cash/transfer" -H 'Content-Type: application/json' -d '{}')
check "transfer oturumsuz 401" "401" "$NOAUTH"

echo "────────────────────"
echo "SONUÇ: $PASS PASS, $FAIL FAIL"
rm -f "$JAR"
[ "$FAIL" = "0" ]
