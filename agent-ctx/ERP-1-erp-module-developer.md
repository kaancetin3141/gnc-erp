# ERP-1 — ERP Module Developer (Ürün & Stok)

## Task ID
ERP-1

## Agent
ERP Module Developer

## Task
Faz 2 ERP-lite ürün & stok yönetimi modülü. Mevcut Product/StockMovement Prisma şeması
üzerine API + UI geliştirme. Sidebar'a ERP grubu ekleme, route entegrasyonu.

## Work Log

### Oluşturulan Dosyalar
- `src/app/api/products/route.ts` — GET (list+search+category+lowStock filter, _count dahil) + POST (create, auto opening stock movement, audit log)
- `src/app/api/products/[id]/route.ts` — GET (product + last 20 stockMovements + _count), PATCH (selective update, audit log), DELETE (quoteLines referans kontrolü, audit log)
- `src/app/api/products/[id]/stock/route.ts` — GET (paginated history), POST (giris/cikis/duzeltme/transfer, transaction içinde product.stock güncelle, negatif stok engelle, audit log)
- `src/components/erp/products-view.tsx` — ProductsView bileşeni: header + 4 stats kart + filtreler + tablo + add/edit dialog + detail dialog (stok hareketi formu + scrollable history table) + empty state + delete confirmation

### Güncellenen Dosyalar
- `src/store/app-store.ts` — AppView union'a `'erp'` eklendi
- `src/components/app/sidebar.tsx` — Boxes ikonu import edildi, "ERP" grubu altında "Ürün & Stok" nav item eklendi (permission: customers.view.own)
- `src/components/app/app-shell.tsx` — ProductsView import edildi, view==='erp' route eklendi (customers.view.own permission check)

## Teknik Kararlar
- **Stok güncelleme tek noktadan**: PATCH /api/products/[id] stock alanını güncellemez; tüm stok değişiklikleri /stock endpoint'i üzerinden transaction içinde yapılır.
- **Opening stock movement**: Yeni ürün oluşturulurken stock>0 ise otomatik "Açılış stoğu" hareketi yazılır.
- **Low stock filtresi**: SQLite'ta Prisma ile kolonlar arası karşılaştırma (stock <= minStock) desteklenmediği için app seviyesinde filtreleme yapıldı (1000 ürün limit ile KOBİ segmenti için yeterli).
- **Referans bütünlüğü**: DELETE endpoint quoteLines'ta referans varsa 400 döner.
- **Transaction**: StockMovement oluşturma + Product.stock güncelleme db.$transaction içinde atomik.
- **Audit log**: create/update/delete/update (product.stock) action'ları yazılır.
- **Permission proxy**: ERP için ayrı yetki anahtarı olmadığından 'customers.view.own' proxy olarak kullanıldı. Tüm giriş yapmış kullanıcılar erişebilir; admin/manager 'customers.edit' yetkisine sahip olduğundan yazma işlemlerini yapabilir.

## Stage Summary
Tüm API endpoint'leri smoke test edildi (GET/POST/PATCH/DELETE + stock movements + negatif stok hata yolu). ESLint temiz, TypeScript hatasız. Dev server log'larında hata yok. 4 seed ürünü başarıyla listeleniyor; açılış stoğu hareketi otomatik oluşuyor; stok çıkışında product.stock doğru decrement ediliyor; transaction çalışıyor; referanslı ürün silinmesi doğru şekilde engelleniyor.

Faz 2 ERP-lite modülünün ürün & stok katmanı tamamlandı. Sıradaki adım teklif (Quote) ve fatura (Invoice) modülleri olabilir — Product alanı zaten QuoteLine ile ilişkili.
