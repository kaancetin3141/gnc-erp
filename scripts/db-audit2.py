#!/usr/bin/env python3
"""Meslek grubu + müşteri verisi taraması."""
import sqlite3, json
from collections import Counter

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

def q(sql, args=()):
    return [dict(r) for r in cur.execute(sql, args).fetchall()]

print("=== CUSTOMERS KOLONLARI ===")
cols = q("PRAGMA table_info(Customer)")
for c in cols:
    print(f"  {c['name']} ({c['type']})")

print("\n=== MESLEK DEĞERLERİ (ham) ===")
try:
    rows = q("SELECT profession, COUNT(*) n FROM Customer GROUP BY profession ORDER BY n DESC")
    for r in rows:
        print(f"  {r['profession']!r}: {r['n']}")
except Exception as e:
    print("HATA:", e)

print("\n=== BENZER KOLONLAR TARAMASI (meslek/job/title/sector) ===")
for t in [r["name"] for r in q("SELECT name FROM sqlite_master WHERE type='table'")]:
    for c in q(f"PRAGMA table_info([{t}])"):
        nm = c["name"].lower()
        if any(k in nm for k in ("meslek", "job", "profession", "sector", "sektor", "title")):
            print(f"  {t}.{c['name']}")

print("\n=== CUSTOMER ÖRNEK KAYITLAR (ilk 10) ===")
for r in q("SELECT * FROM Customer LIMIT 10"):
    print(json.dumps(r, ensure_ascii=False, default=str)[:400])
