# Task ID: BUILD-AUDIT-LOG
Agent: Full-stack Next.js 16 + TypeScript + Prisma (Build)
Date: 2025-09-14
Task: Build audit log viewer — AuditLog model exists, writeAuditLog() helper exists in src/lib/auth.ts:111, build API + Admin Paneli tab and verify writeAuditLog calls in customers/invoices/deals/auth routes.

## Özet
Bu görevin **tüm deliverable'ları zaten mevcuttu** (önceki görevlerde paralel olarak eklenmiş — BUILD-REPORTS-SECTOR, ADMIN-PANEL veya PRIVACY-TEMPLATES). Bu task bir **verification pass** olarak çalıştırıldı: API endpoint'inin spec ile birebir uyumu, Admin Paneli tab'ının doğru component'leri kullanması, writeAuditLog çağrılarının gerekli route'larda mevcudiyeti ve browser E2E akışı doğrulandı. Lint 0 hata, runtime E2E geçti.

## 1. Deliverable 1 — `/api/audit/route.ts` GET Endpoint

**Dosya**: `src/app/api/audit/route.ts` (74 satır) — mevcut, spec ile birebir uyumlu.

| Spec | Implementasyon | Doğrulama |
|------|---------------|-----------|
| Permission: `audit.view` (admin/superadmin) | `requirePermission(user, 'audit.view')` line 12-13 | ✅ admin/superadmin RBAC'de tanımlı (`src/lib/rbac.ts:48,27`) |
| Returns tenant's audit logs | `where: { tenantId: user!.tenantId }` line 26-27 | ✅ tenant izolasyonu |
| Filters: ?entity, ?action, ?actorId, ?limit, ?cursor | line 16-23 — tümü `url.searchParams.get(...)` ile okunuyor | ✅ |
| Include actor {id,name,email} | `include: { actor: { select: { id: true, name: true, email: true } } }` line 46-48 | ✅ |
| JSON.parse before/after if present | `safeJsonParse<unknown>(log.before, null)` line 65-66 | ✅ |
| Order by createdAt DESC | `orderBy: { createdAt: 'desc' }` line 49 | ✅ |
| Use `db.auditLog.findMany` | line 41 | ✅ |
| Cursor-based pagination | `take: limit + 1` → `hasMore = items.length > limit` → `nextCursor` ISO date | ✅ |
| Response: `{ items, nextCursor }` | `ok({ items: parsed, nextCursor })` line 73 | ✅ |

### API doğrulaması (curl)
- `GET /api/audit?limit=5` → 5 item + `nextCursor` ✓
- `GET /api/audit?action=login&limit=3` → sadece login action'ları ✓
- `GET /api/audit?entity=customer&limit=2` → sadece customer entity'leri ✓
- `GET /api/audit?actorId=cmu1lq7qz...&limit=2` → sadece Demir Yıldız'ın logları ✓
- `GET /api/audit?limit=2&cursor=2026-09-14T19:08:44.999Z` → cursor'dan eski kayıtlar ✓
- Limit clamp: `Math.min(Math.max(limitParam, 1), 500)` (maks 500)

## 2. Deliverable 2 — `src/components/admin/admin-panel.tsx` "Denetim Kayıtları" Tab

**Dosya**: `src/components/admin/admin-panel.tsx` (1628 satır) — mevcut, spec ile uyumlu.

### Yapı
- `AuditLogsTab()` fonksiyonu: line 919-1239 (320 satır)
- Tipler: `AuditLogItem` (line 819), `AuditLogsResponse` (line 829)
- Sabitler: `AUDIT_ENTITY_LABELS`, `AUDIT_ACTION_COLORS`, `AUDIT_ACTION_LABELS`, `AUDIT_ENTITY_OPTIONS`, `AUDIT_ACTION_OPTIONS` (line 835-906)
- Yardımcılar: `prettyJson()` (line 909)

### Spec uyumu
| Spec | Implementasyon | Doğrulama |
|------|---------------|-----------|
| shadcn Tabs | `<Tabs defaultValue="customers">` line 1437 + `<TabsTrigger value="audit">` line 1443 | ✅ |
| shadcn Table | `<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableCell>` line 1058-1152 | ✅ |
| shadcn Select | 3 adet `<Select>`: entity (line 998), action (line 1009), actorId (line 1020) | ✅ |
| shadcn Dialog | `<Dialog open={!!selectedLog}>` line 1186, before/after `<pre>` block'lu içerik | ✅ |
| Paginated cursor-based list | `useInfiniteQuery` (line 944) + `fetchNextPage` + `getNextPageParam: lastPage.nextCursor` | ✅ |
| Row click → Dialog | `<TableRow onClick={() => setSelectedLog(log)}>` line 1076-1080 + Eye button (line 1133) | ✅ |
| before/after JSON in `<pre>` | `<pre className="text-[11px] leading-relaxed font-mono...">` line 1222 & 1230 — `prettyJson(selectedLog.before)` ve `prettyJson(selectedLog.after)` | ✅ |
| apiGet from `@/lib/api-client` | `apiGet<AuditLogsResponse>(`/api/audit?${params.toString()}`)` line 952 | ✅ |
| useQuery/useInfiniteQuery from `@tanstack/react-query` | import line 4 | ✅ |
| formatRelative/formatDateTime from `@/lib/format` | import line 46, kullanım line 1083-1087 | ✅ |
| lucide-react ikonlar | History, Filter, ScrollText, ChevronLeft, Loader2, RefreshCw, Eye, Clock, Hash, Activity, ListTree, ShieldCheck, ... line 40-45 | ✅ |
| TS strict | tüm tipler açık — `AuditLogItem`, `AuditLogsResponse`, `useInfiniteQuery<...>` parametre tipleri | ✅ |
| Refresh button | `<Button variant="outline" size="sm" onClick={() => refetch()}>` line 985 | ✅ |
| Loading state | `isLoading ? <Skeleton>` 8 satır line 1046-1050 | ✅ |
| Empty state | `allItems.length === 0 ?` ScrollText ikon + mesaj line 1051-1055 | ✅ |
| "Daha fazla yükle" button | `hasNextPage && <Button onClick={() => fetchNextPage()}>` line 1158-1173 | ✅ |
| Filter reset | "Filtreleri Temizle" ghost button line 1034 | ✅ |
| Record count badge | `<Badge variant="outline">{allItems.length} kayıt{hasNextPage ? '+' : ''}</Badge>` line 1038-1040 | ✅ |
| KVKK info note | "Denetim kayıtları ... 5 yıl saklanır" line 1176-1182 | ✅ |
| Sticky table header | `<TableHeader className="sticky top-0 z-10">` line 1059 | ✅ |
| Custom scrollbar | `style={{ scrollbarWidth: 'thin' }}` line 1057 | ✅ |
| Responsive (hidden md:table-cell ID col) | line 1065, 1116 | ✅ |

### TabsList (line 1438-1447)
```
<TabsTrigger value="customers">Müşteriler & Roller</TabsTrigger>
<TabsTrigger value="audit">Denetim Kayıtları</TabsTrigger>
```

## 3. Deliverable 3 — `writeAuditLog` Çağrılarının Doğrulanması

Tüm gerekli route'larda `writeAuditLog` çağrısı mevcut:

| Route | Method | Action | Entity | Lines | before/after |
|-------|--------|--------|---------|-------|--------------|
| `/api/auth/route.ts` | POST (login) | `login` | `session` | line 46-51 | (yok) |
| `/api/customers/route.ts` | POST (create) | `create` | `customer` | line 161-168 | after: customer |
| `/api/customers/[id]/route.ts` | PATCH | `update` | `customer` | line 108-116 | before: existing, after: updated |
| `/api/customers/[id]/route.ts` | DELETE | `delete` | `customer` | line 134-141 | before: existing |
| `/api/invoices/route.ts` | POST (fromQuoteId modu) | `create` | `invoice` | line 202-209 | after: invoice (safeJsonParse) |
| `/api/invoices/route.ts` | POST (direct mode) | `create` | `invoice` | line 289-296 | after: invoice (safeJsonParse) |
| `/api/deals/[id]/route.ts` | PATCH | `update` | `deal` | line 93-99 | before: existing, after: updated |
| `/api/deals/[id]/route.ts` | DELETE | `delete` | `deal` | line 119-126 | before: existing |

### Tüm route'larda writeAuditLog çağrısı sayısı (grep ile özet)
- Toplam 45 `src/app/api/**` dosyası `writeAuditLog` çağırıyor
- Önemli olanlar: customers (3 çağrı), invoices (2), deals (2 PATCH+DELETE), auth (1 login)
- Ekstra: cafe (10 route), market (5 route), site (5 route), messages, expenses, automation, products (4), quotes, proforma, appointments (6), tasks (2), leads (2), templates (3), users, attachments

**Hiçbir eksik çağrı yok** — task'ta listelenen 6 çağrı noktasının tümü mevcut.

## 4. Lint Sonucu

```bash
$ bun run lint
✖ 9 problems (0 errors, 9 warnings)
```

- **0 hata** — bizim değişikliklerimizden kaynaklı hiçbir hata yok
- 9 warning — `Unused eslint-disable directive` admin-panel (2), chat-view (1), customer-360 (1), customer-list (1), product-detail-dialog (1), product-table (1), production-view (1), photo-upload (1) — **hepsi pre-existing**, bu task'a ait değil

## 5. Browser Doğrulaması — E2E (agent-browser)

### Akış
1. `agent-browser open http://localhost:3000/` + `cookies clear` + `storage local clear` + reload → demo login ekranı
2. `click "DY Demir Yıldız"` (button ref e4) → dashboard yüklendi, "Merhaba, Demir 👋" başlığı görüldü
3. Sidebar'da `find text "Admin Paneli" click` → admin paneli yüklendi (TabsList + 2 tab: "Müşteriler & Roller" + "Denetim Kayıtları")
4. `find role tab click --name "Denetim Kayıtları"` → tab aktive oldu (`data-state="active"`)
5. İçerik yüklendi:
   - 3 filter (entity, action, actorId) — `Tüm varlıklar / Tüm işlemler / Tüm kullanıcılar`
   - `<Table>` içinde 15 satır (ilk 100 audit log)
   - İlk satır: "14.09.2026 19:16 az önce · DY Demir Yıldız · demo@anadolu.com · Giriş · Oturum" (login log — bu görevin curl testinde yaratıldı)
   - 7. satır: "13.09.2026 14:08 1 gün önce · AÇ Ahmet Çelik · Dışa Aktar · Oturum"
   - "7 kayıt" badge (filtre sonrası)

### Filtre etkileşimi
- Action filter dropdown açıldı → 8 seçenek (Tüm işlemler, Oluştur, Güncelle, Sil, Giriş, Çıkış, İçe Aktar, Dışa Aktar)
- "Giriş" seçildi → tablo sadece 7 login log'u gösterdi, tüm satırların action'ı "Giriş" — `allLogin: true` doğrulandı
- Badge: "7 kayıt"

### Row click → Dialog (before/after JSON)
- İlk satıra tıklama (login, before/after yok) → Dialog açıldı:
  - Title: "Giriş · Oturum" (action Badge + entity label)
  - Desc: "Aktör: Demir Yıldız · 14.09.2026 19:16"
  - 2 `<pre>` elementi — ikisi de "—" (login action'ında before/after yok)
- "Oluştur" action'lı bir satıra tıklama (entityId `cmu1lq…x0gr`) → Dialog açıldı:
  - Title: "Oluştur · Oturum"
  - `before` pre içeriği: `{\n  "status": "eski"\n}` (22 char)
  - `after` pre içeriği: `{\n  "status": "yeni"\n}` (22 char)
  - JSON pretty-printed with 2-space indent ✓

### Screenshot'lar (`/home/z/my-project/upload/`)
- `audit-tab-loaded.png` — Denetim Kayıtları tab yüklendi (15 satır)
- `audit-logs-tab.png` — Full page screenshot (85 KB)
- `audit-dialog-with-json.png` — Dialog'da before/after JSON `<pre>` ile gösteriliyor
- `audit-filtered-login.png` — "Giriş" filtresi uygulandı (7 satır)

### Console / Errors
- `agent-browser eval` çağrıları sırasında runtime error yok
- Dev log (`/home/z/my-project/dev.log`) temiz — sadece Next.js 16.1.3 Turbopack startup + 401 unauthorized API çağrıları (login öncesi, beklenen davranış)

## 6. Mimari Tutarlılık

### Audit log yazma pattern'i (tüm route'larda aynı)
```ts
await writeAuditLog({
  tenantId: user!.tenantId,
  actorId: user!.id,
  action: 'create' | 'update' | 'delete' | 'login' | 'export' | 'import' | 'logout',
  entity: 'customer' | 'deal' | 'invoice' | 'session' | ...,
  entityId: <id>,
  before: <previous state> | undefined,
  after: <new state> | undefined,
})
```

### Audit log okuma pattern'i (`/api/audit`)
- `getSession(req)` → session resolve
- `requirePermission(user, 'audit.view')` → 403 if not admin/superadmin
- Query param parse → `where` objesi
- Cursor-based pagination: `take: limit + 1` → `hasMore = items.length > limit` → `slice(0, limit)` → `nextCursor`
- `include: { actor: { select: { id, name, email } } }` → aktör bilgisi
- `safeJsonParse(log.before, null)` / `safeJsonParse(log.after, null)` → before/after JSON
- Response: `ok({ items: [...parsed], nextCursor })`

### Frontend pattern (`AuditLogsTab`)
- `useInfiniteQuery` ile cursor-based pagination (initialPageParam: null, getNextPageParam: lastPage.nextCursor)
- `data.pages.flatMap((p) => p.items)` → tüm yüklü item'lar
- Filter state → queryKey'e gömülü → cache invalidation proper
- Row click → Dialog state (selectedLog) → before/after JSON `<pre>` block

## 7. Notlar
- Bu görev bir **verification pass** olarak çalıştırıldı. Tüm deliverable'lar (API, Admin Paneli tab, writeAuditLog çağrıları) önceki görevlerde (muhtemelen ADMIN-PANEL, PRIVACY-TEMPLATES, ERP modül görevleri) eklenmişti; bu görev spesifikasyonu ile birebir uyum sağladığı doğrulandı.
- `src/components/users/settings-view.tsx:592` hala `MOCK_AUDIT` sabit listesini gösteriyor — bu, RESEARCH-4 #2 maddesinde de belirtildiği gibi, settings panelinin kendi "Denetim Kayıtları" sekmesidir ve gerçek `AuditLog` verisini göstermez. Ancak task spesifikasyonu `admin-panel.tsx`'e tab eklenmesini istiyor, settings-view.tsx'in değiştirilmesini değil — bu yüzden settings-view.tsx'e dokunulmadı. Admin panelindeki "Denetim Kayıtları" tab'ı tamamen gerçek DB verisi kullanıyor.
- "Settings → Denetim Kayıtları" (mock) ve "Admin Paneli → Denetim Kayıtları" (gerçek) iki ayrı yerde mevcut. RESEARCH-4 önerisi `settings-view.tsx` mock'unu gerçek veriyle değiştirmekti, ama task spesifikasyonu bunu kapsamıyor. Gelecekte settings-view'daki mock kaldırılabilir (admin panel ile çakışıyor).
