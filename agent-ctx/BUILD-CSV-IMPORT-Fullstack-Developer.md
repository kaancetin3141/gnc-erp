# BUILD-CSV-IMPORT — Fullstack Developer Agent

## Task
RESEARCH-4 #9.0 — Bulk CSV/Excel import for customers (identified as missing feature, score 9.0). Build CSV/XLSX bulk import flow: API route, dialog component, customer-list button integration.

## Context Reviewed
- `prisma/schema.prisma` → `Customer` model (tenantId, name, sector, segment, ownerId, source, address, city, district, country, lat/lng, phone, email, web, taxNumber, customerType, status, tags, kvkkConsent, annualRevenue, employeeCount).
- `src/components/customers/customer-list.tsx` → already had `BulkImportDialog` imported + "Toplu İçe Aktar" button + `importOpen` state (wired by previous agent).
- `src/app/api/customers/bulk-import/route.ts` → already existed with full spec-compliant POST handler (permission, dup check, transaction, audit log).
- `src/components/customers/bulk-import-dialog.tsx` → already existed but used `react-dropzone` (spec says skip) and had `<SelectItem value="">` (Radix crash bug).
- `package.json` → `papaparse`, `@types/papaparse`, `xlsx` already installed; `react-dropzone` also installed but spec says don't use it.

## Work Done

### 1. Refactored `src/components/customers/bulk-import-dialog.tsx`
- **Removed `react-dropzone`** (`useDropzone`, `getRootProps`, `getInputProps` imports removed).
- **Added plain `<input type="file" ref accept=".csv,.xls,.xlsx" className="sr-only">`** triggered via `onClick={() => fileInputRef.current?.click()}` on the visible drop region.
- **Native drag-drop preserved** via local `onDrop`/`onDragOver`/`onDragLeave` handlers + `isDragOver` state (no extra package).
- **Fixed Radix Select crash bug**: `<SelectItem value="">` → `<SelectItem value="__none__">` (sentinel); `onValueChange` maps `"__none__"` back to `""`. Without this fix, uploading a file caused "Application error: a client-side exception" because Radix Select does not allow empty-string `SelectItem` values.
- **Added English header aliases** to `FIELD_ALIASES`: `Name`, `Sector`, `City`, `Address`, `District`, `Country`, `Status` (Email/Phone/Web/Website already present). This enables auto-mapping of English-headered CSVs.
- Trimmed template from 3 sample rows to 1 (spec says "1 example row").
- All existing logic preserved: papaparse (CSV) + xlsx (Excel) parsing, field mapping Select, 5-row preview Table, "Şablon İndir" button (`toCSV` + `downloadFile`), `useMutation` + `apiPost('/api/customers/bulk-import')`, `qc.invalidateQueries(['customers'])`, sonner toast, 3-card result view (imported/skipped/errors), Progress bar.

### 2. API route `src/app/api/customers/bulk-import/route.ts` — verified, no changes
Already spec-compliant:
- POST, `requirePermission(user, 'customers.edit')`.
- Body `{ customers: CustomerImportRow[] }`.
- tenantId from user, default ownerId=user.id if missing.
- Dup skip on same email OR (name+taxNumber) — DB preload + in-batch `seenInBatch` Set.
- `db.$transaction` batch insert (50/batch), single-row retry on batch failure.
- `writeAuditLog({ action:'bulk_import', entity:'customer', after:{imported,skipped,errors,totalRows} })`.
- Returns `{ imported, skipped, errors }`.

### 3. `src/components/customers/customer-list.tsx` — verified, no changes
- Line 61: imports `BulkImportDialog`.
- Line 483: `const [importOpen, setImportOpen] = useState(false)`.
- Lines 599–604: `canEdit &&` button "Toplu İçe Aktar" (Upload icon) directly after "Dışa Aktar" (canExport block, lines 593–598).
- Line 1073: `<BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />`.
- Existing export/search/filter/pagination/360 features untouched.

## Lint
```
$ bun run lint
✖ 9 problems (0 errors, 9 warnings)
```
0 errors. 9 warnings — all pre-existing "Unused eslint-disable directive" in unrelated files (admin-panel, chat-view, customer-360, customer-list, product-detail-dialog, product-table, production-view, photo-upload). None from this task.

## Browser Verification (agent-browser)
Test CSV `/tmp/test-customers.csv` (3 rows, EN headers: Name, Email, Phone, Sector, City):
```
Name,Email,Phone,Sector,City
Anadolu Lojistik A.Ş.,lojistik@anadolu-test.com,+905551112233,Lojistik,İstanbul
Marmara Ticaret Ltd.,ticaret@anadolu-test.com,+905552223344,Ticaret,İzmir
Ege Tekstil San.,tekstil@anadolu-test.com,+905553334455,Tekstil,Bursa
```

Flow:
1. open localhost:3000 → cookies/storage clear → reload → demo login.
2. click "DY Demir Yıldız Şirket Admini" → dashboard.
3. sidebar "Müşteriler" → customer list.
4. click "Toplu İçe Aktar" → BulkImportDialog open (drop region + "Şablon İndir").
5. upload `/tmp/test-customers.csv` → preview + auto-mapping (Name→Ad, Email→E-posta, Phone→Telefon, Sector→Sektör, City→Şehir) + "İçe Aktar (3)" enabled.
6. screenshot `01-bulk-import-preview.png`.
7. click "İçe Aktar (3)" → `POST /api/customers/bulk-import 200` (114ms) → `GET /api/customers?limit=100 200` (invalidate triggered refetch) → result: "3 İçe Aktarıldı / 0 Atlandı / 0 Hata".
8. screenshot `02-bulk-import-result.png`.
9. click "Kapat" → list shows 3 new customers with correct sector + city (Anadolu Lojistik/Lojistik/İstanbul, Marmara Ticaret/Ticaret/İzmir, Ege Tekstil/Tekstil/Bursa).
10. screenshot `03-customers-after-import.png`.
11. Bonus: re-open dialog → click "Şablon İndir" → sonner toast "Şablon indirildi" (Blob download triggered).

Screenshots saved to `/home/z/my-project/upload/csv-import-verification/`:
- `01-bulk-import-preview.png` (98 KB)
- `02-bulk-import-result.png` (84 KB)
- `03-customers-after-import.png` (79 KB)

## Files Touched
- `src/components/customers/bulk-import-dialog.tsx` — rewritten (removed react-dropzone, plain input, Radix Select bug fix, EN aliases).
- `src/app/api/customers/bulk-import/route.ts` — verified, no changes.
- `src/components/customers/customer-list.tsx` — verified, no changes.
- `worklog.md` — appended "Task ID: BUILD-CSV-IMPORT" section.
- `/tmp/test-customers.csv` — created for verification.
- `upload/csv-import-verification/*.png` — 3 screenshots.

## Known Issues / Follow-ups
- `react-dropzone` package still in `package.json` (not removed — may be used elsewhere; removing risks breaking other code). Dialog no longer imports it.
- Template download in headless browser doesn't persist to project `download/` dir (Blob URL triggered via `<a download>` — browser-managed). Toast confirms function executed.
- The 9 lint warnings are pre-existing in unrelated files; fixing them is out of scope.
