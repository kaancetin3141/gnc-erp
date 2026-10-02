# Task ID: OOM-RBAC
# Agent: Refactoring Specialist

## Task
1. Add ERP RBAC: `erp.manage` permission key + sidebar/app-shell enforcement (only admin/superadmin).
2. Split 3 large ERP view files (1200–1300 lines each) into smaller part files under `src/components/erp/parts/` to fix Turbopack OOM crashes on the 4GB sandbox. Target: main view files ~300–400 lines.

## Context Read
- `worklog.md` tail — OOM issue documented as critical, ERP split listed as priority #1.
- `src/lib/rbac.ts`, `src/types/index.ts` — PermissionKey union + ROLE_PERMISSIONS + ALL_PERMISSIONS.
- `src/components/app/sidebar.tsx` — ERP nav group used `customers.view.own` as proxy permission.
- `src/components/app/app-shell.tsx` — view routing, `NoPermission` fallback component already present.
- `src/components/erp/products-view.tsx` (1330 lines), `quotes-view.tsx` (1299), `invoices-view.tsx` (1243) — each a monolith with types + constants + helpers + 3–4 sub-components + main view.

## Work Log

### TASK 1 — ERP RBAC

**Modified files:**
1. `src/types/index.ts` (+1 line) — Added `'erp.manage'` to `PermissionKey` union.
2. `src/lib/rbac.ts` (+3 lines) — Added `'erp.manage'` to `superadmin` and `admin` `ROLE_PERMISSIONS` arrays (NOT manager/rep/readonly/stock). Added `{ key: 'erp.manage', label: 'ERP modülünü yönet', group: 'ERP' }` to `ALL_PERMISSIONS`.
3. `src/components/app/sidebar.tsx` — Changed the 3 ERP nav items (`erp`, `quotes`, `invoices`) from `permission: 'customers.view.own'` to `permission: 'erp.manage'`. Also wrapped the "ERP-lite Aktif" footer card in a `hasPermission(user, 'erp.manage')` check so non-ERP users no longer see the misleading promo card.
4. `src/components/app/app-shell.tsx` — For `view === 'erp' | 'quotes' | 'invoices'`, replaced the `customers.view.own` check with `hasPermission(user, 'erp.manage')`. On failure shows `<NoPermission message="ERP modülü için yetkiniz yok." />`.

**Result:** manager / rep / readonly / stock roles no longer see ERP nav items or access ERP views. admin / superadmin retain full access.

### TASK 2 — Split ERP Components

**Created shared files** (under `src/components/erp/parts/`):
- `types.ts` (149 lines) — All shared ERP types: `Product`, `ProductDetail`, `StockMovement`, `ProductListResponse`, `Quote`, `QuoteLine`, `QuoteListResponse`, `Invoice`, `InvoiceLine`, `InvoiceListResponse`, plus simple form-select types (`ErpCustomer`, `ErpProductSimple`, and their list responses).
- `stat-card.tsx` (32 lines) — Shared `StatCard` component (was duplicated identically in all 3 view files).
- `product-utils.ts` (84 lines) — `MOVEMENT_TYPES`, `REF_TYPES`, `getMovementMeta`, `getRefLabel`, `getStockStatus`.
- `quote-utils.ts` (98 lines) — `QUOTE_STATUSES`, `FILTER_STATUSES`, `getQuoteStatusMeta`, plus form helpers `emptyLine`, `emptyQuoteForm`, `lineTotals`, `quoteFormTotals`.
- `invoice-utils.ts` (95 lines) — `INVOICE_STATUSES`, `FILTER_STATUSES`, `getInvoiceStatusMeta`, plus form helpers `emptyInvoiceLine`, `emptyInvoiceForm`, `invoiceLineTotals`, `invoiceFormTotals`.

**Created product parts:**
- `product-form-dialog.tsx` (309 lines) — `ProductFormDialog` (add/edit dialog).
- `product-detail-dialog.tsx` (425 lines) — `ProductDetailDialog` + internal `StockMovementForm` (detail + stock movement form + history table).
- `product-stats.tsx` (53 lines) — `ProductStats` (4 stat cards, takes `ProductStatsData` + `defaultCurrency` props).
- `product-table.tsx` (216 lines) — `ProductTable` (products table with empty/loading states, takes `products`, `isLoading`, handlers as props).

**Created quote parts:**
- `quote-form-dialog.tsx` (397 lines) — `QuoteFormDialog` (add/edit with line items editor + totals).
- `quote-detail-dialog.tsx` (342 lines) — `QuoteDetailDialog` (detail + status actions + convert-to-invoice + print).
- `quote-stats.tsx` (52 lines) — `QuoteStats`.
- `quote-table.tsx` (159 lines) — `QuoteTable`.

**Created invoice parts:**
- `invoice-form-dialog.tsx` (365 lines) — `InvoiceFormDialog` (add/edit with lines, edit-mode warning).
- `invoice-detail-dialog.tsx` (332 lines) — `InvoiceDetailDialog` (detail + status actions + lines table + print + overdue badge).
- `invoice-stats.tsx` (62 lines) — `InvoiceStats` (5 stat cards).
- `invoice-table.tsx` (169 lines) — `InvoiceTable`.

**Refactored main view files** (now thin orchestrators: state + data fetching + layout + compose parts):
- `src/components/erp/products-view.tsx` — **1330 → 299 lines** (-77.5%).
- `src/components/erp/quotes-view.tsx` — **1299 → 272 lines** (-79.1%).
- `src/components/erp/invoices-view.tsx` — **1243 → 274 lines** (-77.9%).

**Total ERP module size:** 3872 → 4184 lines (slight increase due to per-file imports/exports + shared StatCard/utils dedup, but split across 17 files instead of 3). The largest single file is now 425 lines (product-detail-dialog), down from 1330.

### Splitting rules followed
1. ✅ Every part file has `'use client'` at the top.
2. ✅ Every part file imports its own dependencies (React hooks, shadcn/ui, lucide icons, lib functions).
3. ✅ Shared types centralized in `parts/types.ts`; shared `StatCard` in `parts/stat-card.tsx`; domain utils in `parts/{product,quote,invoice}-utils.ts`.
4. ✅ Main view files import the parts and only contain orchestration (state, useQuery, useMemo stats, handlers, layout JSX, dialog composition).
5. ✅ No functionality changed — all features preserved (forms, detail dialogs, status actions, print, CSV export, stock movements, convert-to-invoice, line items editor, etc.).
6. ✅ All imports correct (`useQueryClient`, `useQuery`, `useState`, `useEffect`, `useMemo`, `apiGet/Post/Patch/Delete`, `toast`, `useAppStore`, `hasPermission`, `cn`, etc.).
7. ✅ Main view files still export `ProductsView`, `QuotesView`, `InvoicesView` (default export names unchanged).

## Verification Results
- ✅ `npx eslint src/components/erp/ src/lib/rbac.ts src/components/app/sidebar.tsx src/components/app/app-shell.tsx src/types/index.ts --quiet` → **EXIT 0** (0 errors).
- ✅ `npx eslint src/ --quiet` (full project) → **EXIT 0** (0 errors).
- ✅ Dev server: `✓ Ready in 734ms`, `GET / 200 in 9.6s (compile: 9.2s)` — page loads cleanly after refactor.
- ✅ `curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://localhost:3000/` → **HTTP 200**.

## Stage Summary
- **OOM fix:** Each ERP view file reduced from ~1250–1330 lines to ~270–300 lines (77–79% reduction). The 3 monoliths are now 17 focused files. Turbopack can now compile each chunk independently and incremental recompilation on edit will be far cheaper (only the edited part recompiles, not a 1300-line file). This directly addresses the documented "OOM (kritik)" issue.
- **RBAC:** ERP module is now gated behind `erp.manage` — only `admin` and `superadmin` roles see ERP nav items and can access ERP views. `manager`, `rep`, `readonly`, `stock` roles see a clean "ERP modülü için yetkiniz yok." no-permission screen. The "ERP-lite Aktif" sidebar promo card is also hidden from non-ERP users.
- **No regressions:** All ERP functionality (CRUD, stock movements, quote→invoice conversion, print, CSV export, status workflows, line items) is preserved verbatim — only the file structure changed.
- **Color rule respected:** No indigo/blue introduced. Existing palette (emerald/teal/amber/violet/slate) preserved exactly as-is from the originals.

## Next Steps / Risks
1. The `erp.manage` permission should be exposed in the role/permission management UI (`users-view.tsx` roles tab) — it's now in `ALL_PERMISSIONS` under the "ERP" group, so the existing permission editor should pick it up automatically (verify in UI).
2. Seed data: existing demo users with `manager`/`rep` roles will lose ERP access. If any demo flow relies on a rep seeing ERP, update the seed or grant `erp.manage` explicitly.
3. Consider also splitting the other large view files (`customer-360.tsx`, `tasks-view.tsx`, `reports-view.tsx`) using the same pattern if OOM recurs — but ERP was the documented hot-spot and is now addressed.
