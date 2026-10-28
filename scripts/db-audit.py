#!/usr/bin/env python3
"""GNC CRM DB denetimi: şema + meslek grubu + modül veri taraması."""
import sqlite3, json, sys

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

def q(sql, args=()):
    try:
        return [dict(r) for r in cur.execute(sql, args).fetchall()]
    except Exception as e:
        return [{"HATA": str(e)}]

print("=== TABLOLAR ===")
tables = [r["name"] for r in q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print(", ".join(tables))

print("\n=== TABLO SATIR SAYILARI ===")
for t in tables:
    n = q(f"SELECT COUNT(*) c FROM [{t}]")
    print(f"{t}: {n[0]['c'] if n else '?'}")

print("\n=== CUSTOMERS ŞEMASI ===")
print(q("SELECT sql FROM sqlite_master WHERE name='customers'")[0].get("sql", ""))

con.close()
