#!/bin/bash
# GNC CRM — SQLite veritabanı otomatik yedek
# Kullanım: bash /home/z/my-project/scripts/backup-db.sh
# db/custom.db -> db/backups/custom-YYYYmmdd-HHMMSS.db (son 20 yedek saklanır)

set -u
SRC="/home/z/my-project/db/custom.db"
DIR="/home/z/my-project/db/backups"
KEEP=20

[ -f "$SRC" ] || { echo "HATA: $SRC bulunamadi"; exit 1; }
mkdir -p "$DIR"

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$DIR/custom-$STAMP.db"
cp "$SRC" "$DEST" && echo "Yedek OK: $DEST ($(du -h "$DEST" | cut -f1))"

# 'latest' kolay erişim kopyası
cp "$DEST" "$DIR/latest.db"

# eskileri temizle (son KEEP kadar kalsin)
ls -1t "$DIR"/custom-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old" && echo "Eski yedek silindi: $old"
done
