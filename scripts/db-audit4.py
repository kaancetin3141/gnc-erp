#!/usr/bin/env python3
"""Modüller arası mantık tutarlılık denetimi v2 (gerçek kolon adlarıyla)."""
import sqlite3
from datetime import datetime, timezone

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()
def q(sql, args=()):
    return [dict(r) for r in cur.execute(sql, args).fetchall()]

issues = []
def issue(mod, desc):
    issues.append((mod, desc))
    print(f"  [{mod}] {desc}")

print("=== A) CAFE ===")
for o in q("SELECT id, number, subtotal, taxTotal, total, status FROM CafeOrder"):
    calc = (o["subtotal"] or 0) + (o["taxTotal"] or 0)
    if abs(calc - (o["total"] or 0)) > 0.01:
        issue("KAFE", f"Sipariş #{o['number']}: subtotal+tax={calc:.2f} != total={o['total']:.2f} (durum={o['status']})")
for r in q("""SELECT o.id, o.number, o.subtotal, SUM(i.qty*i.unitPrice) itemSum
              FROM CafeOrder o LEFT JOIN CafeOrderItem i ON i.orderId=o.id GROUP BY o.id"""):
    if r["itemSum"] is not None and abs(r["itemSum"] - (r["subtotal"] or 0)) > 0.01:
        issue("KAFE", f"Sipariş #{r['number']}: kalemler={r['itemSum']:.2f} != subtotal={r['subtotal']:.2f}")
for r in q("""SELECT o.number, o.total, COALESCE(SUM(p.amount),0) paid, o.status
              FROM CafeOrder o LEFT JOIN CafePayment p ON p.orderId=o.id
              GROUP BY o.id HAVING o.status='odendi' AND ABS(paid-o.total)>0.01"""):
    issue("KAFE", f"Ödenen sipariş #{r['number']}: ödeme={r['paid']:.2f} != total={r['total']:.2f}")
for r in q("""SELECT t.number, t.status,
              (SELECT COUNT(*) FROM CafeOrder o WHERE o.tableId=t.id AND o.status NOT IN ('odendi','iptal','kapandi')) act
              FROM CafeTable t WHERE t.status IN ('dolu','siparis')"""):
    if r["act"] == 0:
        issue("KAFE", f"Masa {r['number']} '{r['status']}' ama aktif siparişi yok (hayalet dolu masa)")
# Kapalı siparişi olan masa boş görünüyor mu?
for r in q("""SELECT DISTINCT t.number, t.status FROM CafeTable t JOIN CafeOrder o ON o.tableId=t.id
              WHERE o.status NOT IN ('odendi','iptal') AND t.status='bos'"""):
    issue("KAFE", f"Masa {r['number']} boş görünüyor ama açık siparişi var")

print("\n=== B) MARKET ===")
for r in q("""SELECT s.number, s.total, s.subtotal, s.taxTotal, s.discount, SUM(i.lineTotal) itemSum
              FROM MarketSale s LEFT JOIN MarketSaleItem i ON i.saleId=s.id GROUP BY s.id"""):
    calc = (r["subtotal"] or 0) + (r["taxTotal"] or 0) - (r["discount"] or 0)
    if abs(calc - (r["total"] or 0)) > 0.01:
        issue("MARKET", f"Satış #{r['number']}: sub+tax-disc={calc:.2f} != total={r['total']:.2f}")
    if r["itemSum"] is not None and abs(r["itemSum"] - (r["subtotal"] or 0)) > 0.01:
        issue("MARKET", f"Satış #{r['number']}: kalemler={r['itemSum']:.2f} != subtotal={r['subtotal']:.2f}")
for p in q("SELECT name, stock FROM Product WHERE stock < 0"):
    issue("MARKET", f"Ürün '{p['name']}': negatif stok {p['stock']}")
dups = q("SELECT code, COUNT(*) n FROM Barcode GROUP BY code HAVING n>1")
for d in dups: issue("MARKET", f"Mükerrer barkod: {d['code']} ({d['n']}x)")
for s in q("SELECT id, number, openingTime FROM PosShift WHERE status='acik'"):
    try:
        dt = datetime.fromisoformat(str(s["openingTime"]).replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - dt).days
        if age > 1:
            issue("MARKET", f"POS vardiya #{s['number']} {age} gündür açık")
    except Exception as e:
        print("  (vardiya tarihi okunamadı)", e)

print("\n=== C) SITE ===")
for s in q("SELECT id, name FROM Site"):
    ap = q("SELECT COUNT(*) c FROM Apartment WHERE siteId=?", (s["id"],))[0]["c"]
    du = q("SELECT COUNT(DISTINCT apartmentId) c FROM Dues WHERE siteId=?", (s["id"],))[0]["c"]
    print(f"  {s['name']}: {ap} daire, aidat kayıtlı daire sayısı: {du}")
    if du < ap:
        issue("SITE", f"{s['name']}: {ap} dairenin yalnız {du}'sunda aidat kaydı var")
for d in q("SELECT month, year, amount, paidAmount FROM Dues WHERE paidAmount > amount"):
    issue("SITE", f"Aidat {d['month']}/{d['year']}: paidAmount({d['paidAmount']}) > amount({d['amount']})")
for d in q("SELECT month, year, amount, paidAmount FROM Dues WHERE status='odendi' AND paidAmount < amount"):
    issue("SITE", f"Aidat {d['month']}/{d['year']} 'odendi' ama eksik ödeme ({d['paidAmount']}/{d['amount']})")
for d in q("SELECT month, year, status, paidAmount, paidDate FROM Dues WHERE status='odenmedi' AND paidAmount > 0 AND paidDate IS NOT NULL"):
    issue("SITE", f"Aidat {d['month']}/{d['year']} 'odenmedi' ama paidDate var")
for r in q("""SELECT r.name, r.apartmentId FROM Resident r LEFT JOIN Apartment a ON a.id=r.apartmentId
              WHERE r.isActive=1 AND r.apartmentId IS NOT NULL AND a.id IS NULL"""):
    issue("SITE", f"Sakin '{r['name']}' olmayan daireye bağlı")
# Apartment.residentId <-> Resident.apartmentId çift yönlü tutarlılık
for r in q("""SELECT a.number, a.residentId, r.name FROM Apartment a
              JOIN Resident r ON r.apartmentId = a.id
              WHERE a.residentId IS NOT NULL AND a.residentId != r.id AND r.isActive=1"""):
    issue("SITE", f"Daire {r['number']}: residentId={r['residentId'][:8]} ama sakin '{r['name']}' bu dairede kayıtlı")

print("\n=== D) CRM ===")
for d in q("SELECT title, value FROM Deal WHERE value < 0"):
    issue("CRM", f"Negatif deal tutarı: {d['title']}")
for r in q("""SELECT i.number, i.total, i.subtotal, i.taxTotal, SUM(l.lineTotal) itemSum
              FROM Invoice i LEFT JOIN InvoiceLine l ON l.invoiceId=i.id GROUP BY i.id"""):
    if r["itemSum"] is not None and abs(r["itemSum"] - (r["total"] or 0)) > 0.01:
        issue("CRM", f"Fatura {r['number']}: kalemler={r['itemSum']:.2f} != total={r['total']:.2f}")
for r in q("""SELECT d.title, c.name custName, c.status FROM Deal d JOIN Customer c ON c.id=d.customerId
              WHERE d.stage='kazanildi' AND c.status NOT IN ('aktif')"""):
    issue("CRM", f"Kazanılan deal '{r['title']}' ama müşteri '{r['custName']}' durumu={r['status']}")
for r in q("SELECT name, status, convertedCustomerId FROM Lead WHERE convertedCustomerId IS NOT NULL AND status != 'donustu'"):
    issue("CRM", f"Lead '{r['name']}' müşteriye dönüştü ama durumu={r['status']}")

print(f"\n### TOPLAM BULGU: {len(issues)}")
