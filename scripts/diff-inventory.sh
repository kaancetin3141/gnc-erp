#!/bin/bash
# gnc-erp repo ↔ mevcut proje: differ dosyalarda repo'ya-özgü satır analizi
# Her differ dosya için: repo-only satır sayısı, current-only satır sayısı
R=/tmp/gnc-erp
C=/home/z/my-project
TMP1=$(mktemp); TMP2=$(mktemp)

diff -rq "$R/src" "$C/src" 2>/dev/null | grep "^Files" | sed "s|^Files $R/src/||; s| and .*||" > "$TMP1"

printf "%-6s %-6s %-6s  %s\n" "R-only" "C-only" "Same" "FILE"
while IFS= read -r f; do
  [ -f "$R/src/$f" ] || continue
  [ -f "$C/src/$f" ] || continue
  # ortak satırları çıkar, kalanları say
  diff "$R/src/$f" "$C/src/$f" | grep "^>" | sed 's/^> //' | sort > "$TMP2"   # current'ta olan
  diff "$R/src/$f" "$C/src/$f" | grep "^<" | sed 's/^< //' | sort > "$TMP1.b" # repoda olan
  comm -23 "$TMP1.b" "$TMP2" > "$TMP1.m"   # repoda olup current'ta OLMAYAN (boşluklu temiz)
  # boş satır ve saf import satırlarını sayma
  ronly=$(grep -cv -E "^\s*$" "$TMP1.m" 2>/dev/null || echo 0)
  conly=$(grep "^>" /dev/null; diff "$R/src/$f" "$C/src/$f" | grep -c "^>")
  printf "%-6s %-6s %-6s  %s\n" "$ronly" "$conly" "" "$f"
done < "$TMP1"
rm -f "$TMP1" "$TMP2" "$TMP1.b" "$TMP1.m"
