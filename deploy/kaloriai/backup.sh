#!/usr/bin/env bash
# KaloriAI — günlük yedek scripti
# SQLite online yedek (WAL-safe .backup API) + upload/ + .env
# Kullanım: kaloriai-backup  (kaloriai kullanıcısının crontab'ından)
set -euo pipefail

APP_DIR="${APP_DIR:-/home/kaloriai/KaloriAI}"
BACKUP_DIR="${BACKUP_DIR:-/home/kaloriai/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
DEST="$BACKUP_DIR/$STAMP"

mkdir -p "$DEST"

# 1) DB — sqlite3 .backup (WAL modunda tutarlı anlık görüntü)
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$APP_DIR/db/custom.db" ".backup '$DEST/custom.db'"
else
  # sqlite3 yoksa: dosya + WAL kopyası (uygulama çalışırken daha az tutarlı)
  cp "$APP_DIR/db/custom.db" "$DEST/custom.db"
  [ -f "$APP_DIR/db/custom.db-wal" ] && cp "$APP_DIR/db/custom.db-wal" "$DEST/"
  [ -f "$APP_DIR/db/custom.db-shm" ] && cp "$APP_DIR/db/custom.db-shm" "$DEST/"
fi

# 2) Yüklenen görseller (kullanıcı fotoğrafları + AI analiz görselleri)
if [ -d "$APP_DIR/upload" ]; then
  tar -czf "$DEST/upload.tar.gz" -C "$APP_DIR" upload
fi

# 3) .env (gizli — yedek dizin izinlerini sıkı tut)
cp "$APP_DIR/.env" "$DEST/.env"
chmod 600 "$DEST/.env"

# 4) Eski yedekleri temizle
find "$BACKUP_DIR" -maxdepth 1 -type d -name "20*" -mtime "+$RETAIN_DAYS" -exec rm -rf {} +

# 5) Bütünlük doğrulama (sqlite3 varsa)
if command -v sqlite3 >/dev/null 2>&1; then
  RESULT="$(sqlite3 "$DEST/custom.db" "PRAGMA integrity_check;")"
  [ "$RESULT" = "ok" ] || { echo "YEDEK BOZUK: $DEST"; exit 1; }
fi

echo "✅ Yedek tamam: $DEST ($(du -sh "$DEST" | cut -f1))"
