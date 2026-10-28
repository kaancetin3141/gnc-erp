#!/bin/bash
# Üyelik + sanal personel E2E testleri
set -u
CRM=http://127.0.0.1:3000
CP=http://127.0.0.1:3002
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }
jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(\"d$1\"))" 2>/dev/null; }

echo "== 0) CRM ayakta mı =="
code=$(curl -s -m 8 -o /dev/null -w '%{http_code}' $CRM/api/public/providers)
[ "$code" = "200" ] && ok "CRM 200" || bad "CRM $code"

echo "== 1) Member register =="
R=$(curl -s -m 10 -X POST $CRM/api/public/member/register -H 'content-type: application/json' \
  -d '{"name":"Test Uye E2E","phone":"0555 999 88 77","password":"test1234"}')
TOKEN=$(echo "$R" | jqget "['token']")
echo "$R" | head -c 200; echo
[ -n "$TOKEN" ] && ok "register token alındı" || bad "register: $R"

echo "== 2) Aynı telefonla tekrar kayıt → 409 =="
code=$(curl -s -m 10 -o /tmp/reg2.json -w '%{http_code}' -X POST $CRM/api/public/member/register -H 'content-type: application/json' \
  -d '{"name":"Test Uye E2E","phone":"+90 555 999 88 77","password":"test1234"}')
grep -q "zaten" /tmp/reg2.json && ok "dup kayıt reddedildi (409 body)" || bad "dup kayıt: $code $(cat /tmp/reg2.json)"

echo "== 3) Login (yanlış şifre → 401) =="
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST $CRM/api/public/member/login -H 'content-type: application/json' \
  -d '{"phone":"05559998877","password":"yanlissifre"}')
[ "$code" = "401" ] && ok "yanlış şifre 401" || bad "yanlış şifre: $code"

echo "== 4) Login (doğru şifre) =="
L=$(curl -s -m 10 -X POST $CRM/api/public/member/login -H 'content-type: application/json' \
  -d '{"phone":"05559998877","password":"test1234"}')
TOKEN2=$(echo "$L" | jqget "['token']")
[ -n "$TOKEN2" ] && ok "login token" || bad "login: $L"

echo "== 5) me (Bearer) =="
M=$(curl -s -m 10 $CRM/api/public/member/me -H "authorization: Bearer $TOKEN2")
echo "$M" | grep -q '"name":"Test Uye E2E"' && ok "me profil" || bad "me: $M"

echo "== 6) me (token'sız → 401) =="
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' $CRM/api/public/member/me)
[ "$code" = "401" ] && ok "me anonim 401" || bad "me anonim: $code"

echo "== 7) Sanal personel: personelsiz işletmede slotlar =="
NOSTAFF=$(curl -s -m 10 "$CRM/api/public/providers" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for it in d.get('items',[]):
    if not it.get('services'): continue
    print(it['slug'], it['id'])
    break
")
SLUG=$(echo $NOSTAFF | cut -d' ' -f1)
PID2=$(echo $NOSTAFF | cut -d' ' -f2)
echo "  test işletmesi: $SLUG ($PID2)"
SVC=$(curl -s -m 10 "$CRM/api/public/providers/$SLUG" | python3 -c "import sys,json;d=json.load(sys.stdin);svcs=d.get('services',[]);print(svcs[0]['id'] if svcs else '')")
DATE=$(date -d "+3 days" +%Y-%m-%d)
AV=$(curl -s -m 10 "$CRM/api/public/providers/$SLUG/availability?date=$DATE&serviceId=$SVC")
FREE=$(echo "$AV" | python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for s in d.get('slots',[]) if s['available']))")
echo "  müsait slot sayısı: $FREE"
if [ "${FREE:-0}" -gt 0 ]; then ok "sanal mod: $FREE müsait slot"; else bad "sanal mod çalışmıyor: $(echo $AV | head -c 400)"; fi

echo "== 8) Sanal modda randevu oluştur =="
TIME=$(echo "$AV" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((s['time'] for s in d['slots'] if s['available']),''))")
B=$(curl -s -m 15 -X POST $CRM/api/public/appointments -H 'content-type: application/json' \
  -d "{\"providerSlug\":\"$SLUG\",\"serviceId\":\"$SVC\",\"staffId\":null,\"date\":\"$DATE\",\"time\":\"$TIME\",\"customerName\":\"Sanal Test Musteri\",\"customerPhone\":\"0555 999 88 77\"}")
echo "$B" | grep -q '"status"' && ok "sanal mod randevu: $(echo $B | jqget "['status']")" || bad "sanal randevu: $(echo $B | head -c 300)"
APPT_ID=$(echo "$B" | jqget "['id']")

echo "== 9) Üye randevularım (telefon eşleşmesi) =="
A=$(curl -s -m 10 $CRM/api/public/member/appointments -H "authorization: Bearer $TOKEN2")
CNT=$(echo "$A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("items",[])))' 2>/dev/null)
echo "$A" | grep -q '"id"' && ok "randevularım listelendi ($CNT adet)" || bad "randevularım boş: $(echo $A | head -c 300)"

echo "== 10) Randevu iptali (üye kendi randevusu) =="
C=$(curl -s -m 10 -X POST $CRM/api/public/member/appointments/$APPT_ID/cancel -H "authorization: Bearer $TOKEN2")
echo "$C" | grep -q '"status":"iptal"' && ok "randevu iptal edildi" || bad "iptal: $(echo $C | head -c 300)"

echo "== 11) customer-page proxy: /uyelik sayfası =="
code=$(curl -s -m 10 -o /tmp/uyelik.html -w '%{http_code}' $CP/uyelik)
grep -q "Randevularım" /tmp/uyelik.html && grep -q "member.js" /tmp/uyelik.html && ok "/uyelik sayfası render" || bad "/uyelik: $code"

echo "== 12) customer-page proxy: member login =="
P=$(curl -s -m 10 -X POST $CP/api/member/login -H 'content-type: application/json' -d '{"phone":"05559998877","password":"test1234"}')
echo "$P" | grep -q '"token"' && ok "proxy login" || bad "proxy login: $(echo $P | head -c 200)"

echo "== 13) customer-page proxy: member me (Authorization iletimi) =="
PM=$(curl -s -m 10 $CP/api/member/me -H "authorization: Bearer $TOKEN2")
echo "$PM" | grep -q '"name":"Test Uye E2E"' && ok "proxy me" || bad "proxy me: $(echo $PM | head -c 200)"

echo "== 14) 404 sayfası: olmayan işletme =="
code=$(curl -s -m 10 -o /tmp/nf.html -w '%{http_code}' "$CP/isletme/rastgele-olmayan-isletme-xyz")
grep -q "Aradığın işletmeyi bulamadık" /tmp/nf.html && ok "404 sayfası render ($code)" || bad "404 sayfası: $code"
grep -q "nf-grid" /tmp/nf.html && ok "404 önerileri var" || echo "  (öneri boş olabilir — işletme listesi)"
grep -q "nf-search" /tmp/nf.html && ok "404 arama formu var" || bad "404 arama formu yok"

echo "== 15) Ana sayfa üyelik butonu =="
curl -s -m 10 $CP/ > /tmp/home.html
grep -q 'member-btn' /tmp/home.html && ok "ana sayfa üye butonu" || bad "ana sayfa üye butonu yok"
curl -s -m 10 $CP/assets/member.js | head -c 60 | grep -q "gnc_member\|use strict" && ok "member.js servis" || bad "member.js yok"

echo
echo "SONUÇ: PASS=$PASS FAIL=$FAIL"
# (end of file)
