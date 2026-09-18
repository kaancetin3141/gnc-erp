# Task ID: F7-PUBLIC-RANDEVU

**Agent:** Fullstack Developer (Next.js 16 + TS + Prisma)
**Date:** 2026-09-16
**Goal:** Public randevu (booking) web page on `/` route (no login required).

## Summary

Built a fully public, mobile-first booking flow that runs ON the existing `/` route by reading URL query params. Anyone can book an appointment with a service provider (kuaför/berber/diş/güzellik) by visiting URLs like `/?booking=provider&slug=sik-kuafor` — no auth required. WhatsApp confirmation link (`wa.me/...?text=...`) is generated server-side and opens in a new tab.

## Files Created

- `src/lib/slug.ts` — `slugify()` (Turkish-aware: ş→s, ı→i) and `ensureUniqueSlug()` (async, DB-backed collision check).
- `scripts/backfill-slugs.ts` — One-off script to backfill `slug` for existing providers.
- `src/app/api/public/providers/route.ts` — `GET /api/public/providers?type=&city=` → `{ items: [{ id, slug, name, type, address, city, photo, workingHours, services: [...] }] }`.
- `src/app/api/public/providers/[slug]/route.ts` — `GET /api/public/providers/{slug}` → provider + services + staff + workingHours.
- `src/app/api/public/providers/[slug]/availability/route.ts` — `GET /api/public/providers/{slug}/availability?date=YYYY-MM-DD&serviceId=X&staffId=Y` → `{ slots: [{ time: "09:00", available: true }, ...] }`. Slot interval auto-adjusted to service duration (15/30/60 min). Excludes slots overlapping with non-cancelled appointments.
- `src/app/api/public/appointments/route.ts` — `POST /api/public/appointments` body `{ providerSlug, serviceId, staffId?, date, time, customerName, customerPhone, customerEmail?, customerNote?, website? }` → `{ id, status, providerName, serviceName, date, time, whatsappLink, ... }`. Status auto-set: `onaylandi` if in working hours, else `beklemede`. Honeypot field `website` blocks bots. Returns BOTH `whatsappLink` (to provider) and `customerWhatsappLink` (to customer).
- `src/app/api/public/appointments/[apptId]/route.ts` — `GET /api/public/appointments/{apptId}` for success page deep-linking.
- `src/components/public/public-booking-flow.tsx` (~870 lines) — Mobile-first multi-step wizard driven by URL query params (`booking`, `slug`, `service`, `staff`, `date`, `time`, `apptId`). Brand color per provider type (kuafor=pink, berber=blue, disci=teal, guzellik=rose, spa=emerald, dovme=orange). Suspense-wrapped (uses `useSearchParams`). Re-exports existing shadcn/ui: Card, Button, Input, Label, Textarea, Badge, Skeleton.

## Files Modified

- `prisma/schema.prisma` — Added `slug String? @unique` to `ServiceProvider` model. Ran `bun run db:push`.
- `src/lib/seed.ts` — Hardcoded `slug: 'sik-kuafor'` on the seeded provider.
- `src/app/page.tsx` — `useSearchParams()`-based switch: when `?booking=...` present, render `<PublicBookingFlow />`; otherwise render `<AppShell />`. Wrapped in `<Suspense>` (Next.js 16 requirement).

## Concrete Steps Performed

1. **Schema** — Added `slug String? @unique` to ServiceProvider model. `bun run db:push` applied cleanly (no data loss since slug is nullable).
2. **Seed** — Set `slug: 'sik-kuafor'` on the seeded `Şık Kuaför & Berber Salonu`. Ran `scripts/backfill-slugs.ts` to set slug for the existing provider row (the seed deletes + recreates everything but the FK chain broke on re-run, so backfill was needed).
3. **API** — Wrote 4 route handlers in `src/app/api/public/...`. Each handler includes slug fallback via `slugify(name)` so older providers without explicit slug still resolve. The availability route picks `slotInterval` based on `service.duration`: 15 min for ≤20 dk services, 30 min for ≤45 dk, 60 min for >45 dk. Slot marked available only if at least one eligible staff member has no overlapping non-cancelled appointment.
4. **UI** — Built `PublicBookingFlow` with these sub-pages: `ProvidersListPage` (search + cards with photo/emoji, type badge, district/city), `ProviderDetailPage` (gradient hero header + working hours table + services grouped by category), `StaffSelectionPage` (with "Herhangi Bir Personel" option), `CalendarPage` (14-day horizontal scroll + 4-6 col time slot grid), `ConfirmPage` (summary + customer form + honeypot), `SuccessPage` (hero + details + WhatsApp button + provider info card). All steps wrapped in `Shell` component with brand-color gradient header.
5. **Page router** — `src/app/page.tsx` now reads `useSearchParams().get('booking')` and dispatches. Suspense fallback is a spinner. Without `booking` query param, the normal app shell renders (login/dashboard).
6. **Lint** — `bun run lint` returns **0 errors, 9 warnings** (all pre-existing in unrelated files; none in new code).

## Verification Results

Used `agent-browser` (iPhone 14 device emulation) to walk the entire flow:

| Screenshot | URL | Result |
|---|---|---|
| `01-providers-list.png` | `/?booking=provider` | ✓ Provider card visible: "Şık Kuaför & Berber Salonu", Kuaför badge, 6 hizmet, Kadıköy / İstanbul |
| `02-provider-detail.png` | `/?booking=service&slug=sik-kuafor` | ✓ Gradient pink hero + 6 services grouped by category (Bakım, Cilt, Sakal, Saç) |
| `03-staff-selection.png` | `/?booking=staff&slug=sik-kuafor&service=cmu3azeuc03e6v796ubf47but` | ✓ "Herhangi Bir Personel" card + 3 staff (Ahmet/Ayşe/Mehmet) with bio |
| `04-calendar.png` | `/?booking=calendar&slug=...&staff=any` | ✓ 14 date chips (Sun=kapalı) + 20 time slots (09:00-18:30) all available |
| `05-confirm.png` | `/?booking=confirm&slug=...&date=2026-09-16&time=14%3A00` | ✓ Summary (service/staff/date/price) + 4-input form (name*, phone*, email, note) |
| `06-success.png` | `/?booking=success&apptId=cmu3cu5va0005v77aqnyum64o` | ✓ "Randevunuz Oluşturuldu!" + appointment code (QNYUM64O) + WhatsApp button |
| `07-direct-provider-slug.png` | `/?booking=provider&slug=sik-kuafor` | ✓ Direct slug URL skips list and shows provider detail |
| `08-deep-link-success.png` | `/?booking=success&apptId=...` | ✓ Deep-link works — shareable appointment URL |

**WhatsApp link verified** (target=`_blank`, opens new tab):
```
https://wa.me/902165551234?text=Merhaba%2C%20...%20randevum%20var.%0AHizmet%3A%20Sa%C3%A7%20Kesimi%0A...
```

API responses verified via curl:
- `GET /api/public/providers` → 200, returns 1 provider with slug `sik-kuafor` and 6 services
- `GET /api/public/providers/sik-kuafor` → 200, returns provider + 6 services + 3 staff
- `GET /api/public/providers/sik-kuafor/availability?date=...&serviceId=...&staffId=any` → 200, returns 20 slots with `available: true/false` per slot
- `POST /api/public/appointments` → 200, returns `{ id, status: "onaylandi", whatsappLink, customerWhatsappLink, appointmentCode }`
- `GET /api/public/appointments/{apptId}` → 200, returns appointment detail with provider info + WhatsApp link

Test appointments created during verification were cleaned up (deleted).

## Key Design Decisions

1. **URL-as-state**: Each step is a query-param combination so users can use the browser back button, share deep links, and refresh without losing state. The component never reads from local/session storage — only `useSearchParams`.
2. **Brand color per provider type**: `BRAND` map (6 entries) gives each type a full Tailwind class set (`bg`, `bgSoft`, `border`, `text`, `gradient`, `emoji`). No dynamic class names — all static strings so Tailwind's JIT can extract them.
3. **Slot interval auto-tunes** to service duration (15/30/60 min). A 20-min Sakal Traşı gets 15-min slots; a 90-min Saç Boyama gets 60-min slots.
4. **Honeypot anti-bot**: Hidden `website` field in form — bots fill it, real users don't. Returns 400 if filled.
5. **Status auto-assignment**: If the requested slot is within working hours → `onaylandi` (auto-approved). If outside working hours → `beklemede` (provider must manually confirm). Both go to the same Success page.
6. **Slug fallback in every endpoint**: If a provider has `slug=null` (e.g., from before backfill), the API still resolves them by `slugify(name)` matching. This keeps the system backward-compatible.
7. **Audit log** — Each successful booking writes an `auditLog` entry with `action='public_booking'`, `actorId=null` (anonymous), `entity='appointment'`, so admins can see public traffic.
8. **Suspense boundary on `/`** — `useSearchParams()` requires Suspense in Next.js 16. Wrapped `HomeContent` in `<Suspense>` with a spinner fallback.

## Outstanding / Future Work

- Email reminders + iCal export (mentioned as "advanced features for later")
- Per-provider subdomain routing (currently all providers share `/`)
- Payment integration (deposit/prepay) — out of scope per task constraint
- Admin UI to manually edit/auto-regenerate `slug` (currently only seed + backfill script set it)
