#!/usr/bin/env bash
# GNC CRM — SQLite veritabanı yedekleme scripti (cron; eski Job ID: 430621)
# db/custom.db -> db/backups/custom-<timestamp>.db  (son 20 yedek saklanır)
# DAYANIKLILIK (sandbox sıfırlama bulgusu): git takibi OLMAYAN dosyalar ortam
# sıfırlanınca siliniyor (2026-10-26 olayı: db/ + db/backups/ tamamen yok oldu,
# DB boş şemayla geri geldi). Bu yüzden son yedek AYRICA db/backups/latest.db
# olarak yazılır ve git'e commit edilir — .gitignore bu tek dosyaya istisna
# tanır. Ortam sıfırlansa bile git geçmişinden kurtarılabilir:
#   git show HEAD:db/backups/latest.db > db/backups/kurtarilan.db
set -u

SRC_DIR="/home/z/my-project/db"
SRC="$SRC_DIR/custom.db"
DEST_DIR="$SRC_DIR/backups"
KEEP=20
TS="$(date +%Y%m%d-%H%M%S)"

if [ ! -f "$SRC" ]; then
  echo "HATA: Kaynak veritabanı bulunamadı: $SRC"
  exit 1
fi

mkdir -p "$DEST_DIR"
DEST="$DEST_DIR/custom-$TS.db"

cp "$SRC" "$DEST" || { echo "HATA: Kopyalama başarısız"; exit 1; }

# WAL/SHM yan dosyaları varsa onları da al (tutarlılık için)
for ext in wal shm; do
  [ -f "$SRC-$ext" ] && cp "$SRC-$ext" "$DEST-$ext" 2>/dev/null
done

# Bütünlük kontrolü: SQLite başlık imzası (ilk 16 bayt: "SQLite format 3\0")
HDR_SRC="$(head -c 16 "$SRC" | od -An -c | tr -d ' \n')"
HDR_DST="$(head -c 16 "$DEST" | od -An -c | tr -d ' \n')"
if [ "$HDR_SRC" != "$HDR_DST" ]; then
  echo "HATA: Yedek bütünlük kontrolü geçemedi (başlık uyuşmuyor)"
  rm -f "$DEST"
  exit 1
fi

# Eski yedekleri temizle: en yeniler hariç KEEP adedini sil
ls -1t "$DEST_DIR"/custom-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old" "$old-wal" "$old-shm"
done

# --- Kalıcı kopya: git takipli latest.db (sandbox sıfırlama sigortası) ---
LATEST="$DEST_DIR/latest.db"
if cp "$SRC" "$LATEST"; then
  # git varsa best-effort commit (başarısızlık yedeklemeyi bozmaz)
  if git -C /home/z/my-project rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if ! git -C /home/z/my-project check-ignore -q "$LATEST"; then
      git -C /home/z/my-project add "$LATEST" 2>/dev/null
      if ! git -C /home/z/my-project diff --cached --quiet 2>/dev/null; then
        git -C /home/z/my-project commit -m "chore(db): otomatik yedek $TS" \
          --no-verify -q 2>/dev/null \
          && echo "GIT: latest.db commit'lendi (kalıcı kopya güncel)"
      fi
    else
      echo "UYARI: $LATEST git tarafından yok sayılıyor — .gitignore kontrol edin"
    fi
  fi
else
  echo "UYARI: Kalıcı kopya (latest.db) yazılamadı"
fi

SIZE_SRC=$(stat -c%s "$SRC")
SIZE_DST=$(stat -c%s "$DEST")
COUNT=$(ls -1 "$DEST_DIR"/custom-*.db 2>/dev/null | wc -l)
echo "OK: Yedek alındı -> $DEST ($SIZE_DST bayt / kaynak $SIZE_SRC bayt)"
echo "Toplam yedek sayısı: $COUNT (limit $KEEP)"
