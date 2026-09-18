# F1-AUTH-PROGRAM-ADMIN — Fullstack Developer Work Record

**Agent**: Full-stack Developer (Next.js 16 + TS + Prisma)
**Task ID**: F1-AUTH-PROGRAM-ADMIN
**Date**: 2026-09-15

## Goal
Authorization system overhaul:
1. Add "Program Admini" demo user (superadmin role) — DONE
2. Restrict `admin.access` permission to ONLY superadmin — DONE
3. Restrict "Dağıtım Merkezi" (distribution view) to ONLY superadmin — DONE (mapped to admin.access)
4. Company admins (admin role) see only their own sector in the permission matrix (Admin Panel) — DONE
5. Sidebar/View permission enforcement — DONE

## Files Modified

| # | File | Lines Changed | Purpose |
|---|------|---------------|---------|
| 1 | `src/lib/rbac.ts` | -2 | Remove `admin.access` from admin role base + `getAdminPermissionsForTenant` base (keep in superadmin only) |
| 2 | `src/types/index.ts` | 0 | `admin.access` already in PermissionKey union |
| 3 | `src/components/app/sidebar.tsx` | +3 / -1 | Distribution view permission: `dashboard.view` → `admin.access` |
| 4 | `src/components/app/app-shell.tsx` | 2 lines | viewPermissions `distribution: 'dashboard.view'` → `'admin.access'`; ProtectedView message updated |
| 5 | `src/lib/seed.ts` | +33 | GNC Süperapp Platform tenant + Program Admini user; employeeCode loop skip for program admin |
| 6 | `src/lib/tenant-sector.ts` | +80 | `ALL_PERMISSION_GROUP_NAMES` const + `getVisiblePermissionGroups(sector)` helper |
| 7 | `src/components/admin/admin-panel.tsx` | +50 / -25 | UserDetail accepts `currentUser` prop; filter permByGroup by visible groups based on logged-in user's role/sector; amber filter banner; "X / Y" counter |

## Verification

### Lint
```
$ bun run lint
✖ 9 problems (0 errors, 9 warnings)
```
0 errors. 9 pre-existing "Unused eslint-disable" warnings.

### Seed
```
POST /api/seed → 200
{tenants:6, users:18, ...}  (was users:17 before; +1 = Program Admini)
```

### Program Admini user in DB
- email: program.admin@gnccrm.app
- name: Program Admini
- role: superadmin
- title: Program Yöneticisi
- tenant: GNC Süperapp Platform
- employeeCode: GNC-001
- permissions: 41 (includes admin.access ✓)

### Admins (role=admin) in DB after change
All 6 admins (Demir Yıldız, Hakan Aydın, Cafe/Market/Kuaför/Site Yöneticisi) have `admin.access: false`. Permission counts: 26/26/16/15/13/13.

### Browser verification — 5 screenshots in `upload/auth-verification/`
1. `01-program-admin-distribution-view.png` — Program Admini → sidebar shows both Dağıtım Merkezi + Admin Paneli; Distribution Center view opened.
2. `02-program-admin-admin-panel.png` — Admin Paneli opened, tree shows "👑 Program Admini 1" under "KULLANICILAR 1".
3. `03-program-admin-perm-matrix-all-groups.png` — Right panel "TANIMLI YETKİLER 41" shows ALL 15 permission groups (no filter for superadmin).
4. `04-cafe-admin-sidebar-no-admin-no-distribution.png` — Cafe Yöneticisi → sidebar has only 8 items; Dağıtım Merkezi + Admin Paneli NOT visible.
5. `05-cafe-admin-perm-matrix-filtered.png` — Cafe admin with manually-granted admin.access → "6 / 17" counter + amber banner "Yetki matrisi kendi sektörünüze göre filtrelenmiştir" + only "Genel" and "Kafe" groups visible.

## Test scenarios executed
- Login as Program Admini → Sidebar shows both Admin Paneli + Dağıtım Merkezi ✓
- Open Admin Panel → Click user row → All 15 permission groups shown ✓
- Open Dağıtım Merkezi view → Loads successfully ✓
- Login as Cafe Yöneticisi → No Admin Paneli, no Dağıtım Merkezi in sidebar ✓
- Grant admin.access to Cafe Yöneticisi via DB → Login → Open Admin Panel → Click user row → Only Genel + Kafe groups visible (filter active, "6 / 17" counter) ✓
- DB cleaned up after defensive test (re-seed) ✓

## Notes for next agents
- Tenant-bazlı admin/overview API (`GET /api/admin/overview`) filtreliyor `where: { tenantId: user.tenantId }`. Bu yüzden superadmin (Program Admini) Admin Paneli'nde yalnızca KENDİ tenant'ındaki kullanıcıları görür (sadece kendisi). Cross-tenant superadmin view için admin API'lerinin tenant filtresini superadmin için kaldırması gerekir. Bu task'ın kapsamı dışındaydı.
- `getVisiblePermissionGroups` sektör mapping'inde spec'teki "Analiz" → "Raporlar" kullanıldı çünkü backend ALL_PERMISSIONS'ta grup adı `Raporlar`.
- `employeeCode` override bug fix: `for (const u of allUsers)` döngüsüne `if (u.email === 'program.admin@gnccrm.app') continue` eklendi — Program Admini'nin "GNC-001" kodu korunuyor.
