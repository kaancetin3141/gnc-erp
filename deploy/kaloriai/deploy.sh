#!/usr/bin/env bash
# KaloriAI — kurulum / güncelleme scripti
# git pull → bağımlılık → prisma generate → db push → build → servis yeniden başlat
set -euo pipefail

APP_DIR="${APP_DIR:-/home/kaloriai/KaloriAI}"
SERVICE="${SERVICE:-kaloriai}"

cd "$APP_DIR"

echo "── 1/6 git pull"
git pull --ff-only

echo "── 2/6 bağımlılıklar"
bun install --frozen-lockfile 2>/dev/null || bun install

echo "── 3/6 prisma client"
bunx prisma generate

echo "── 4/6 şema push (değişiklik varsa)"
bunx prisma db push

echo "── 5/6 build"
bun run build

echo "── 6/6 servis yeniden başlatma"
if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
  sudo systemctl restart "$SERVICE"
else
  echo "systemd servisi bulunamadı — süreci elle yeniden başlatın."
fi

echo "✅ Dağıtım tamam."
