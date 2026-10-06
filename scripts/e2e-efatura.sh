#!/bin/bash
# GNC CRM — Tur 4b E2E: e-Arşiv Fatura (GİB UBL-TR 1.2) XML üretimi
BASE="http://localhost:3000"
JAR="/tmp/gnc-e2e-r4.txt"
PASS=0; FAIL=0
say() { echo "[$1] $2"; }
check() {
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); say "PASS" "$1"
  else FAIL=$((FAIL+1)); say "FAIL" "$1 → $(echo "$3" | head -c 250)"; fi
}
jqget() { echo "$1" | python3 -c "import sys,json;print(json.load(sys.stdin)$2)" 2>/dev/null; }

# Login
R=$(curl -s -c "$JAR" -X POST "$BASE/api/auth" -H 'Content-Type: application/json' \
  -d '{"email":"demo@anadolu.com","password":"1234"}')
check "login" '"user"' "$R"

# 1) Fatura şablonuna şirket VKN + vergi dairesi yaz
R=$(curl -s -b "$JAR" -X PUT "$BASE/api/settings/invoice-template" -H 'Content-Type: application/json' \
  -d '{"companyName":"Anadolu Satış A.Ş.","taxNumber":"1234567801","taxOffice":"Beyoğlu","companyAddress":"Test Mah. No:1 İstanbul","companyPhone":"+905551112233","companyEmail":"muhasebe@anadolu.com"}')
check "template-set-vkn" 'success' "$R"

# 2) İlk faturanın müşterisine VKN ekle
INV_ID=$(curl -s -b "$JAR" "$BASE/api/invoices" | jqget "$R" "" 2>/dev/null)
INV_ID=$(curl -s -b "$JAR" "$BASE/api/invoices" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['id'])")
INV_NO=$(curl -s -b "$JAR" "$BASE/api/invoices" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['number'])")
CUST_ID=$(curl -s -b "$JAR" "$BASE/api/invoices/$INV_ID" | python3 -c "import sys,json;d=json.load(sys.stdin);c=d.get('invoice',d).get('customer');print(c['id'] if isinstance(c,dict) else '')")
say "INFO" "fatura=$INV_NO ($INV_ID) müşteri=$CUST_ID"
if [ -n "$CUST_ID" ]; then
  R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/customers/$CUST_ID" -H 'Content-Type: application/json' \
    -d '{"taxNumber":"9876543210"}')
  check "customer-set-vkn" 'success\|9876543210' "$R"
fi

# 3) e-Arşiv XML indir + well-formed doğrula
R=$(curl -s -b "$JAR" "$BASE/api/invoices/$INV_ID/einvoice" -D /tmp/efat-h.txt -o /tmp/efat.xml)
check "einvoice-http-200" '200' "$(head -1 /tmp/efat-h.txt)"
check "einvoice-attachment" 'earsiv_ubl.xml' "$(cat /tmp/efat-h.txt)"

V=$(python3 -c "
import xml.dom.minidom as m
d = m.parse('/tmp/efat.xml')
root = d.documentElement
def txt(tag):
    els = root.getElementsByTagName(tag)
    return els[0].firstChild.nodeValue if els and els[0].firstChild else ''
print('OK|' + txt('cbc:ID') + '|' + txt('cbc:ProfileID') + '|' + txt('cbc:UUID') + '|' + txt('cbc:PayableAmount'))
" 2>&1)
if echo "$V" | grep -q "^OK|"; then
  PASS=$((PASS+1)); say "PASS" "einvoice-xml-wellformed"
  IFS='|' read -r _ GIB PROF ETTN PAY <<< "$V"
  say "INFO" "GİB no=$GIB profile=$PROF ETTN=$ETTN payable=$PAY"
else
  FAIL=$((FAIL+1)); say "FAIL" "einvoice-xml-wellformed → $V"
fi

# 4) GİB numara formatı: 3 harf + 4 rakam yıl + 9 rakam = 16 karakter
N=$(python3 -c "
import xml.dom.minidom as m
root = m.parse('/tmp/efat.xml').documentElement
print(root.getElementsByTagName('cbc:ID')[0].firstChild.nodeValue)" 2>/dev/null)
if echo "$N" | grep -qE "^[A-Z]{3}[0-9]{13}$"; then PASS=$((PASS+1)); say "PASS" "gib-number-format ($N)"
else FAIL=$((FAIL+1)); say "FAIL" "gib-number-format → '$N'"; fi

# 5) VKN'ler XML'de görünüyor olmalı
R=$(cat /tmp/efat.xml)
check "company-vkn-in-xml" 'schemeID="VKN">1234567801' "$R"
check "customer-vkn-in-xml" 'schemeID="VKN">9876543210' "$R"

# 6) Uyarı header'ı artık OLMAMALI (her iki VKN girildi)
if grep -qi "x-efatura-warn" /tmp/efat-h.txt; then FAIL=$((FAIL+1)); say "FAIL" "no-warn-when-vkn-set"
else PASS=$((PASS+1)); say "PASS" "no-warn-when-vkn-set"; fi

# 7) Tutar tutarlılığı: PayableAmount == subtotal + taxTotal (API'den karşılaştır)
API_TOTAL=$(curl -s -b "$JAR" "$BASE/api/invoices/$INV_ID" | python3 -c "import sys,json;d=json.load(sys.stdin);i=d.get('invoice',d);print(i.get('total'))")
XML_PAY=$(echo "$PAY")
MATCH=$(python3 -c "print(1 if abs(($API_TOTAL)-($XML_PAY))<0.01 else 0)" 2>/dev/null)
if [ "$MATCH" = "1" ]; then PASS=$((PASS+1)); say "PASS" "amount-matches-api ($API_TOTAL)"
else FAIL=$((FAIL+1)); say "FAIL" "amount-matches-api (api=$API_TOTAL xml=$XML_PAY)"; fi

# 8) Yetkisiz erişim
R=$(curl -s "$BASE/api/invoices/$INV_ID/einvoice")
check "einvoice-unauth-401" 'Oturum' "$R"

# 9) Olmayan fatura → 404
R=$(curl -s -b "$JAR" "$BASE/api/invoices/olmayan-id-123/einvoice")
check "einvoice-404" 'bulunamadı' "$R"

echo ""
echo "════════ TUR 4b (e-Arşiv) SONUÇ: $PASS PASS / $FAIL FAIL ════════"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
