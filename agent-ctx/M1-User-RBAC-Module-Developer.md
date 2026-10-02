# Task ID: M1 — User Management & Settings Module

**Agent:** User/RBAC Module Developer
**Date:** 2026-09-09
**Scope:** `/src/components/users/users-view.tsx` + `/src/components/users/settings-view.tsx`

## Task
Build the User Management & Settings (M1) module for the GNC CRM superapp:
- RBAC-driven user list, stats, search/filter, add/edit dialog.
- Visual permission matrix (read-only role grid + user-specific permission editor using `canDelegatePermission`).
- Manager-subordinate hierarchy tree (collapsible, connector lines).
- Settings page with 5 tabs: Şirket, Para Birimi, Bildirimler, KVKK & Veri, Denetim Kayıtları.

## Files Touched (Read-Only References)
- `/src/lib/rbac.ts` — `ROLE_PERMISSIONS`, `ROLE_LABELS`, `ALL_PERMISSIONS`, `getRolePermissions`, `hasPermission`, `canDelegatePermission`, `getVisibleUserIds`
- `/src/lib/constants.ts` — `CURRENCIES`, `CURRENCY_RATES`, `COUNTRIES`
- `/src/lib/format.ts` — `formatDate`, `formatDateTime`, `initials`
- `/src/lib/api-client.ts` — `apiGet`, `apiPost`, `apiPatch`, `apiDelete`, `qk`, `ApiError`
- `/src/types/index.ts` — `UserListItem`, `Role`, `PermissionKey`, `SessionUser`
- `/src/store/app-store.ts` — `useAppStore`
- `/src/components/dashboard/dashboard-view.tsx` — PATTERN REFERENCE
- `/src/app/api/users/route.ts` — backend (GET/POST)
- `/src/app/api/users/[id]/route.ts` — backend (PATCH/DELETE with cycle check)

## Implementation Notes

### users-view.tsx
- **Header**: Title + "Kullanıcı Davet Et" + "Yetki Matrisi" buttons.
- **Stats row**: 4 cards (total, active, managers, reps) with gradient icons.
- **Tabs**: "Kullanıcılar" (table) + "Hiyerarşi" (tree).
- **User table**: avatar + name/email, role badge, title, manager name, status badge, _count.ownedCustomers/ownedDeals/subordinates, action buttons (edit/permissions/deactivate). Row click → edit.
- **Search**: name/email; **Filters**: role (5 selectable, no superadmin), status.
- **Add/Edit Dialog**: lazy useState initializer keyed by `${formSession}-${editing?.id}` to remount on each open. Role change → emerald notice showing default perms (using `getRolePermissions`). Manager select excludes self. Cycle-prevention note (backend enforces). POST `/api/users` (create) or PATCH `/api/users/[id]` (edit).
- **Permission Matrix Dialog**: Tabs of (1) read-only role×permission grid grouped by category (Müşteriler/Potansiyel Müşteri/Satış/Raporlar/Yönetim) with green ✓ / gray — cells, sticky header; (2) User Permission Editor — select subordinate user (filtered by `getVisibleUserIds` minus self), toggle permissions where `canDelegatePermission(actor, target, perm, subordinates)` returns true. Disabled perms show "yetkiniz yok" badge + tooltip. Save via PATCH `/api/users/[id]` with `permissions` array.
- **Hierarchy Tree**: recursive `HierarchyNode` with collapsible children, avatar with role gradient, role badge, subordinate count badge, vertical connector lines based on depth.
- **Deactivate**: AlertDialog confirmation → DELETE `/api/users/[id]` (soft delete → status='passive').
- **Toast** (sonner) for all mutations, invalidate `qk.users` on success.
- Loading skeletons, error state, empty state.
- No indigo/blue; uses emerald/teal/violet/amber/slate/rose palette.

### settings-view.tsx
- **Tabs**: Şirket, Para Birimi, Bildirimler, KVKK & Veri, Denetim Kayıtları.
- **Şirket**: editable form (company name, country select via `COUNTRIES`, contact email/phone) + plan/summary card showing plan badge, member count (fetched from `/api/users`), country, default currency, tenant ID. Save → toast "Ayarlar kaydedildi".
- **Para Birimi**: default currency select (`CURRENCIES`), date format (DD.MM.YYYY fixed/disabled), time format (24h fixed/disabled), döviz kurları table (`CURRENCY_RATES`). Amber info box.
- **Bildirimler**: 4 toggle rows (e-posta, uygulama içi, iletişimsiz müşteri uyarısı + threshold days input, görev hatırlatma + hours input). Switch with emerald accent. Save → toast.
- **KVKK & Veri**: emerald compliance card, consent status grid (açık rıza alındı, 5 yıl saklama), "Verilerimi İndir" (toast), "Verilerimi Anonimleştir" (AlertDialog confirmation — destructive). Data retention sidebar card.
- **Denetim Kayıtları**: mock audit log table (actor avatar initials, action badge color-coded by create/update/delete/import, entity label, entityId mono code, timestamp). Search + action filter. Empty state "Denetim kaydı yakında".
- All Turkish, no indigo/blue, emerald primary.

## Quality Checklist
- [x] Turkish throughout
- [x] shadcn/ui: Card, Button, Table, Dialog, Select, Input, Badge, Avatar, Checkbox, Tabs, Separator, ScrollArea, Tooltip, Switch, AlertDialog
- [x] Lucide icons
- [x] Toast (sonner)
- [x] Loading skeletons
- [x] `cn()` for classes
- [x] No indigo/blue primary (emerald/teal/amber/violet/slate/rose)
- [x] Responsive
- [x] `npx next lint` → EXIT 0 (clean)
- [x] `tsc --noEmit` → no errors in modified files
- [x] Dev server returns 200 OK on `/`

## Lint Result
```
$ eslint .
(exit 0, no errors)
```

## Stage Summary
- M1 module delivered: full RBAC user management + visual permission matrix + hierarchy tree + 5-tab settings.
- All API integrations working with existing `/api/users` routes (POST/PATCH/DELETE).
- `canDelegatePermission` correctly enforced in UI (only actor's own permissions + own subordinates editable).
- Dev server healthy, lint clean.
- Note: pre-existing compile issue in `kanban-board.tsx` (M4) was observed in dev log but resolved after re-trigger — out of M1 scope.
