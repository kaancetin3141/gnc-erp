# M6 — Raporlar & Analiz Modülü

**Task ID:** M6
**Agent:** Reports Module Developer
**Tarih:** 2026-09-09

## Görev
M6 Reports & Analytics modülü için production kalitesinde analytics dashboard geliştirme. 9 bölüm: KPI özeti, satış hunisi, ciro trendi, kazan/kayıp analizi, maps lead dönüşümü, aktivite performansı, temsilci performansı, en iyi müşteriler, iletişimsiz müşteriler.

## Yapılan İşler

### 1. API Genişletmesi — `/src/app/api/reports/route.ts`
Mevcut API yanıt şeması 9 bölümün veri ihtiyacını tam karşılamıyordu; backward-uyumlu şekilde şu yeni alanlar eklendi:
- `lossReasons: { reason, count }[]` — kaybedilen fırsatların neden dağılımı (kayıp fırsatlar `lossReason` alanından gruplandı).
- `totalRevenue: number` — tüm kazanılan fırsatların cirosu.
- `topCustomers[].lastActivityAt: string | null` — her top müşteri için son aktivite tarihi.
- `staleCustomers: { id, name, city, ownerId, ownerName, lastActivityAt }[]` — 30+ gün iletişimsiz müşteri listesi (ilk 50 kayıt, `lastActivityAt asc`).
- `mapsLeadConversion.contactedCount / qualifiedCount / byCity` — funnel adımları + şehir dağılımı.
- `activitiesOverTime: { date, count }[]` — son 30 gün, gün gün (boş günler dahil, 0 ile).
- `repPerformance[].winRate: number` — her temsilci için kazanma oranı (won/(won+lost)).
- Deal select'ine `lossReason` alanı eklendi; müşteri select'ine `lastActivityAt` eklendi.
- `staleCustomersCount` mevcut yapısı korundu.

### 2. Frontend — `/src/components/reports/reports-view.tsx`
Tek dosya, `ReportsView` export. ~1500 satır.

**Header:** Başlık "Raporlar & Analiz", tarih aralığı seçici (Select — visual, son 7g/30g/90g/6a/1y/tümü), "Tümünü Dışa Aktar" XLSX butonu.

**Bölüm 1 — KPI Summary (4 kart):** Toplam Pipeline Değeri, Kazanma Oranı (%), Dönüşüm Oranı (Maps leads), Toplam Ciro. Her kart gradient ikon (emerald-teal, amber-orange, violet-purple, sky-cyan). Halka ikonu + alt bilgi satırı.

**Bölüm 2 — Satış Hunisi (BarChart):** Yatay BarChart. Her aşama için fırsat sayısı + toplam değer çift bar. `DEAL_STAGES` sırasına göre, her aşamaya özel renk (slate/sky/amber/violet/emerald/rose). Altında 6 küçük kart ile özet (count + value + progress bar).

**Bölüm 3 — Ciro Trendi (AreaChart):** Son 6 aylık ciro. Linear gradient dolgu (amber). Ortalama ve toplam özetleri header'da.

**Bölüm 4 — Kazan/Kayıp Analizi:**
- Sol: PieChart donut — kazan/kayıp sayısal dağılım. Orta delikte büyük %winRate yazısı.
- Sağ: Kayıp nedenleri yatay bar listesi (renkli, %60+ kırmızı, %30-60 amber).
- Alt: 2 mini kart (kazanıldı yeşil + yukarı ok, kaybedildi kırmızı + aşağı ok).

**Bölüm 5 — Maps Lead Dönüşümü:**
- Sol: 4 adımlı funnel (Toplam Lead → İletişim → Nitelikli → Dönüştü). Her adımın rengi farklı (sky/teal/amber/emerald). Adıma özel ikon. Her adımda bir önceki adıma göre % geçiş.
- Sağ: Şehre göre lead dağılımı yatay BarChart (sky rengi, opaklık değere göre değişiyor).
- Header'da % dönüşüm Badge.

**Bölüm 6 — Aktivite Performansı (Tabs):**
- "Tip Bazında" sekmesi: BarChart (her tip ayrı renkli bar — emerald/violet/sky/teal/amber/rose/slate) + sağda tiplerin breakdown listesi (ikon + bar + %).
- "Zaman İçinde" sekmesi: AreaChart (violet gradient), son 30 gün gün gün.

**Bölüm 7 — Temsilci Performansı (Table):**
- Sıralanabilir (sortKey + sortDir state, 5 kolon: isim, aktivite, kazanılan, kazanç, kazanma %).
- En iyi performans vurgulu kart (Crown ikon, amber-emerald gradient bg).
- Top performer satırı amber tint'li.
- Win rate için mini progress bar + renk kodu (>=60 emerald, >=30 amber, <30 rose).
- `SortHeader` component modül seviyesine taşındı (lint react-hooks/static-components kuralı).

**Bölüm 8 — En İyi Müşteriler (Table):**
- Top 10, kazanılan değerine göre.
- Müşteri adı tıklanabilir → `openCustomer(id)`.
- İlk 3 sıraya altın/gümüş/bronz renk kodu.
- Son aktivite tarihi + gün sayısı (renkli: >30g rose, >14g amber, diğer emerald).
- Değer dağılımı mini bar (lg ekranlarda).

**Bölüm 9 — İletişimsiz Müşteriler (List):**
- Sol tarafta renk kodlu dikey çubuk (60+ gün/iletişim yok → rose, 30-60 → amber).
- Müşteri adı tıklanabilir → `openCustomer(id)`.
- Şehir + sorumlu bilgisi (UserCog ikonu).
- Gün sayısı büyük fontla, kritikse rose rengi.
- "Görev" butonu her satırda (toast ile görsel feedback — M5 modülüne bağlanacak).
- Liste maksimum 460px yükseklik, custom scrollbar.
- Toplam kayıt > gösterilen ise "ilk N kayıt" notu.

### 3. Bonus Fix
`/src/components/pipeline/kanban-board.tsx` (M4 modülü) içinde `import { format, tr } from 'date-fns'` hatası tüm app'i kırıyordu. `import { format } from 'date-fns'` + `import { tr } from 'date-fns/locale'` olarak düzeltildi. Bu fix olmadan dev server compile hatası veriyordu.

## Teknik Detaylar

### Renk Paleti (indigo/blue yok)
- emerald `#10b981`, teal `#14b8a6`, amber `#f59e0b`, violet `#8b5cf6`, rose `#f43f5e`, sky `#0ea5e9`, slate `#64748b`
- `STAGE_COLORS`, `ACTIVITY_COLOR_HEX`, `LOSS_COLOR_HEX` map'leri modül seviyesinde.

### Export Fonksiyonu
- `exportCSV`: `toCSV` + `downloadFile` (text/csv;charset=utf-8, BOM'lı — Excel UTF-8 açar).
- `exportXLSX`: HTML tablosu üretir, `application/vnd.ms-excel` mime ile indirir (Excel native açar).
- Her bölümde hem CSV hem XLSX butonu.
- "Tümünü Dışa Aktar" tek XLSX — `buildFullReport()` tüm bölümleri tek tabloda birleştirir.
- Boş veri kontrolü: toast.error ile uyarı.
- Başarı durumunda: toast.success + dosya adı.

### Recharts Kullanımı
- `BarChart` (layout="vertical" ve default), `AreaChart`, `PieChart` (donut innerRadius), `LineChart` (as AreaChart with gradient).
- `ResponsiveContainer` — tüm grafikler mobilde stack.
- `Tooltip` — `chartTooltipStyle` ile tutarlı görünüm (popover bg, border, font size).
- `Cell` — her bar/pie slice için ayrı renk.
- `Legend`, `CartesianGrid`, `XAxis`, `YAxis`, `defs` (linearGradient).

### State & Data
- `useQuery(qk.reports, () => apiGet('/api/reports'))` — 60 saniye refetch.
- Loading → `ReportsSkeleton` (header + KPI kartları + 9 section skeleton).
- Error → Error card with "Yeniden dene" butonu.
- Empty state → her bölümde EmptyState component (ikon + title + description).
- `useState` dateRange (visual, henüz backend filtresine bağlı değil — şimdilik placeholder).

### Responsive
- Grid'ler `grid-cols-2 lg:grid-cols-4` (KPI), `lg:grid-cols-2` (bölüm içi).
- Tablo kolonları `hidden sm:table-cell`, `hidden md:table-cell`, `hidden lg:table-cell` ile progressif açılır.
- Grafik yükseklikleri 260-320px arası, ResponsiveContainer.

### shadcn/ui Kullanımı
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Button` (variants: ghost, outline, default; sizes: sm)
- `Table`, `TableHeader`, `TableBody`, `TableHead`, `TableRow`, `TableCell`
- `Badge` (variant="outline" + custom colors)
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- `Skeleton`
- `Progress`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`

### Lucide İkonlar
BarChart3, TrendingUp, Trophy, Target, DollarSign, Filter, Download, FileSpreadsheet, Users, MapPin, Activity, Phone, Mail, MessageCircle, StickyNote, CheckSquare, ArrowUpRight, ArrowDownRight, Calendar, AlertTriangle, Crown, ChevronUp, ChevronDown, UserCog, Building2, ListChecks, Plus, LineChart, PieChart.

## Lint & Test Sonuçları
- `bun run lint` → EXIT 0 (sıfır hata, sıfır uyarı).
- `next lint` → temiz.
- `curl /api/reports` → 200 OK, tam veri şeması döndü.
- `curl /` → 200 OK (app shell yüklendi).
- Dev server log: hata yok, sadece prisma query log'ları.

## Stage Summary
- M6 Reports modülü production-ready. 9 bölüm tamamlandı, her bölüm kendi export butonuyla (CSV + XLSX).
- API genişletildi (backward-uyumlu), tüm gerekli veriler döndürülüyor.
- Renk paleti tutarlı (emerald/teal/amber/violet/rose/sky/slate — indigo/blue yok).
- Loading/error/empty state'ler her senaryo için mevcut.
- Tüm grafikler mobil uyumlu.
- Bonus: M4 modülündeki date-fns import hatası düzeltildi — app çalışır hale geldi.
- Sıradaki adım: M5 Tasks modülünün gerçek implementasyonu (görev oluşturma butonu oraya bağlanacak).
