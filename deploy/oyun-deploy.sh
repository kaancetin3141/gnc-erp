#!/bin/bash
# ============================================================
#  GNC OYUN — Ayrı GitHub repo'sundan oyun/proje deploy (v1.3 — env fix + doktor + .env sahipliği)
#
#  gnc-erp'ye ve DİĞER TÜM uygulamalara DOKUNMAZ:
#   - kod /var/www/oyunlar/<isim> altına klonlanır (kendi klasörü)
#   - kendi pm2 süreci (<isim>) olarak çalışır
#   - güncelleme YİNE kendi reponuzdan gelir (fetch + reset = repo kopyası)
#
#  Kullanım:
#   sudo gnc-oyun <repo-adresi> [port] [isim]    # ilk kurulum
#   sudo gnc-oyun <isim>                         # kayıtlı ayarlarla GÜNCELLE
#   sudo gnc-oyun liste                          # kurulmuşları listele
#   sudo gnc-oyun doktor <isim> [--tamir]        # teşhis (+ hızlı onarım: env'li yeniden başlatma)
#
#  v1.2 değişiklikleri:
#   - .env (DATABASE_URL vb.) artık pm2'ye GARANTİLİ aktarılıyor. v1.1'de sudo env_reset
#     değişkenleri silebiliyordu -> süreç ortamsız başlıyor, Prisma çöküyordu.
#   - "doktor" modu: pm2 durumu, süreç ortamı, dosyalar, port dinleyicisi, hata logları, RAM/disk
#   - sağlık kontrolü başarısızsa hata logları OTOMATİK yazdırılır; final bandı dürüst
#
#  v1.3 değişiklikleri:
#   - .env root:600 oluşturuluyordu -> ubuntu pm2 süreci okuyamıyordu (DATABASE_URL kaybı).
#     Artık .env her yolda RUN_USER'a devrediliyor (deploy + doktor --tamir + her app_start).
#
#  Örnek:
#   sudo gnc-oyun "https://KULLANICI:TOKEN@github.com/kullanici/oyun.git" 3001 meyvepatlat
#
#  Otomatik tip tespiti:
#   package.json + "start"  -> Node uygulaması (pm2, PORT=<port>)
#   + prisma/schema.prisma  -> .env (SQLite) + prisma generate + db push OTOMATİK
#   package.json + "build"  -> build alır, dist|build|out klasörünü servis eder
#   index.html              -> statik oyun (pm2 serve)
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[1;36m'; NC='\033[0m'
step(){ echo -e "\n${GREEN}==>${NC} $1"; }
info(){ echo -e "   $1"; }
warn(){ echo -e "${YELLOW}! UYARI:${NC} $1"; }
die(){ echo -e "${RED}HATA: $1${NC}"; exit 1; }

BASE_DIR="/var/www/oyunlar"
STATE=".gnc-oyun.conf"
export GIT_TERMINAL_PROMPT=0

[ "$(id -u)" -ne 0 ] && die "sudo ile çalıştırın: sudo gnc-oyun <repo-adresi> [port] [isim]"

# kendini /usr/local/bin'e tazele (repodan çalıştırıldıysa)
SELF="$(readlink -f "$0" 2>/dev/null || echo "$0")"
if [ -f /usr/local/bin/gnc-oyun ] && [ "$SELF" != "/usr/local/bin/gnc-oyun" ]; then
  cp "$SELF" /usr/local/bin/gnc-oyun 2>/dev/null || true
fi

# ---- pm2 hangi kullanıcıda? (ubuntu'nun daemon'ı varsa onu kullan) ----
RUN_USER="root"
if id -u ubuntu >/dev/null 2>&1 && sudo -u ubuntu pm2 jlist 2>/dev/null | grep -q '"name"'; then
  RUN_USER="ubuntu"
fi
pm2x(){ if [ "$RUN_USER" = "root" ]; then pm2 "$@"; else sudo -u ubuntu env PATH="$PATH" pm2 "$@"; fi; }

# Uygulamayı .env ortamıyla birlikte DOĞRU kullanıcının kabuğunda başlat.
# (sudo varsayılan env_reset yaptığı için DATABASE_URL pm2'ye ulaşmıyordu;
#  artık env hedef kullanıcının kabuğunda kaynaklanır -> pm2 client -> daemon -> süreç)
app_start(){ # $1=pm2 hedefi, kalan argümanlar aynen pm2'ye (ör: --name X --time [-- start])
  TARGET="$1"; shift
  if [ "$RUN_USER" != "root" ] && [ -f "$APP_DIR/.env" ]; then chown "$RUN_USER" "$APP_DIR/.env" 2>/dev/null || true; fi
  if [ "$RUN_USER" = "root" ]; then
    ( cd "$APP_DIR" || exit 1
      if [ -f .env ]; then set -a; . ./.env; set +a; fi
      NODE_ENV=production PORT="$PORT" pm2 start "$TARGET" "$@" )
  else
    sudo -u ubuntu bash -c "cd '$APP_DIR' || exit 1; if [ -f .env ]; then set -a; . ./.env; set +a; fi; NODE_ENV=production PORT='$PORT' pm2 start '$TARGET' $*"
  fi
}
app_restart_fresh(){ # doktor --tamir: build almadan, taze env ile yeniden başlat
  if [ "$RUN_USER" != "root" ] && [ -f "$APP_DIR/.env" ]; then chown "$RUN_USER" "$APP_DIR/.env" 2>/dev/null || true; fi
  if [ "$RUN_USER" = "root" ]; then
    ( cd "$APP_DIR" || exit 1
      if [ -f .env ]; then set -a; . ./.env; set +a; fi
      NODE_ENV=production PORT="$PORT" pm2 delete "$NAME" >/dev/null 2>&1 || true
      NODE_ENV=production PORT="$PORT" pm2 start .next/standalone/server.js --name "$NAME" --time )
  else
    sudo -u ubuntu bash -c "cd '$APP_DIR' || exit 1; if [ -f .env ]; then set -a; . ./.env; set +a; fi; NODE_ENV=production PORT='$PORT' pm2 delete '$NAME' >/dev/null 2>&1; NODE_ENV=production PORT='$PORT' pm2 start .next/standalone/server.js --name '$NAME' --time"
  fi
}

# ---- domain tespiti (ana gnc conf'tan) ----
DOMAIN="gncinc.online"
if [ -f /etc/nginx/sites-available/gnc ]; then
  D=$(grep -m1 -oE '[a-z0-9.-]+\.[a-z]{2,}' /etc/nginx/sites-available/gnc | head -1 || true)
  [ -n "$D" ] && DOMAIN="$D"
fi

ARG1="$1"

# ---- liste modu ----
if [ "$ARG1" = "liste" ] || [ "$ARG1" = "list" ]; then
  echo "Kurulmuş oyunlar ($BASE_DIR):"
  found=0
  for c in "$BASE_DIR"/*/"$STATE"; do
    [ -f "$c" ] || continue
    # shellcheck disable=SC1090
    source "$c"
    info "• $NAME  ->  https://$NAME.$DOMAIN  (port $PORT, repo: $REPO)"
    found=1
  done
  [ "$found" -eq 0 ] && info "(henüz yok — ilk kurulum: sudo gnc-oyun <repo-adresi> [port] [isim])"
  exit 0
fi

# ---- doktor modu: sudo gnc-oyun doktor <isim> [--tamir] ----
if [ "$ARG1" = "doktor" ]; then
  DNAME="$2"
  [ -z "$DNAME" ] && die "Kullanım: sudo gnc-oyun doktor <isim> [--tamir]"
  TAMIR="0"
  [ "$3" = "--tamir" ] && TAMIR="1"
  APP_DIR="$BASE_DIR/$DNAME"; NAME="$DNAME"
  PORT=""
  if [ -f "$APP_DIR/$STATE" ]; then
    # shellcheck disable=SC1090
    source "$APP_DIR/$STATE"
  fi
  [ -n "$PORT" ] || PORT="3001"

  echo -e "${BLUE}════════════════════════════════════════════════${NC}"
  echo -e "${BLUE} GNC OYUN DOKTOR — $NAME (port $PORT)${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════${NC}"

  step "1/6 pm2 süreci"
  PSTATUS=$(pm2x jlist 2>/dev/null | python3 -c "import json,sys
try:
    a=json.load(sys.stdin)
    print(next((p['pm2_env']['status'] for p in a if p.get('name')=='$NAME'),'pm2de-yok'))
except Exception:
    print('bilinmiyor')" 2>/dev/null || echo "bilinmiyor")
  info "durum: $PSTATUS"
  DENV_URL=$(pm2x env "$NAME" 2>/dev/null | grep -E '^DATABASE_URL=' || true)
  if [ -n "$DENV_URL" ]; then
    info "DATABASE_URL süreç ortamında VAR ✓"
  else
    warn "DATABASE_URL süreç ortamında YOK → süreç ortamsız başlatılmış (v1.1 hatası). Çözüm: --tamir veya 'sudo gnc-oyun $NAME'"
  fi

  step "2/6 dosyalar ($APP_DIR)"
  for f in package.json node_modules .env .next/standalone/server.js db/custom.db; do
    if [ -e "$APP_DIR/$f" ]; then info "VAR  ✓ $f"; else warn "YOK  ✗ $f"; fi
  done

  step "3/6 port $PORT dinleyicisi"
  LISTEN=$(ss -tlnp 2>/dev/null | grep ":$PORT " || true)
  if [ -n "$LISTEN" ]; then info "$LISTEN"; else warn "port $PORT'ta dinleyici YOK — uygulama şu an çalışmıyor"; fi
  if { [ "$PSTATUS" = "errored" ] || [ "$PSTATUS" = "stopped" ]; } && [ -n "$LISTEN" ]; then
    warn "pm2 süreci ölü ama portta başkası dinliyor → yetim süreç çakışması (--tamir temizler)"
  fi

  step "4/6 yerel yanıt (http://127.0.0.1:$PORT)"
  LCODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "http://127.0.0.1:$PORT" 2>/dev/null || echo "000")
  info "yerel HTTP kodu: $LCODE"

  step "5/6 son hata logları"
  pm2x logs "$NAME" --err --nostream --lines 25 2>/dev/null || warn "log okunamadı — elle: pm2 logs $NAME --err --lines 25"

  step "6/6 sistem"
  info "node: $(node -v 2>/dev/null || echo 'yok')"
  info "RAM: $(free -h 2>/dev/null | awk 'NR==2{print $3" / "$2}') | swap: $(free -h 2>/dev/null | awk 'NR==3{print $3" / "$2}')"
  info "disk /: $(df -h / 2>/dev/null | awk 'NR==2{print $4" boş ("$5" dolu)"}')"
  if grep -qs "server_name[[:space:]]*.*\b$NAME\.$DOMAIN" /etc/nginx/sites-available/* 2>/dev/null; then
    info "nginx block: VAR ($NAME.$DOMAIN)"
  else
    warn "nginx block YOK → bağlamak: sudo gnc-proje $NAME $PORT"
  fi

  if [ "$TAMIR" = "1" ]; then
    echo ""
    step "TAMİR modu"
    if [ ! -f "$APP_DIR/.next/standalone/server.js" ]; then
      warn "server.js yok — hızlı tamir yetersiz, YENİ DEPLOY şart: sudo gnc-oyun $NAME"
    elif [ "$PSTATUS" = "online" ]; then
      info "süreç zaten online — dokunulmadı"
    else
      if [ -n "$LISTEN" ]; then
        warn "yetim port dinleyicisi temizleniyor (port $PORT)"
        fuser -k "$PORT"/tcp 2>/dev/null || true
        sleep 1
      fi
      info ".env ortamıyla yeniden başlatılıyor..."
      app_restart_fresh
      TAMIR_OK=""
      for i in $(seq 1 15); do
        TCODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" 2>/dev/null || echo "000")
        if [ "$TCODE" != "000" ] && [ "$TCODE" != "502" ]; then TAMIR_OK="evet"; break; fi
        sleep 2
      done
      if [ -n "$TAMIR_OK" ]; then
        info "TAMİR BAŞARILI — uygulama AYAKTA (HTTP $TCODE) ✓  Tarayıcıda Ctrl+Shift+R ile açın"
        pm2x save >/dev/null 2>&1 || true
      else
        warn "tamir sonrası hâlâ yanıt yok — yukarıdaki hata loglarını geliştiriciye yapıştırın"
      fi
    fi
  fi
  echo ""
  exit 0
fi

# ---- güncelleme modu: isim verildi (repo adresi değil) ----
if [ -n "$ARG1" ] && ! echo "$ARG1" | grep -qE '^(https?://|git@)'; then
  NAME="$ARG1"
  APP_DIR="$BASE_DIR/$NAME"
  [ -f "$APP_DIR/$STATE" ] || die "$NAME kayıtlı değil. İlk kurulum: sudo gnc-oyun <repo-adresi> [port] [isim]"
  # shellcheck disable=SC1090
  source "$APP_DIR/$STATE"
else
  REPO="$ARG1"
  [ -z "$REPO" ] && die "Kullanım: sudo gnc-oyun <repo-adresi> [port] [isim]\n  Güncelleme: sudo gnc-oyun <isim>   |   Liste: sudo gnc-oyun liste"
  PORT="${2:-3001}"
  NAME="${3:-$(basename "$REPO" .git | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')}"
  APP_DIR="$BASE_DIR/$NAME"
fi

echo "$PORT" | grep -qE '^[0-9]+$' || die "Geçersiz port: $PORT"

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE} GNC OYUN — $NAME (port $PORT)${NC}"
echo -e "${BLUE} repo: ${REPO:-kayıtlı}$NC"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"

# ---- 1) kod: klon veya repo-kopyası güncelleme ----
step "1/4 Kod alınıyor..."
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  info "repoya sıfırlanıyor (deploy kopyası = remote ile birebir)..."
  git fetch --depth 1 origin 2>/dev/null || git fetch origin || true
  UPD_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
  git reset --hard "origin/$UPD_BRANCH" 2>/dev/null || git pull --ff-only 2>/dev/null || git pull || warn "güncelleme alınamadı — mevcut kodla devam"
else
  mkdir -p "$BASE_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR" || die "Klonlanamadı: $REPO\n  Private repoda token'li adres kullanın: https://KULLANICI:TOKEN@github.com/kullanici/repo.git"
  cd "$APP_DIR"
fi
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
printf 'REPO="%s"\nPORT="%s"\nNAME="%s"\nBRANCH="%s"\n' "$REPO" "$PORT" "$NAME" "$BRANCH" > "$APP_DIR/$STATE"
chmod 600 "$APP_DIR/$STATE" 2>/dev/null || true

# ---- 2) tip tespiti + kurulum ----
step "2/4 Uygulama tipi tespit ediliyor..."
pm2x delete "$NAME" >/dev/null 2>&1 || true
if [ -f package.json ] && grep -qE '"start"[[:space:]]*:' package.json; then
  info "Tip: Node uygulaması (npm start, PORT=$PORT)"
  npm install --no-audit --no-fund \
    || { warn "npm install peer-deps çakışması — --legacy-peer-deps ile tekrar"; \
         npm install --legacy-peer-deps --no-audit --no-fund; }
  if [ -f prisma/schema.prisma ]; then
    info "Prisma tespit edildi — veritabanı hazırlanıyor..."
    DB_DIR="$APP_DIR/db"; mkdir -p "$DB_DIR"
    if [ ! -f .env ]; then
      printf 'DATABASE_URL=file:%s/custom.db\nNODE_ENV=production\n' "$DB_DIR" > .env
      chmod 600 .env
      info ".env oluşturuldu (SQLite: db/custom.db)"
    fi
    if [ "$RUN_USER" != "root" ]; then chown "$RUN_USER" .env 2>/dev/null || true; fi
    npx prisma generate
    npx prisma db push --skip-generate --accept-data-loss && info "veritabanı tabloları hazır ✓" || warn "db push başarısız — sonra elle: cd $APP_DIR && npx prisma db push --accept-data-loss"
    [ "$RUN_USER" != "root" ] && chown -R "$RUN_USER" "$DB_DIR" 2>/dev/null || true
  fi
  if grep -qE '"build"[[:space:]]*:' package.json; then
    info "build alınıyor (2-5 dk)..."
    NODE_OPTIONS=--max-old-space-size=1536 npm run build
  fi
  if [ "$RUN_USER" != "root" ]; then chown -R "$RUN_USER" "$APP_DIR/.next" 2>/dev/null || true; fi
  if [ -f ".next/standalone/server.js" ]; then
    info "standalone sunucu başlatılıyor (pm2, PORT=$PORT, .env ortamı dahil)"
    app_start ".next/standalone/server.js" --name "$NAME" --time
  else
    info "standalone bulunamadı — npm start ile başlatılıyor (.env ortamı dahil)"
    app_start npm --name "$NAME" --time -- start
  fi
elif [ -f package.json ] && grep -qE '"build"[[:space:]]*:' package.json; then
  info "Tip: build alınıp statik servis (dist/build/out)"
  npm install || npm install --legacy-peer-deps
  npm run build
  OUT="dist"; [ -d "build" ] && OUT="build"; [ -d "out" ] && OUT="out"
  [ -d "$OUT" ] || die "build çıktısı bulunamadı (dist/build/out) — loglara bakın"
  pm2x serve "$APP_DIR/$OUT" "$PORT" --spa --name "$NAME" --time
elif [ -f index.html ] || [ -f index.htm ]; then
  info "Tip: statik site (index.html, pm2 serve)"
  pm2x serve "$APP_DIR" "$PORT" --name "$NAME" --time
else
  die "Repo'da ne package.json ne index.html bulundu — repo yapısını kontrol edin"
fi
pm2x save >/dev/null 2>&1 || true

# ---- 3) sağlık kontrolü ----
step "3/4 Uygulamanın açılması bekleniyor..."
APP_OK=""
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" 2>/dev/null || echo "000")
  if [ "$CODE" != "000" ] && [ "$CODE" != "502" ]; then APP_OK="evet"; break; fi
  sleep 2
done
if [ -n "$APP_OK" ]; then
  info "Uygulama AYAKTA (http://127.0.0.1:$PORT -> HTTP $CODE) ✓"
else
  warn "Uygulama 60 sn içinde yanıt vermedi — son hata logları:"
  pm2x logs "$NAME" --err --nostream --lines 15 2>/dev/null || true
  warn "Hızlı teşhis/onarım: sudo gnc-oyun doktor $NAME --tamir"
fi

# ---- 4) web adresi kontrolü (SADECE kontrol — nginx'e DOKUNMAZ) ----
step "4/4 Web adresi kontrolü ($NAME.$DOMAIN)..."
if grep -qs "server_name[[:space:]]*.*\b$NAME\.$DOMAIN" /etc/nginx/sites-available/* 2>/dev/null; then
  info "nginx block: VAR ✓"
  HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "https://$NAME.$DOMAIN" 2>/dev/null || echo "000")
  case "$HTTPS_CODE" in
    200|301|302) info "https://$NAME.$DOMAIN -> HTTP $HTTPS_CODE — CANLI ✓" ;;
    404) info "https 404: uygulama ayakta ama o adres uygulama içinde yok (statik oyun için normal değil — kontrol edin)" ;;
    502) warn "https 502: nginx+SSL var, uygulamaya ulaşamıyor — pm2 status ile '$NAME' online mı bakın" ;;
    000) warn "https dışarıdan açılmadı: (1) AWS Security Group TCP 443 açık mı, (2) SSL yoksa: sudo certbot --nginx -d $NAME.$DOMAIN" ;;
    *) info "https://$NAME.$DOMAIN -> HTTP $HTTPS_CODE" ;;
  esac
else
  warn "nginx block YOK — subdomain henüz web'e bağlı değil. Tek komutla bağlayın:"
  info "  sudo gnc-proje $NAME $PORT"
fi

echo ""
if [ -n "$APP_OK" ]; then
  echo -e "${GREEN}════════════════════════════════════════════════${NC}"
  echo -e "${GREEN} TAMAM! $NAME deploy edildi ve AYAKTA ✓${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════${NC}"
  echo -e "  Adres       : https://$NAME.$DOMAIN"
  echo -e "  Güncelleme  : ${BLUE}sudo gnc-oyun $NAME${NC}   (repo'dan pull + yeniden başlat)"
  echo -e "  Listeleme   : ${BLUE}sudo gnc-oyun liste${NC}"
  echo -e "  Teşhis      : ${BLUE}sudo gnc-oyun doktor $NAME${NC}"
  echo -e "  Loglar      : ${BLUE}pm2 logs $NAME${NC}"
  echo -e "  Klasör      : $APP_DIR  (gnc-erp'den TAMAMEN bağımsız)"
else
  echo -e "${YELLOW}════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW} DİKKAT: deploy bitti ama uygulama AYAKTA DEĞİL${NC}"
  echo -e "${YELLOW}════════════════════════════════════════════════${NC}"
  echo -e "  Hızlı tamir : ${BLUE}sudo gnc-oyun doktor $NAME --tamir${NC}"
  echo -e "  Teşhis      : ${BLUE}sudo gnc-oyun doktor $NAME${NC}"
  echo -e "  Loglar      : ${BLUE}pm2 logs $NAME --err --lines 30${NC}"
  echo -e "  Klasör      : $APP_DIR"
fi
echo ""
