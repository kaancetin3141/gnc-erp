# M4 — Pipeline Module Developer — Work Record

**Task ID**: M4
**Agent**: Pipeline Module Developer
**Date**: 2025
**Component**: `src/components/pipeline/kanban-board.tsx`

## Görev

Satış Fırsatları / Pipeline Kanban modülü. @dnd-kit ile sürükle-bırak, liste görünümü, filtreler, fırsat ekleme/düzenleme/silme, kayıp nedeni akışı, CSV dışa aktarma. Türkçe, emerald/teal paleti, responsive, production-ready.

## Yapılanlar

### Dosya
- **Üzerine yazılan**: `/home/z/my-project/src/components/pipeline/kanban-board.tsx` (1815 satır)
- **Export**: `KanbanBoard` (default named export)
- **Hook up**: `src/components/app/app-shell.tsx` zaten `view === 'pipeline'` → `<KanbanBoard />` render ediyor (değişiklik gerekmedi).

### Bileşen Mimarisi (tek dosya, 13 alt bileşen)
1. `DatePicker` — Calendar + Popover, `date-fns/locale/tr`
2. `DealFormDialog` — Add & Edit (modal + AlertDialog delete confirm)
3. `LossReasonDialog` — drag-drop → kaybedildi akışı
4. `DealCardContent` + `SortableDealCard` — kart UI + dnd-kit useSortable
5. `KanbanColumn` — `useDroppable`, üst border rengi, kolon tint
6. `SortHeader` + `ListView` — sortable tablo (8 kolon)
7. `FiltersBar` — arama + owner select + stage chip'leri
8. `StatCard` — KPI kartı
9. `KanbanSkeleton` — loading durumu
10. `KanbanBoard` (main) — DndContext, query'ler, mutasyonlar, drag handlers
11. `formatCompactTr` — yardımcı (büyük sayı format)

### Veri Akışı
- `useQuery` ile `/api/deals?limit=200`, `/api/users`, `/api/customers?limit=100`
- `useMutation` ile PATCH `/api/deals/[id]` (stage değişimi) + DELETE
- `queryClient.invalidateQueries` ile deals + dashboard cache invalidate
- Client-side filtreleme (search, owner, visible stages)

### DnD Akışı
1. `onDragStart` → `setActiveDeal` (overlay için)
2. `onDragOver` → `setDropTargetStage` (kolon vurgusu)
3. `onDragEnd`:
   - Hedef stage hesapla (over.id stage mi yoksa deal id mi)
   - Normal stage → PATCH { stage, probability }
   - Kazanıldı → PATCH { stage, probability: 100 } + kazanç toast
   - Kaybedildi → `LossReasonDialog` aç, kullanıcı reason + note girince PATCH
   - Aynı stage → no-op

### Renk Paleti (DEAL_STAGES)
- yeni: slate
- iletisim: sky
- teklif: amber
- muzakere: violet
- kazanıldı: emerald (Trophy ikon, tint bg)
- kaybedildi: red (XCircle ikon, tint bg)
- Primary buton: `bg-emerald-600 hover:bg-emerald-700`

## Kalite Kontrolleri

### Lint
- `bun run lint` → **EXIT 0** (proje genelinde temiz)
- İlk denemede tek hata: `SortHeader` `ListView` içinde tanımlıydı (`react-hooks/static-components`). Çözüm: dışarı taşı, props (sortField, sortDir, onToggle) ekle.
- Kullanılmayan import'lar temizlendi (Pencil, GripVertical).

### Derleme
- Dev server (port 3000) `GET / 200` ile sorunsuz derlendi.
- `POST /api/seed 200` (1.75s) — UI aktif kullanımda, seed verisi yüklü.
- Hiç TypeScript hatası yok.

### Spec Uyumu
- [x] Header: başlık + toplam pipeline + aktif count
- [x] Butonlar: Fırsat Ekle, görünüm toggle, CSV export
- [x] Stats: aktif fırsat, bu ay kazanılan, kazanma oranı (toplam pipeline da eklendi)
- [x] Kanban: 6 kolon, başlık + count + total value, üst border rengi
- [x] Kart: title, customer (clickable → openCustomer), value, owner avatar, probability bar, expected close date, stage badge
- [x] Won/Lost tint'li (emerald/red)
- [x] Drag & drop @dnd-kit: PATCH /api/deals/[id]
- [x] Kazanıldı'ya bırakma → probability=100
- [x] Kaybedildi'ye bırakma → lossReason + lossNote dialog (zorunlu)
- [x] Toast on success
- [x] Card click → edit dialog (tüm alanlar + delete confirm)
- [x] Boş kolon: "Bu aşamada fırsat yok"
- [x] Liste görünümü: 8 kolon sortable, row click → edit
- [x] Add Deal dialog: tüm alanlar, customer search, stage → probability auto
- [x] Filters: owner select, stage chips, search
- [x] Türkçe throughout
- [x] DragOverlay smooth animations
- [x] Visual feedback during drag (opacity 0.4 + ring)
- [x] Column scroll independently (max-h + custom-scroll)
- [x] Responsive (mobilde yatay scroll)
- [x] shadcn/ui tüm bileşenler kullanıldı
- [x] Lucide ikonlar
- [x] sonner toast
- [x] Loading skeletons
- [x] cn() classes
- [x] NO indigo/blue primary (emerald/teal/amber/violet/slate)

## Notlar

- Backend `/api/deals` ve `/api/deals/[id]` route'ları (Task 2-API tarafından yazılmış) zaten tüm stage/probability/lossReason mantığını içeriyor — UI bu kontratlarla tam uyumlu, ek backend değişikliği gerekmedi.
- Optimistic update yerine `mutateAsync` + `invalidateQueries` pattern kullanıldı (daha basit, tutarlı).
- Drag sırasında kart gerçek veri array'inde hareket etmiyor; `useSortable` transform/transition ile görsel takip + `DragOverlay` clone ile smooth UX.
- Tarih formatlama: DatePicker `format(d, 'PPP', { locale: tr })` ("15 Oca 2025"), tablo ve kartlarda `formatDate` ("15.01.2025") — uygulama geneli tutarlı.
EOF
