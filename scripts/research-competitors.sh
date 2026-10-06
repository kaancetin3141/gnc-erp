#!/bin/bash
# Benzer firma yazılımları araştırması — GNC CRM gap analysis için
OUT=/home/z/my-project/scripts/research
mkdir -p "$OUT"

declare -A QUERIES=(
  ["01-zoho-one"]="Zoho One all modules list features 2025"
  ["02-odoo"]="Odoo all apps modules list 2025"
  ["03-kobi-tr"]="Türkiye en iyi KOBİ iş yönetim yazılımı CRM ERP özellikleri 2025"
  ["04-erp-tr"]="Logo Netsis Mikro Nebim KOBİ ERP modül özellikleri"
  ["05-site-yonetim"]="site yönetimi yazılımı özellikleri aidat takip programı"
  ["06-restoran"]="restoran kafe yönetim yazılımı özellikleri POS stok masalar"
  ["07-market"]="market bakkal POS yazılımı özellikleri barkod stok cari"
  ["08-randevu"]="online randevu yönetim sistemi özellikleri üyelik paket hatırlatma"
  ["09-hr"]="KOBİ personel izin vardiya bordro takip yazılımı özellikleri"
  ["10-helpdesk"]="KOBİ destek talebi ticket sistemi yazılım özellikleri"
  ["11-efatura"]="e-fatura e-arşiv fatura entegrasyonu KOBİ yazılım"
  ["12-crm-leader"]="best all-in-one CRM small business 2025 features comparison"
)

for key in "${!QUERIES[@]}"; do
  q="${QUERIES[$key]}"
  echo "== $key: $q"
  z-ai function -n web_search -a "{\"query\": \"$q\", \"num\": 6}" -o "$OUT/$key.json" 2>&1 | tail -1
done

echo "--- DONE ---"
ls -la "$OUT"
