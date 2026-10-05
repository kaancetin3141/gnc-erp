#!/bin/bash
# GNC CRM — yeni modüller E2E API testi (İK + Destek Masası + Admin)
BASE="http://localhost:3000"
JAR="/tmp/gnc-e2e-cookies.txt"
PASS=0; FAIL=0

say() { echo "[$1] $2"; }
check() { # check <isim> <beklenen-ic chunk> <yanit>
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); say "PASS" "$1"
  else FAIL=$((FAIL+1)); say "FAIL" "$1 → $3"; fi
}

rm -f "$JAR"

# ─── 1. Superadmin login (Program Admini) ───
R=$(curl -s -c "$JAR" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"email":"program.admin@gnccrm.app","password":"1234"}')
check "superadmin-login" '"user"' "$R"

# ─── 2. İK: boş liste + demo yükle ───
R=$(curl -s -b "$JAR" "$BASE/api/hr/employees")
check "hr-employees-empty" '"items"' "$R"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/hr/demo")
check "hr-demo-load" 'success' "$R"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/hr/demo")
check "hr-demo-409-repeat" '409\|mevcut' "$R"
R=$(curl -s -b "$JAR" "$BASE/api/hr/employees")
check "hr-employees-list" 'Ayşe Yılmaz' "$R"
check "hr-employees-summary" 'monthlyPayroll' "$R"

# ─── 3. İK: personel CRUD ───
R=$(curl -s -b "$JAR" -X POST "$BASE/api/hr/employees" -H 'Content-Type: application/json' \
  -d '{"name":"Test Kişi","position":"Denetçi","department":"Test","monthlySalary":"25000"}')
check "hr-employee-create" 'Test Kişi' "$R"
EMP_ID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/hr/employees/$EMP_ID" -H 'Content-Type: application/json' \
  -d '{"position":"Kıdemli Denetçi","status":"passive"}')
check "hr-employee-patch" 'Kıdemli Denetçi' "$R"
R=$(curl -s -b "$JAR" -X DELETE "$BASE/api/hr/employees/$EMP_ID")
check "hr-employee-delete" 'success\|deleted' "$R"

# ─── 4. İK: izin talebi + karar ───
LEAVES=$(curl -s -b "$JAR" "$BASE/api/hr/leaves")
check "hr-leaves-list" 'items' "$LEAVES"
EMP0=$(curl -s -b "$JAR" "$BASE/api/hr/employees" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['id'])" 2>/dev/null)
R=$(curl -s -b "$JAR" -X POST "$BASE/api/hr/leaves" -H 'Content-Type: application/json' \
  -d "{\"employeeId\":\"$EMP0\",\"type\":\"yillik\",\"startDate\":\"2026-10-12\",\"endDate\":\"2026-10-16\",\"reason\":\"E2E test\"}")
check "hr-leave-create" 'pending' "$R"
LEAVE_ID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/hr/leaves/$LEAVE_ID" -H 'Content-Type: application/json' \
  -d '{"action":"approve","decisionNote":"E2E onay"}')
check "hr-leave-approve" 'approved' "$R"
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/hr/leaves/$LEAVE_ID" -H 'Content-Type: application/json' -d '{"action":"reject"}')
check "hr-leave-double-decision-409" 'karara\|409\|zaten' "$R"

# ─── 5. İK: vardiya ───
R=$(curl -s -b "$JAR" -X POST "$BASE/api/hr/shifts" -H 'Content-Type: application/json' \
  -d "{\"employeeId\":\"$EMP0\",\"date\":\"2026-10-08\",\"startTime\":\"09:00\",\"endTime\":\"18:00\"}")
check "hr-shift-create" 'startTime' "$R"
SHIFT_ID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
R=$(curl -s -b "$JAR" "$BASE/api/hr/shifts?from=2026-10-01&to=2026-10-31")
check "hr-shift-list" 'items' "$R"
R=$(curl -s -b "$JAR" -X DELETE "$BASE/api/hr/shifts/$SHIFT_ID")
check "hr-shift-delete" 'success\|deleted' "$R"

# ─── 6. Destek Masası ───
R=$(curl -s -b "$JAR" "$BASE/api/tickets")
check "tickets-empty-or-list" 'items' "$R"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/tickets/demo")
check "tickets-demo-load" 'success' "$R"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/tickets" -H 'Content-Type: application/json' \
  -d '{"subject":"E2E test talebi","description":"otomatik test","category":"teknik","priority":"high"}')
check "ticket-create" 'TRK-' "$R"
TICKET_ID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
R=$(curl -s -b "$JAR" "$BASE/api/tickets/$TICKET_ID")
check "ticket-detail" 'comments' "$R"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/tickets/$TICKET_ID/comments" -H 'Content-Type: application/json' \
  -d '{"body":"E2E yanıt","internal":true}')
check "ticket-comment-internal" 'dahili\|internal' "$R"
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/tickets/$TICKET_ID" -H 'Content-Type: application/json' \
  -d '{"status":"resolved"}')
check "ticket-resolve" 'resolved' "$R"
R=$(curl -s -b "$JAR" "$BASE/api/tickets?q=E2E")
check "ticket-search" 'E2E test talebi' "$R"

# ─── 7. Admin paneli API (admin.access/users.manage superadmin'de var) ───
R=$(curl -s -b "$JAR" "$BASE/api/admin/overview")
check "admin-overview" 'customerByType\|stats\|system' "$R"

# ─── 8. Yetkisiz erişim — oturumsuz istek 401 olmalı ───
R=$(curl -s "$BASE/api/hr/employees")
check "hr-unauthed-401" '401\|Oturum' "$R"
R=$(curl -s "$BASE/api/tickets")
check "tickets-unauthed-401" '401\|Oturum' "$R"

echo "=============================="
echo "SONUÇ: PASS=$PASS FAIL=$FAIL"
