#!/usr/bin/env python3
"""Web alanı onarımı: ascii_domain'i URL'lere de uygulayan ayrı mantık."""
import sqlite3, re

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

TR_MAP = str.maketrans("çğıöşüâîû", "cgiosuaiu")

def ascii_url(url: str) -> str:
    # 'www.boğaziçi.com.tr' → 'www.bogazici.com.tr'; yanlışlıkla eklenmiş '@' temizlenir
    prefix = ""
    u = url.strip()
    if u.startswith("www."):
        prefix = "www."
        u = u[4:]
    u = u.replace("@", "")
    u = u.lower().translate(TR_MAP)
    u = re.sub(r"[^a-z0-9.-]", "", u)
    return prefix + u

rows = cur.execute("SELECT id, web FROM Customer WHERE web IS NOT NULL").fetchall()
fixed = 0
for r in rows:
    w = r["web"]
    needs = "@" in w or any(c in w for c in "ğüşöçıİĞÜŞÖÇ")
    if not needs:
        continue
    nw = ascii_url(w)
    print(f"web {w!r} → {nw!r}")
    cur.execute("UPDATE Customer SET web=? WHERE id=?", (nw, r["id"]))
    fixed += 1

con.commit()

# E-posta ve web son doğrulama
bad = cur.execute("SELECT COUNT(*) c FROM Customer WHERE email GLOB '*[ğüşöçıİĞÜŞÖÇ]*' OR web GLOB '*[ğüşöçıİĞÜŞÖÇ]*' OR web LIKE '%@%'").fetchone()["c"]
at_in_web = cur.execute("SELECT COUNT(*) c FROM Customer WHERE web LIKE '%@%'").fetchone()["c"]
print(f"\nKalan Türkçe-karakterli email/web: {bad}, web içinde '@': {at_in_web}, düzeltilen web: {fixed}")
con.close()
