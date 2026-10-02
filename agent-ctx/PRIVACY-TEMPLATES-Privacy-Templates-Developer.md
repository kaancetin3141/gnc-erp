# Task ID: PRIVACY-TEMPLATES
# Agent: Privacy & Templates Developer

## Task
1. **Sales Privacy (#3)** — Rep's sales visible only to themselves + manager/admin. Stock role sees NO sales/customers/reports. Other reps blocked from each other's data.
2. **Editable Message Templates (#4)** — CRUD-ready WhatsApp/E-posta/SMS templates with variable substitution (`{{musteri}}`, `{{temsilci}}`, `{{firma}}`, `{{telefon}}`, `{{tarih}}`). Customer-360 quick-action integration.

## Work Log

### Task 1: Sales Privacy — Visibility Filters

**API restrictions added:**
- `src/app/api/deals/route.ts` — `stock` & `readonly` → empty list
- `src/app/api/customers/route.ts` — `stock` → empty list
- `src/app/api/reports/route.ts` — `stock` → 403 ("Depo rolü için raporlara erişim kısıtlıdır")
- `src/app/api/reports/daily/route.ts` — `stock` → 403
- `src/app/api/dashboard/route.ts` — `stock` → `{restricted:true, message:"Depo rolü için dashboard kısıtlı"}` + empty data
- `src/app/api/invoices/route.ts` — `stock` → empty list
- `src/app/api/quotes/route.ts` — `stock` → empty list
- `src/app/api/orders/route.ts` — `stock` → empty list

**RBAC update:**
- `src/lib/rbac.ts` — `rep` role now includes `reports.view` permission (so reps can see their own performance in reports; API still filters `repPerformance` to only include the current rep via `getVisibilityFilter`).

**UI restrictions:**
- `src/components/app/sidebar.tsx` — `stock` role: nav items restricted (only `production` visible — already handled by PHOTO-PRODUCTION subagent).
- `src/components/dashboard/dashboard-view.tsx` — `stock` role or `data.restricted` shows "Depo rolü için erişim kısıtlıdır" message instead of dashboard.
- `src/components/reports/reports-view.tsx`:
  - `stock` → NoPermission card ("Depo rolü için satış raporlarına erişim kısıtlıdır")
  - `rep` → `repPerformance` filtered client-side to only show the current user (extra safety on top of API filter)
  - React Query `enabled` flag skips fetch when `user.role === 'stock'`

### Task 2: Editable Message Templates

**API created:**
- `src/app/api/templates/route.ts`
  - `GET /api/templates?type=&category=&isDefault=&search=&limit=&offset=` — list with filters
  - `POST /api/templates` — create (name, type, category, subject, content, isDefault)
  - Validates `type ∈ {whatsapp,email,sms}` and `category ∈ {genel,satis,takip,teklif,tesekkur}`
  - When `isDefault=true`, clears default flag on other templates of same type
- `src/app/api/templates/[id]/route.ts`
  - `GET` — single template
  - `PATCH` — partial update (any field)
  - `DELETE` — delete
  - All routes `await params: Promise<{ id: string }>`
  - Tenant isolation enforced (`template.tenantId === user.tenantId`)
- `src/app/api/templates/seed/route.ts`
  - `POST` — idempotent seeding of 10 default templates
  - Skips names that already exist (safe to re-run)
  - Marks first template per type as default

**10 default templates:**
1. "Hoş geldin mesajı" (whatsapp, satis)
2. "Teklif takip" (whatsapp, takip)
3. "Randevu hatırlatma" (whatsapp, takip)
4. "Teklif sunumu" (email, teklif, subject: "Teklifiniz Hazır")
5. "Teşekkür mesajı" (whatsapp, tesekkur)
6. "İletişim sonrası" (whatsapp, takip)
7. "Fiyat listesi" (email, satis, subject: "Güncel Fiyat Listemiz")
8. "Kampanya duyurusu" (whatsapp, satis)
9. "Ödeme hatırlatma" (email, takip, subject: "Ödeme Hatırlatması")
10. "Doğum günü" (whatsapp, tesekkur)

**UI created:**
- `src/components/settings/templates-view.tsx` (`TemplatesView`)
  - Header: "Hazır Yazı Şablonları" + "Yeni Şablon" + "Varsayılanları Yükle" buttons
  - Filter chips: type (Tümü/WhatsApp/E-posta/SMS) + category (Tümü/Genel/Satış/Takip/Teklif/Teşekkür)
  - Search input
  - Responsive grid (1/2/3 columns) of template cards: name, type badge, category badge, content preview, default star, copy/edit/delete actions on hover
  - Empty state + loading skeleton
  - Edit dialog (split into `TemplateEditDialog` wrapper + `TemplateEditForm` to avoid setState-in-effect lint rule — uses `key` prop to remount on templateId change)
    - Fields: name, type select, category select, subject (email only), content textarea
    - Variable helper buttons (inserts `{{musteri}}`, `{{temsilci}}`, `{{firma}}`, `{{telefon}}`, `{{tarih}}` at cursor end)
    - isDefault toggle (custom switch)
  - Copy-to-clipboard per template
  - Delete confirmation dialog
  - Mobile responsive (chips wrap, grid collapses)
- `src/components/settings/template-picker-dialog.tsx` (`TemplatePickerDialog`)
  - Two-panel layout: left = template list (filtered by `type`), right = editable preview
  - Variable substitution on selection: `{{musteri}}` = customerName, `{{temsilci}}` = user.name, `{{firma}}` = tenant.name, `{{telefon}}` = customerPhone, `{{tarih}}` = today (tr-TR)
  - For email: subject field also editable and substituted
  - "WhatsApp ile Gönder" → opens `wa.me` link with substituted text
  - "E-posta Uygulamasını Aç" → opens `mailto:` link with subject + body
  - Disabled when no customer phone/email
  - Customer info summary at top of dialog

**Integration:**
- `src/components/customers/customer-360.tsx`
  - Added state: `waTemplateOpen`, `emailTemplateOpen`
  - Added two new quick action buttons in customer header card:
    - "Şablonlu WhatsApp" (emerald icon) — opens WhatsApp template picker
    - "Şablonlu E-posta" (sky icon) — opens Email template picker
  - Original "WhatsApp" (wa.me with simple "Merhaba {name}") and "E-posta" (mailto:) buttons retained for quick access
  - Imports `TemplatePickerDialog` from `@/components/settings/template-picker-dialog`
- `src/components/users/settings-view.tsx`
  - New "Şablonlar" tab added between "Bildirimler" and "KVKK & Veri"
  - Renders `<TemplatesView />` from `@/components/settings/templates-view`
  - `MessageSquare` icon imported from lucide-react for tab trigger
- `src/lib/api-client.ts`
  - Added `templates: (params?) => ['templates', params]` to `qk` query keys

## Stage Summary

**Files created (5):**
- `src/app/api/templates/route.ts` — GET (list) + POST (create)
- `src/app/api/templates/[id]/route.ts` — GET + PATCH + DELETE
- `src/app/api/templates/seed/route.ts` — POST (idempotent seed)
- `src/components/settings/templates-view.tsx` — full CRUD UI with edit dialog
- `src/components/settings/template-picker-dialog.tsx` — customer-360 picker

**Files modified (12):**
- `src/app/api/deals/route.ts` — stock/readonly → empty
- `src/app/api/customers/route.ts` — stock → empty
- `src/app/api/reports/route.ts` — stock → 403
- `src/app/api/reports/daily/route.ts` — stock → 403
- `src/app/api/dashboard/route.ts` — stock → restricted payload
- `src/app/api/invoices/route.ts` — stock → empty
- `src/app/api/quotes/route.ts` — stock → empty
- `src/app/api/orders/route.ts` — stock → empty
- `src/lib/rbac.ts` — rep role gains `reports.view` (own performance only)
- `src/lib/api-client.ts` — added `qk.templates` query key
- `src/components/dashboard/dashboard-view.tsx` — stock restricted message + ShieldAlert icon + DashboardData interface extended with `restricted?` and `message?`
- `src/components/reports/reports-view.tsx` — stock NoPermission + rep client-side filter for repPerformance + ShieldX icon + `enabled` flag for stock
- `src/components/customers/customer-360.tsx` — added wa/email template dialog state + 2 new quick action buttons + TemplatePickerDialog rendering
- `src/components/users/settings-view.tsx` — added "Şablonlar" tab + TemplatesView import + MessageSquare icon

## Verification

- ✅ `npx eslint src/ --quiet` — EXIT 0 (0 errors, 7 unrelated warnings from pre-existing eslint-disable directives)
- ✅ Stock role: `/api/customers`, `/api/deals`, `/api/invoices`, `/api/quotes`, `/api/orders` → all return `{items:[], total:0}`; `/api/reports` → 403; `/api/dashboard` → `{restricted:true}`
- ✅ Rep role: `/api/reports` → 200, `repPerformance` contains only the rep themselves (1 entry)
- ✅ Templates API: seed → 10 created; re-run seed → 0 created (idempotent); POST/PATCH/DELETE all work
- ✅ Tenant isolation: tenant A's templates invisible to tenant B
- ✅ Dev server running cleanly on port 3000

## Color Compliance
- Primary action color: emerald-600 (templates view, picker dialogs, sidebar accent)
- WhatsApp: emerald-600
- Email: sky-600
- SMS: violet-600
- Categories: slate/emerald/amber/teal/rose
- NO indigo/blue primary colors used (the existing `text-indigo-600` in customer-360 task button is pre-existing, untouched)
