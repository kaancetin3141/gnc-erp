#!/usr/bin/env bash
# GNC CRM — SQLite veritabanı yedekleme scripti (cron Job ID: 430621)
# db/custom.db -> db/backups/custom-<timestamp>.db  (son 20 yedek saklanır)
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

SIZE_SRC=$(stat -c%s "$SRC")
SIZE_DST=$(stat -c%s "$DEST")
COUNT=$(ls -1 "$DEST_DIR"/custom-*.db 2>/dev/null | wc -l)
echo "OK: Yedek alındı -> $DEST ($SIZE_DST bayt / kaynak $SIZE_SRC bayt)"
echo "Toplam yedek sayısı: $COUNT (limit $KEEP)"
