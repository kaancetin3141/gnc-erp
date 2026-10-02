# FEATURE-1-3 — Proforma & Order Tracking Developer

## Agent
Proforma & Order Developer (single-agent execution)

## Task
1. **Proforma Invoice with PDF + Send via WhatsApp/Mail** — `#1`
   - Schema: `isProforma` boolean on `Quote`, `Order` + `OrderTrackingStep` models
   - Proforma API: `GET/POST /api/proforma`, `GET/PATCH/DELETE /api/proforma/[id]`
   - PDF generator component (`proforma-pdf-generator.tsx`)
   - Send dialog (`send-dialog.tsx`) — WhatsApp + E-posta + PDF download
   - QuoteFormDialog gains a "Proforma olarak işaretle" checkbox
   - QuoteDetailDialog gains a "Gönder" button (visible when `isProforma=true`)
2. **Order Tracking System** — `#3`
   - Order API: `GET/POST /api/orders`, `GET/PATCH/DELETE /api/orders/[id]`
   - Tracking step API: `GET/POST /api/orders/[id]/tracking`
   - Orders UI: `orders-view.tsx` orchestrator (~279 lines) + 4 parts
   - Proforma → Order auto-creation when proforma status becomes `onaylandi`
   - Sidebar nav + app-shell routing for `orders` view

## Work Log
- Read context: `worklog.md` tail, `schema.prisma`, `invoices/route.ts` (+ `[id]`), `invoices-view.tsx`, `invoice-detail-dialog.tsx`, `quote-detail-dialog.tsx`, `quote-form-dialog.tsx`, `quote-utils.ts`, `parts/types.ts`, `format.ts`, `api-utils.ts`, `auth.ts`, `app-store.ts`, `sidebar.tsx`, `app-shell.tsx`, `customer-360.tsx` (PrintDocument + QuotesTab), `rbac.ts`, `api-client.ts`, `globals.css` print rules.
- **Schema** (`prisma/schema.prisma`):
  - Added `isProforma Boolean @default(false)` to `Quote`
  - Added `order Order?` back-relations on `Quote` and `Invoice`
  - Added `orders Order[]` on `Tenant` and `Customer`
  - New `Order` model: id, tenantId, customerId, quoteId (@unique), invoiceId (@unique), number, status, totalAmount, currency, orderDate, expectedDelivery, deliveredAt, notes, timestamps, `trackingSteps OrderTrackingStep[]`
  - New `OrderTrackingStep` model: id, orderId, step, note, userId, createdAt
  - Status flow: `hazirlaniyor → onaylandi → uretimde → sevk_yapildi → teslim_edildi | iptal`
  - `bun run db:push` → succeeded (SQLite, no data loss on existing tables)
- **API**:
  - `/api/proforma/route.ts` — GET (filter `isProforma=true`), POST (creates with `PRO-{year}-{seq}` number prefix and `isProforma: true`)
  - `/api/proforma/[id]/route.ts` — GET, PATCH, DELETE. **Critical:** PATCH when status → `onaylandi` AND no existing order → auto-creates an `Order` (status `onaylandi`, `totalAmount` from proforma) and an initial `OrderTrackingStep` with note `Proforma {number} onaylandı`.
  - `/api/orders/route.ts` — GET (filters: search, status, customerId), POST (auto-number `SIP-{year}-{seq}`, optional `quoteId`/`invoiceId` link, creates initial tracking step)
  - `/api/orders/[id]/route.ts` — GET (with trackingSteps), PATCH (status, expectedDelivery, notes; auto-creates `OrderTrackingStep` on status change; sets `deliveredAt` when status → `teslim_edildi`), DELETE
  - `/api/orders/[id]/tracking/route.ts` — GET (list steps), POST (add manual step + auto-update order.status)
  - All routes: `params: Promise<{ id: string }>` awaited, `tenantId` isolation, `erp.manage` permission check, `writeAuditLog` calls.
- **Types** (`parts/types.ts`):
  - `Quote` gains `isProforma?: boolean` and `order?: { id; number; status? } | null`
  - New `Order`, `OrderTrackingStep`, `OrderListResponse` interfaces
- **Utils**:
  - `proforma-utils.ts` — `PROFORMA_STATUSES`, `getProformaStatusMeta`, `buildProformaWhatsAppMessage`, `buildProformaMailSubject`, `buildProformaMailBody`
  - `order-utils.ts` — `ORDER_STATUSES` (6 states), `FILTER_STATUSES`, `getNextStep`, `isStepCompleted`, `isStepCurrent`, `emptyOrderForm`, `OrderForm` interface
  - `quote-utils.ts` — `QuoteForm` interface gains `isProforma: boolean`; `emptyQuoteForm` initializes it `false`
- **UI Components**:
  - `proforma-pdf-generator.tsx` (225 lines) — Dialog with professional print-ready HTML: company header, customer info (Sayın, address, phone, email, VKN), line items table (#, Kalem, Miktar, Birim Fiyat, KDV, Tutar), totals box (Ara Toplam, KDV, Genel Toplam), validity note + signature area, footer. Uses `print-content` class + `window.print()` for PDF.
  - `send-dialog.tsx` (335 lines) — Channel selection (WhatsApp/E-posta) with phone/email display, editable message preview (defaults to `buildProformaWhatsAppMessage`), "PDF Olarak Kaydet" button (opens `ProformaPdfGenerator`), "Gönderildi olarak işaretle" checkbox. WhatsApp opens `wa.me` link with prefilled text; e-posta opens `mailto:` with subject + body.
  - `order-form-dialog.tsx` (288 lines) — Customer select, optional quote link (filtered by customer; auto-fills totalAmount/currency), amount, currency, expectedDelivery, status select, notes textarea. Edit mode disables customer/quote fields.
  - `order-detail-dialog.tsx` (439 lines) — Info cards (Sipariş Tarihi, Beklenen Teslimat, Teslim Edildi, Tutar), customer address box, notes panel, status management buttons (6 states), suggested next-step shortcut, vertical timeline (color-coded dots, dates, notes), manual step adder (Select + note input + Add button).
  - `order-stats.tsx` (68 lines) — 6 stat cards (Toplam, Hazırlanıyor, Üretimde, Sevk Edildi, Teslim Edildi, Toplam Değer) using shared `StatCard` component.
  - `order-table.tsx` (182 lines) — Table with Sipariş No (icon + number + quote/invoice chips), Müşteri, Tarih, Beklenen, Tutar (with step count), Durum badge, İşlem (Eye + Pencil). Row click opens detail.
  - `orders-view.tsx` (279 lines) — Thin orchestrator: header (title + Dışa Aktar + Yeni Sipariş), 6 stat cards, filter bar (search + status chips + refresh), order table, footer info, dialogs (add/edit/detail).
- **Quote integration**:
  - `quote-form-dialog.tsx` — Added "Proforma Fatura olarak işaretle" checkbox at top. When checked, form posts to `/api/proforma` instead of `/api/quotes` (and PATCHes `/api/proforma/{id}`). Submit button color switches to teal-600 when proforma. Title/description adapt to "Proforma". Disables checkbox in edit mode if existing record is already a proforma.
  - `quote-detail-dialog.tsx` — Added "Gönder" button (teal-600 styled, with `Send` icon) visible only when `quote.isProforma === true`. Renders `SendDialog` + `ProformaPdfGenerator` (gated by `isProforma`) at the bottom. Delete confirmation title/description adapt ("Proformayı sil?" vs "Teklifi sil?").
- **Navigation**:
  - `app-store.ts` — Added `'orders'` to `AppView` union.
  - `sidebar.tsx` — Added `Package` icon import + `{ view: 'orders', label: 'Siparişler', icon: Package, permission: 'erp.manage' }` to ERP group.
  - `app-shell.tsx` — Added `OrdersView` import + routing block `view === 'orders'` with `erp.manage` permission check.
- **Color rule compliance**: No indigo/blue as primary. Used emerald (Teklifler), amber (Faturalar), violet (Siparişler), teal (Proforma Gönder button), slate (Hazırlanıyor status), sky is only used inside existing `quote-utils.ts` (preserved).

## Verification
- ✅ `npx eslint src/ --quiet` → **EXIT 0**
- ✅ `npx tsc --noEmit` — 0 errors in any of my new/modified files (pre-existing errors in unrelated `kanban-board.tsx`, `tasks-view.tsx`, `seed.ts`, `customer-list.tsx`, `reports/route.ts`, `search/route.ts`, `maps-mock.ts` are not affected by my changes)
- ✅ `bun run db:push` succeeded — `Order` + `OrderTrackingStep` tables created, `Quote.isProforma` column added.
- ✅ Schema validation: `quoteId` and `invoiceId` on `Order` marked `@unique` (1:1 relation with Quote/Invoice).
- ✅ All API routes use `params: Promise<{ id: string }>` and await it.
- ✅ All API routes check `tenantId` isolation.
- ✅ All API routes call `writeAuditLog` on mutations.
- ✅ No `'use client'` on route files; all ERP parts have `'use client'`.

## Files Created (12)
1. `src/app/api/proforma/route.ts` (155 lines)
2. `src/app/api/proforma/[id]/route.ts` (264 lines)
3. `src/app/api/orders/route.ts` (156 lines)
4. `src/app/api/orders/[id]/route.ts` (160 lines)
5. `src/app/api/orders/[id]/tracking/route.ts` (91 lines)
6. `src/components/erp/orders-view.tsx` (279 lines)
7. `src/components/erp/parts/order-utils.ts` (126 lines)
8. `src/components/erp/parts/order-stats.tsx` (68 lines)
9. `src/components/erp/parts/order-table.tsx` (182 lines)
10. `src/components/erp/parts/order-form-dialog.tsx` (288 lines)
11. `src/components/erp/parts/order-detail-dialog.tsx` (439 lines)
12. `src/components/erp/parts/proforma-utils.ts` (81 lines)
13. `src/components/erp/parts/proforma-pdf-generator.tsx` (225 lines)
14. `src/components/erp/parts/send-dialog.tsx` (335 lines)

## Files Modified (7)
1. `prisma/schema.prisma` — Added `isProforma` to Quote, `Order` model, `OrderTrackingStep` model, back-relations on Tenant/Customer/Quote/Invoice.
2. `src/store/app-store.ts` — Added `'orders'` to AppView.
3. `src/components/app/sidebar.tsx` — Added Package icon + Siparişler nav item.
4. `src/components/app/app-shell.tsx` — Imported OrdersView + added routing for `orders` view.
5. `src/components/erp/parts/types.ts` — Extended Quote (`isProforma?`, `order?`), added Order/OrderTrackingStep/OrderListResponse types, extended Order.customer with address/city.
6. `src/components/erp/parts/quote-utils.ts` — QuoteForm gains `isProforma` field; emptyQuoteForm initializes it false.
7. `src/components/erp/parts/quote-form-dialog.tsx` — Added "Proforma olarak işaretle" checkbox + conditional proforma endpoint routing + adaptive title/description/button.
8. `src/components/erp/parts/quote-detail-dialog.tsx` — Added "Gönder" button (visible when isProforma) + SendDialog + ProformaPdfGenerator wiring.

## Stage Summary
Two major user-facing features delivered end-to-end:

**Feature 1 — Proforma Invoice (PDF + Send via WhatsApp/Mail):**
- Users can mark a quote as "Proforma" during creation (checkbox in QuoteFormDialog).
- Proforma records use `PRO-{year}-{seq}` number prefix and are stored in `Quote` table with `isProforma=true`.
- From the QuoteDetailDialog (when viewing a proforma), a "Gönder" button opens a SendDialog that lets the user choose WhatsApp (opens `wa.me` link with prefilled message) or E-Posta (opens `mailto:` with subject + body). A "PDF Olarak Kaydet" button opens the ProformaPdfGenerator — a print-ready dialog with company header, customer info, line items table, totals, validity note, and signature area; `window.print()` lets the user save as PDF.

**Feature 2 — Order Tracking System:**
- New `Siparişler` (Orders) view in sidebar ERP group.
- Order lifecycle: Hazırlanıyor → Onaylandı → Üretimde → Sevk Edildi → Teslim Edildi (or İptal).
- Each status change (manual button or programmatic) auto-creates an `OrderTrackingStep` entry, building a vertical timeline in the detail dialog.
- Manual tracking steps can also be added (with note) — they propagate the step's status back to the order.
- Auto-link from Proforma: When a proforma's status changes to `onaylandi`, the backend automatically creates an `Order` (with `quoteId` link, `totalAmount`, currency copied from proforma, initial status `onaylandi`) and an initial tracking step `Proforma {number} onaylandı`.
- Optional quote link when manually creating an order (filtered to selected customer's quotes; auto-fills amount/currency).
- CSV export of orders.
