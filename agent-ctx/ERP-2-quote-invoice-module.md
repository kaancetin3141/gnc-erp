# Task ID: ERP-2 — Quote/Invoice Module Developer

## Task
Build Quote (Teklif) + Invoice (Fatura) ERP-lite module for the Turkish CRM superapp. Includes:
- API routes for quotes (CRUD + status transitions)
- API routes for invoices (CRUD + status transitions + quote→invoice conversion)
- `QuotesView` ERP UI component (list, stats, filters, form dialog with line items, detail dialog with status actions)
- `InvoicesView` ERP UI component (same pattern as quotes, with 5 stat cards)
- Sidebar/Store/AppShell wiring for the new views

## Work Log (files created/modified)

### New API routes
1. `src/app/api/quotes/route.ts` — GET list (filter by status/customerId/search, visibility filter via `customer.ownerId IN visibleIds`, includes customer + lines + product), POST create (auto-generates `TKL-{year}-{seq}` number, calculates subtotal/taxTotal/total from lines)
2. `src/app/api/quotes/[id]/route.ts` — GET single (customer + lines + product), PATCH (status / lines replace / customer / dates, optional `createInvoice` when status=faturalandi → auto generates `FAT-{year}-{seq}` invoice with totals copied), DELETE (cascade lines, visibility check on customer.owner)
3. `src/app/api/invoices/route.ts` — GET list (filter + visibility), POST create (direct mode OR `fromQuoteId` mode that copies totals from quote + auto-sets quote.status=faturalandi)
4. `src/app/api/invoices/[id]/route.ts` — GET single, PATCH (status; `odendi` auto-sets `paidDate`, `iptal`/`odeme_bekliyor` clears it; supports direct `paidDate` and `dueDate`), DELETE (visibility check)

### New ERP UI components
5. `src/components/erp/quotes-view.tsx` (~900 lines)
   - Header with "Yeni Teklif" + "Dışa Aktar" (CSV)
   - 4 stat cards: Toplam Teklif, Bekleyen, Onaylanan, Toplam Değer
   - Filter bar with status chips (Tümü/Taslak/Gönderildi/Onaylandı/Reddedildi/Faturalandı) + search
   - Quotes table: number, customer, issueDate, validUntil, total, status badge, actions
   - Quote form dialog: customer select, currency, dates, **dynamic line items editor** with product select (auto-fills unitPrice + taxRate), live totals panel
   - Quote detail dialog: info grid + totals + line items table + status action buttons + "Faturaya Dönüştür" button when status !== faturalandi
   - Color rule respected: emerald primary, slate/amber/violet/red status colors — no indigo/blue
6. `src/components/erp/invoices-view.tsx` (~870 lines)
   - Header with "Yeni Fatura" + "Dışa Aktar"
   - 5 stat cards: Toplam Fatura, Ödeme Bekleyen, Ödenen, Geciken, Toplam Tutar
   - Filter bar with status chips (Tümü/Ödeme Bekliyor/Ödendi/Gecikti/İptal) + search
   - Invoices table with overdue row highlight + paidDate indicator
   - Invoice form dialog (kalemler sadece yeni fatura için — schema'da InvoiceLine yok)
   - Invoice detail dialog: info grid (issue/due/paid dates), totals, status action buttons
   - Color: amber primary, red/slate/emerald status colors

### Modified files
7. `src/store/app-store.ts` — added `'quotes'` and `'invoices'` to `AppView` union
8. `src/components/app/sidebar.tsx` — added `FileText` + `Receipt` icons to imports; ERP group now has 3 items (Ürün & Stok / Teklifler / Faturalar); footer banner updated to "ERP-lite Aktif"
9. `src/components/app/app-shell.tsx` — imported `QuotesView` + `InvoicesView`; added view routing for `quotes` and `invoices` with `customers.view.own` permission proxy

## Key Decisions / Notes

### Quote → Invoice conversion
- Schema has no `invoiceId` field on Quote, so the link is *implicit*: POST `/api/invoices` with `fromQuoteId` copies totals and auto-sets `quote.status='faturalandi'`. The frontend checks `status !== 'faturalandi'` to decide whether to show the "Faturaya Dönüştür" button.

### Invoice line items
- Schema has no `InvoiceLine` model. The POST `/api/invoices` accepts `lines` in the body purely for total calculation; only `subtotal`/`taxTotal`/`total` are persisted. The invoice detail dialog shows totals only (no line items table). The form shows a warning in edit mode explaining this.

### Status corrections
- Task description mentioned "reddildi" for the rejected quote status, but the Prisma schema uses `reddedildi`. Followed the schema.
- Quote statuses match schema exactly: `taslak | gonderildi | onaylandi | reddedildi | faturalandi`
- Invoice statuses match schema exactly: `odeme_bekliyor | odendi | gecikti | iptal`

### Visibility filter
- Quotes/Invoices don't have a direct `ownerId`. Visibility flows through `customer.ownerId`:
  - `where.customer = { ownerId: { in: visibleIds } }` for list queries
  - Separate visibility check on delete (fetch customer.ownerId, verify against visible set)

### Bug fix during dev
- Initial GET `/api/quotes/[id]` returned 500 because of `orderBy: { createdAt: 'asc' }` on QuoteLine — the `QuoteLine` model has no `createdAt` field. Removed the orderBy.

## Smoke Test Results (all green)

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/quotes?limit=5` | GET | 200 | Empty list initially, returns items + total |
| `/api/quotes` | POST | 200 | Created TKL-2026-001, 2 lines, totals correct (75000 + 15000 = 90000) |
| `/api/quotes/{id}` | GET | 200 | Returns quote with customer + lines + product |
| `/api/quotes/{id}` | PATCH | 200 | Status change taslak → gonderildi worked |
| `/api/quotes/{id}` | DELETE | 200 | Cascade-deleted lines |
| `/api/invoices` | POST (`fromQuoteId`) | 200 | Created FAT-2026-001, copied totals, set quote.status=faturalandi |
| `/api/invoices?limit=5` | GET | 200 | List with customer included |
| `/api/invoices/{id}` | GET | 200 | Single invoice with customer |
| `/api/invoices/{id}` | PATCH (status=odendi) | 200 | Auto-set `paidDate=now()` |
| `/api/invoices/{id}` | DELETE | 200 | Deleted |

ESLint output: `npx eslint src/components/erp/ src/app/api/quotes/ src/app/api/invoices/ src/store/app-store.ts src/components/app/sidebar.tsx src/components/app/app-shell.tsx --quiet` → empty (no warnings/errors).

Dev server log shows only successful 200 responses, no errors.

## Stage Summary
Quote + Invoice ERP-lite module is fully operational. Both list views, form dialogs with dynamic line items, detail dialogs with status actions, and quote→invoice conversion are all working. Sidebar exposes both new views under the "ERP" group. Color rule respected (emerald for quotes primary, amber for invoices primary, no indigo/blue as primary). All imports double-checked (including `useQueryClient`, `useQuery`, `useMemo`, `useEffect`, `useState` and all lucide icons used).

The frontend pages for quotes (`/` → ERP → Teklifler) and invoices (`/` → ERP → Faturalar) are now reachable from the sidebar in the Preview Panel.
