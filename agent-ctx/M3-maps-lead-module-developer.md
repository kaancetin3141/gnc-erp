# Task M3 — Maps/Lead Module Developer

## Task
Build the Google Maps Lead Mining module (M3) for the Turkish CRM superapp.
Overwrite `/home/z/my-project/src/components/maps/lead-mining-view.tsx` exporting `LeadMiningView`.

## Status: COMPLETED

## Reference files read
- worklog.md (project context, ERD, conventions)
- src/lib/constants.ts (CITIES, MAPS_CATEGORIES, LEAD_STATUSES, getLabel, getColor)
- src/lib/format.ts (formatPhone, formatDate, formatRelative, telLink, toCSV, downloadFile)
- src/lib/rbac.ts (hasPermission)
- src/lib/api-client.ts (apiGet, apiPost, apiPatch, qk)
- src/lib/maps-mock.ts (mock data shape, CITY_COORDS)
- src/types/index.ts (MapsResult, Lead, MapsSearch, UserListItem)
- src/store/app-store.ts (useAppStore)
- src/components/dashboard/dashboard-view.tsx (PATTERN REFERENCE)
- API routes: maps/search, maps/import, leads, leads/[id], users

## API contracts used
- POST /api/maps/search {query, city, radius} → {results: MapsResult[], searchId, search}
- GET  /api/maps/search → {items: MapsSearch[]}
- POST /api/maps/import {searchId, items, ownerId} → {created, skipped, searchId} (201)
- GET  /api/leads?source=google_maps → {items: Lead[], total}
- PATCH /api/leads/[id] {status:'donustu'} → Lead
- GET  /api/users → {items: UserListItem[]}

## What was built (1590 lines, single file, 4 sub-components)

### Layout
- Two-panel `grid lg:grid-cols-5`: left col-span-3 (search + results + history), right col-span-2 (sticky SVG/HTML map mock)
- Below: leads-from-maps card with status filter chips + table + convert action
- Responsive: mobile stacks vertically, desktop side-by-side

### Left Panel
1. **Search form card**: category quick-select chips (MAPS_CATEGORIES), query input, city select (CITIES), radius select (5/10/25/50 km), "Ara" button (POST /api/maps/search), loading state, cost/limit badge ("Günlük arama limiti: X/50" — color-coded green/amber/red, tooltip), CSV export button.
2. **Results card**: result count + selected count badges, "Tümünü Seç"/"Seçimi Temizle" buttons, scrollable table (checkbox, name + CRM badge, category, address, phone tel-link, web link, star rating + review count), clickable rows, "Seçilenleri Lead Olarak Aktar" button → ImportDialog.
3. **Recent searches card**: GET /api/maps/search history list (query, city badge, result count, imported count, relative time, user), clickable to re-run.

### Right Panel — MapView (SVG + HTML mock)
- SVG background: gradient + grid + seeded streets + quadratic-bezier avenues + park/water radial blobs
- HTML markers (absolute positioned): green=existsInCrm, sky=selected, slate=new; pin SVG with status dot
- Clustering: greedy proximity-based, threshold inversely proportional to zoom; cluster = circle badge with count; click cluster zooms in
- Zoom buttons (1-3, 0.5 steps) — functional (scales marker positions around center)
- Click marker → popover (name, category, address, rating, status badge, call + select buttons)
- City label (top-left), legend (bottom-left), empty states

### Import Dialog
- Summary: total / CRM-existing (skipped) / new
- Owner select (GET /api/users, "sen" tag) — initialized from store (no effect)
- POST /api/maps/import → success toast with created/skipped counts → invalidate leads + mapsSearches

### Leads from Maps (bottom)
- GET /api/leads?source=google_maps with optional status filter
- Status filter chips: Tümü + LEAD_STATUSES
- Table: name+category, city, phone, rating, status badge, owner, date, actions
- Actions: View (Eye → LeadDetailDialog with full lead info) + Convert (UserPlus → PATCH status='donustu' → toast + invalidate)

## Lint fixes applied
1. Removed `useEffect` zoom-reset in MapView → replaced with `key={searchId}` remount pattern (react-hooks/set-state-in-effect compliance)
2. Removed `useEffect` ownerId-set in ImportDialog → useState initializer reading `useAppStore.getState().user?.id` (sync persisted store)
3. Removed unused imports: `useEffect`, `Circle`, `Trash2`

## Final state
- `bun run lint` → EXIT 0 (clean)
- Dev server: GET / 200 (compiles + renders)
- worklog.md appended with full work record
