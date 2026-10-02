# Task ID: F2-CAFE-DRAG-DAIRE-INFO
Agent: Fullstack Next.js 16 + TypeScript + Prisma
Date: 2026-09-15

## Scope
Two tasks (both completed):
- **Task A**: Fix cafe table drag-and-drop `setPointerCapture` error in `src/components/cafe/cafe-table-layout.tsx`
- **Task B**: Add Daire Sahibi (owner) + Kiracı (tenant) info to apartment creation flow (schema + UI + API)

## Files Modified
1. `src/components/cafe/cafe-table-layout.tsx` — drag handler fix (Task A)
2. `prisma/schema.prisma` — Resident model extended (Task B, 4 new fields)
3. `src/app/api/site/[id]/apartments/route.ts` — POST accepts owner + tenant payload (Task B)
4. `src/components/site/apartment-form-dialog.tsx` — UI for owner + kiracı sections (Task B)

## Key Decisions
- Used `e.currentTarget` (always the table div) instead of `e.target` (could be a child span/svg) + try/catch for the setPointerCapture fix
- Resident's new fields are all optional String?/DateTime? so existing seed data is not broken
- Apartment.residentId links to tenant first (if exists) else owner, per task spec
- Owner's `tcKimlikNo` only set for mal_sahibi; tenant's moveInDate/leaseEndDate only set for kiraci
- Used native `<Input type="date">` for date pickers (consistent with codebase pattern, no extra Popover/Calendar wiring)
- Used `useAppStore` session via `x-gnc-session` header (already established)

## Verification Performed
- `bun run lint` → 0 errors, 9 warnings (all pre-existing in unrelated files)
- `bun run db:push` → succeeded, Prisma client regenerated
- API test (curl + python): Created apartment with owner + tenant via POST /api/site/[id]/apartments; verified both Resident records persisted with correct field values; verified apartment.residentId points to tenant
- agent-browser: Logged in as Site Yöneticisi → Site Yönetimi → Blok & Daireler → Daire Ekle; confirmed new form sections render (owner: Ad Soyad, Telefon, E-posta, TC Kimlik No, Notlar; "Kiracı var" checkbox reveals tenant: Ad Soyad, Telefon, E-posta, Taşınma Tarihi, Kira Bitiş Tarihi, Notlar)
- agent-browser: Logged in as Cafe Yöneticisi → Kafe Yönetimi → Masalar; verified no JS errors on page load; simulated mouse drag on M1 table → no errors thrown (previously this would throw on `(e.target as Element).setPointerCapture`)

## Screenshots Saved
- `task-blok-daireler.png` — Blok & Daireler tab
- `task-apartment-form-new.png` — Apartment form with new owner section
- `task-apartment-form-with-tenant.png` — Apartment form with tenant section revealed (Kiracı var checked)
- `task-cafe-tables-final.png` — Cafe floor plan with M1-M5 tables (post-fix, no errors)

## Follow-up Notes
- The seed data was auto-re-run by the frontend when the database was empty after schema migration (login screen triggers `POST /api/seed` when `GET /api/auth` returns empty list). The new employee codes differ from the previously documented ones (e.g. Cafe Yöneticisi is now SAP2-012 instead of JGA1-012; Site Yöneticisi is FBPI-020 instead of N939-020).
- The `tcKimlikNo`/`notes`/`moveInDate`/`leaseEndDate` fields are not currently exposed in `GET /api/site/[id]/apartments` response's resident select clause (only id/name/phone/email/type/isActive). They ARE exposed in `GET /api/site/[id]/residents`. This is acceptable per the task scope; the data is saved correctly.
