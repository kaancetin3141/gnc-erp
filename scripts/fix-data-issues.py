#!/usr/bin/env python3
"""GNC CRM — tespit edilen veri hatalarının düzeltilmesi.
ÖNCE yedek alınır (scripts/backup-db.sh zaten latest.db tutar).
Düzeltmeler:
  1) Kafe S-0002: subtotal/total 245 → 295 (kalem toplamı), card ödemesi 95 → 145
  2) Hayalet dolu masa M2 (Boğaziçi Kafe) → 'bos'
  3) Türkçe karakterli e-posta/web domainleri → ASCII (10 müşteri)
"""
import sqlite3, re

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

# ---- 1) Kafe S-0002 tutar düzeltmesi
row = cur.execute("SELECT id, subtotal, total FROM CafeOrder WHERE number='S-0002'").fetchone()
item_sum = cur.execute("SELECT COALESCE(SUM(qty*unitPrice),0) s FROM CafeOrderItem WHERE orderId=?", (row["id"],)).fetchone()["s"]
print(f"S-0002: mevcut total={row['total']}, kalem toplamı={item_sum}")
cur.execute("UPDATE CafeOrder SET subtotal=?, total=?, updatedAt=datetime('now') WHERE id=?", (item_sum, item_sum, row["id"]))
# ödemeler toplamı da adisyon tutarına eşitlenmeli: card (95) → fark
paid_cash = cur.execute("SELECT COALESCE(SUM(amount),0) s FROM CafePayment WHERE orderId=? AND method='cash'", (row["id"],)).fetchone()["s"]
card = cur.execute("SELECT id, amount FROM CafePayment WHERE orderId=? AND method='card'", (row["id"],)).fetchone()
new_card = round(item_sum - paid_cash, 2)
print(f"S-0002: card ödeme {card['amount']} → {new_card}")
cur.execute("UPDATE CafePayment SET amount=? WHERE id=?", (new_card, card["id"]))

# ---- 2) Hayalet dolu masalar (aktif siparişi olmayan dolu/siparis masaları → bos)
ghost = cur.execute("""
    SELECT t.id, t.number FROM CafeTable t
    WHERE t.status IN ('dolu','siparis')
      AND NOT EXISTS (SELECT 1 FROM CafeOrder o WHERE o.tableId=t.id AND o.status IN ('acik','hazirlaniyor','hazir'))
""").fetchall()
for t in ghost:
    print(f"Hayalet masa {t['number']} → bos")
    cur.execute("UPDATE CafeTable SET status='bos', updatedAt=datetime('now') WHERE id=?", (t["id"],))

# ---- 3) Türkçe karakterli e-posta/web domainleri
TR_MAP = str.maketrans("çğıöşüâîû", "cgiosuaiu")
def ascii_domain(email: str) -> str:
    local, _, domain = email.partition("@")
    d = domain.lower().translate(TR_MAP)
    d = re.sub(r"[^a-z0-9.-]", "", d)
    return f"{local}@{d}"

bad = cur.execute("SELECT id, email, web FROM Customer WHERE email GLOB '*[ğüşöçıİĞÜŞÖÇ]*' OR web GLOB '*[ğüşöçıİĞÜŞÖÇ]*'").fetchall()
for r in bad:
    new_email = ascii_domain(r["email"]) if r["email"] else r["email"]
    new_web = ascii_domain(r["web"]) if r["web"] else r["web"]
    print(f"{r['email']!r} → {new_email!r}; web {r['web']!r} → {new_web!r}")
    cur.execute("UPDATE Customer SET email=?, web=?, updatedAt=datetime('now') WHERE id=?", (new_email, new_web, r["id"]))

con.commit()

# ---- Doğrulama
print("\n--- DOĞRULAMA ---")
row = cur.execute("SELECT subtotal, total FROM CafeOrder WHERE number='S-0002'").fetchone()
paid = cur.execute("SELECT COALESCE(SUM(amount),0) s FROM CafePayment p JOIN CafeOrder o ON o.id=p.orderId WHERE o.number='S-0002' AND p.status='tamamlandi'").fetchone()["s"]
print(f"S-0002: total={row['total']}, tahsilat={paid} {'✓' if abs(row['total']-paid)<0.01 else '✗'}")
ghost2 = cur.execute("SELECT COUNT(*) c FROM CafeTable t WHERE t.status IN ('dolu','siparis') AND NOT EXISTS (SELECT 1 FROM CafeOrder o WHERE o.tableId=t.id AND o.status IN ('acik','hazirlaniyor','hazir'))").fetchone()["c"]
print(f"Hayalet masa kalan: {ghost2}")
bad2 = cur.execute("SELECT COUNT(*) c FROM Customer WHERE email GLOB '*[ğüşöçıİĞÜŞÖÇ]*' OR web GLOB '*[ğüşöçıİĞÜŞÖÇ]*'").fetchone()["c"]
print(f"Geçersiz domain kalan: {bad2}")
con.close()
print("\nOK — veri düzeltmeleri tamam.")
