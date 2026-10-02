# Task ID: BUILD-SITE-LATEFEE-SEED — Work Record

**Agent**: Fullstack Next.js 16 + TypeScript + Prisma
**Date**: 2025-09-14
**Task**: Site late-fee calculation (aidat overdue) + seed data for cafe (paid orders) + market (sales) so dashboards show real revenue.

## Reading Prior Agents' Work
- `agent-ctx/BUILD-SITE-APARTMENT-Fullstack-Site-Developer.md` — Site module architecture (Blocks/Apartments/Dues UI)
- `agent-ctx/BUILD-REPORTS-SECTOR-Fullstack-Developer.md` — Sector-based dashboard fetchers
- `agent-ctx/MARKET-ERP-Market-Module-Developer.md` — Market seed data
- `agent-ctx/CAFE-ERP-cafe-module-developer.md` — Cafe seed data
- `worklog.md` lines 4693–4955 (RESEARCH-4) and 4957–5036 (BUILD-SITE-APARTMENT) — context for this task

## Summary of Changes

### A. Late Fee
1. **`prisma/schema.prisma`** — `lateFee Float @default(0)` field was already present in `Dues` model (line 1105). Verified via `bun run db:push` ("already in sync" + Prisma Client 6.19.2 regenerate 422ms).
2. **`src/app/api/site/[id]/dues/route.ts` POST generateAll** — After `createMany`, if `dueDate.getTime() < now.getTime()`, automatically `updateMany` to set `status: 'gecikti'`, `lateFee: round2(dueAmount * 0.05)`, `lateFeeAppliedAt: now`, `notes`. Response now includes `markedLate`, `lateFeeApplied`, `totalLateFee`, `message`. Added `writeAuditLog` call.
3. **`src/app/api/site/[id]/dues/route.ts` new PATCH handler** — `action: 'calculate-late-fees'` body. Step 1: `status='odenmedi' AND dueDate<now` → `status='gecikti'`. Step 2: `status='gecikti' AND lateFee=0` → `lateFee = amount * 0.05`. Returns `{ markedLate, lateFeeApplied, totalLateFee, message }`. Old POST `/calculate-late-fees` subroute preserved for backward-compat.
4. **`src/components/site/site-view.tsx`** — "Gecikmeleri Hesapla" button changed from `apiPost('/dues/calculate-late-fees', {})` to `apiPatch('/dues', { action: 'calculate-late-fees' })`. "Bu Ay Aidat Oluştur" button response type updated to include `markedLate/lateFeeApplied/totalLateFee/message` fields and now uses `r.message` for toast. Late-fee column already existed (no change needed).

### B. Seed Data
5. **`src/lib/seed.ts`** — Market shelves trimmed from 6 to 5 (removed D1 Temizlik entry to match spec "5 Shelf"). Updated header comment. Cafe seed section already satisfied all spec requirements (1 Cafe, 5 CafeTable M1-M5, 3 MenuCategory, 12 MenuItem, 7 paid CafeOrder spread over 30 days, 2-3 items each, CafePayment per order). Market seed section already satisfied all spec requirements (1 Market, 5 Shelf now, 15 Product, 3 Barcode, 3 PosShift [1 open today + 2 closed past week], 18 MarketSale [cash/card/mixed payment methods, 2-5 items each, subtotal/taxTotal/total populated, cashAmount+cardAmount=total when mixed]).

### Bonus Bug Fix
6. **`src/lib/dashboard-sectors.ts:34`** — `getCafeDashboardData` had `const rangeStartCafe = rangeStart < dayStart ? dayStart : rangeStart` clamp. This bug defeated the date range filter — when user selected "30G", "Bu Ay", "Çeyrek", or "Tümü", the cafe dashboard only showed today's revenue. Clamp removed → `const rangeStartCafe = rangeStart`. After fix, cafe dashboard shows 2,031 ₺ / 7 sipariş at 30G range (was 616 ₺ / 2 sipariş). Market dashboard fetcher was already correct (no clamp).

## Verification

### Lint
```bash
$ bun run lint
✖ 9 problems (0 errors, 9 warnings)
```
All 9 warnings are pre-existing "Unused eslint-disable directive" in unrelated files. **0 errors** in any files we touched.

### Browser Verification (agent-browser)
3 screenshots saved in `upload/latefee-seed-verification/`:
- `01-cafe-dashboard.png` (186 KB) — Cafe Yöneticisi dashboard, 30G range, "Dönem Cirosu 2.031 ₺ / 7 sipariş" ✓
- `02-market-dashboard.png` (178 KB) — Market Yöneticisi dashboard, 30G range, "Dönem Satışı 2.034,75 ₺ / 17 fiş" ✓
- `03-site-aidatlar-latefee.png` (82 KB) — Site Yöneticisi Aidatlar tab after clicking "Gecikmeleri Hesapla" button, rows showing "Gecikti" badge + "+37,50 ₺" late fee + "787,50 ₺" total + "Gecikti %5 zam" sub-label

### API Call Verification (dev.log)
- `POST /api/seed 200` (1445ms) — seed ran successfully with counts: `cafeOrdersPaid: 7`, `marketShelves: 11` (6 CRM + 5 Anadolu Market), `marketSales: 21` (18 Anadolu + 3 CRM)
- `PATCH /api/site/{siteId}/dues 200` (85ms) — new PATCH endpoint called by "Gecikmeleri Hesapla" button ✓
- `GET /api/dashboard?range=30d 200` (29ms) — cafe dashboard with 30-day range, correct revenue shown
- `GET /api/dashboard?range=30d 200` (38ms) — market dashboard with 30-day range, correct revenue shown

## Files Touched
| File | Action | LOC |
|------|--------|-----|
| `prisma/schema.prisma` | verified (no change needed — lateFee already present) | — |
| `src/app/api/site/[id]/dues/route.ts` | modified (added late-fee logic to POST generateAll + new PATCH handler) | 103 → 234 |
| `src/components/site/site-view.tsx` | modified (button calls apiPatch + updated response type) | 2 spots |
| `src/lib/seed.ts` | modified (market shelves 6→5, header comment updated) | 2 spots |
| `src/lib/dashboard-sectors.ts` | modified (removed broken rangeStart clamp in cafe fetcher) | 1 line |

## Notes for Future Agents
1. Old `POST /api/site/[id]/dues/calculate-late-fees` route file is still present (backward-compat). Site-view no longer calls it. Could be removed in a cleanup task.
2. `LATE_FEE_PCT = 0.05` is hardcoded in two route files. RESEARCH-4 #4 suggested `TenantSetting.site.lateFeePct` field — still TODO.
3. Site dashboard doesn't yet show late-fee totals as a separate KPI (could be a future enhancement).
4. Cafe dashboard fetcher bug fix in `dashboard-sectors.ts:34` was necessary to satisfy spec's "Cafe dashboard should show real revenue (e.g. 2,000-5,000₺)" requirement. The clamp was preventing multi-day ranges from being applied to "Dönem Cirosu" KPI.
5. `ShelfItem` records aren't created in seed (shelves and products are standalone — they're only linked through `ShelfItem` which is empty in seed). Removing the D1 shelf doesn't break any references.
