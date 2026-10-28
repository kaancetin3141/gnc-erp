#!/usr/bin/env python3
"""Veri kalitesi denetimi: sector, email, telefon, mükerrer, boş alanlar."""
import sqlite3, re
from collections import Counter

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()
def q(sql, args=()):
    return [dict(r) for r in cur.execute(sql, args).fetchall()]

print("=== 1) SECTOR (meslek grubu) DAĞILIMI ===")
sectors = [r["sector"] for r in q("SELECT sector FROM Customer")]
for s, n in Counter(sectors).most_common():
    print(f"  {s!r}: {n}")

print("\n=== 2) SECTOR YAZIM TUTARSIZLIĞI (case/space) ===")
norm = {}
for s in sectors:
    k = (s or "").strip().lower()
    norm.setdefault(k, Counter())[s] += 1
for k, c in norm.items():
    if len(c) > 1:
        print(f"  TUTARSIZ: {dict(c)}")
print("  (boşsa sorun yok)")

print("\n=== 3) GEÇERSİZ E-POSTALAR (Türkçe karakter / format) ===")
bad_email = q("SELECT id, name, email FROM Customer WHERE email IS NOT NULL AND (email GLOB '*[ğüşöçıİĞÜŞÖÇ]*' OR email NOT GLOB '*@*.*')")
for r in bad_email:
    print(f"  {r['name']}: {r['email']!r}")
print(f"  Toplam: {len(bad_email)}")

print("\n=== 4) MÜKERRER MÜŞTERİ ADI ===")
dups = q("SELECT name, COUNT(*) n, GROUP_CONCAT(city) cities FROM Customer GROUP BY LOWER(TRIM(name)) HAVING n > 1")
for d in dups:
    print(f"  {d['name']}: {d['n']}x ({d['cities']})")

print("\n=== 5) TELEFON FORMATLARI ===")
fmts = Counter()
for r in q("SELECT phone FROM Customer WHERE phone IS NOT NULL"):
    p = r["phone"]
    if re.fullmatch(r"\+90 5\d{2} \d{3} \d{2} \d{2}", p): fmts["+90 5xx xxx xx xx"] += 1
    elif re.fullmatch(r"0?5\d{2} \d{3} \d{2} \d{2}", p): fmts["0/5xx xxx xx xx"] += 1
    else: fmts[f"Diğer: {p}"] += 1
for f, n in fmts.most_common():
    print(f"  {f}: {n}")

print("\n=== 6) BOŞ KRİTİK ALANLAR ===")
for col in ["sector", "segment", "phone", "email", "city", "status", "customerType", "ownerId"]:
    n = q(f"SELECT COUNT(*) c FROM Customer WHERE [{col}] IS NULL OR TRIM([col]) = ''".replace("[col]", col))[0]["c"]
    print(f"  {col}: {n} boş")

print("\n=== 7) SEGMENT & STATUS & customerType & source DEĞERLERİ ===")
for col in ["segment", "status", "customerType", "source"]:
    vals = Counter(r["v"] for r in q(f"SELECT [{col}] AS v, COUNT(*) n FROM Customer GROUP BY [{col}] ORDER BY n DESC"))
    print(f"  {col}: {dict(vals)}")

print("\n=== 8) SAHİPSİZ MÜŞTERİLER (ownerId kullanıcıda yok) ===")
orph = q("""SELECT c.name, c.ownerId FROM Customer c LEFT JOIN User u ON u.id=c.ownerId
            WHERE c.ownerId IS NOT NULL AND u.id IS NULL""")
for r in orph: print(f"  {r['name']} -> {r['ownerId']}")
print(f"  Toplam: {len(orph)}")

print("\n=== 9) TENANT TUTARLILIĞI ===")
print(q("SELECT tenantId, COUNT(*) n FROM Customer GROUP BY tenantId"))

print("\n=== 10) LAT/LNG DURUMU (harita için) ===")
n_geo = q("SELECT COUNT(*) c FROM Customer WHERE lat IS NULL OR lng IS NULL")[0]["c"]
print(f"  Koordinatsız müşteri: {n_geo}/30")
