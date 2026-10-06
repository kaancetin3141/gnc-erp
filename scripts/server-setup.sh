#!/bin/bash
# ============================================================
# GNC — Tek Komut Sunucu Kurulumu (yönlendirici)
#
# Gerçek kurulum: deploy/kurulum.sh v3.0
#   CRM :3000 · Müşteri Randevu :3002 · Fruit Storm :3003 · KaloriAI :3004
#   + ana site + nginx alt alan adları + GitHub'dan otomatik indirme
#
# Kullanım:
#   bash scripts/server-setup.sh [domain] [tokenli-repo-adresi]
#   # örnek:
#   bash scripts/server-setup.sh gncinc.online "https://kaancetin3141:TOKEN@github.com/kaancetin3141/gnc-erp.git"
#
# Not: Bu sarmalayıcı eskiden Caddy kuruyordu ve oyun/KaloriAI
# repolarını proje klasörüne klonluyordu — artık NE Caddy ne de
# yabancı repo bu projeye karıştırılmaz; nginx tabanlı kurulum
# her uygulamayı /var/www altındaki kendi klasörüne indirir.
# ============================================================
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$DIR/deploy/kurulum.sh" "$@"
