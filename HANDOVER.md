# GNC CRM — Agent Geçiş Dokümanı (Handover)

> Bu doküman, projeye devam edecek AI agentları (LLM) için hazırlanmıştır.
> İnsan kullanıcılar için [README.md](./README.md) ve [PRESENTATION.md](./PRESENTATION.md)'ye bakın.

## 📌 Proje Kimliği

- **Proje Adı**: GNC CRM + ERP Süperapp
- **Teknoloji**: Next.js 16 (App Router) + TypeScript + Prisma + SQLite + shadcn/ui
- **Port**: 3000 (dev server)
- **Veritabanı**: `db/custom.db` (SQLite)
- **SDK**: z-ai-web-dev-sdk v0.0.18

## 🚀 Hızlı Başlangıç (Agent için)

```bash
# 1. Sunucuyu başlat (her zaman bu komutla)
cd /home/z/my-project
pkill -9 -f "next" 2>/dev/null; sleep 3
nohup bash -c 'cd /home/z/my-project && NODE_OPTIONS="--max-old-space-size=2048" NEXT_TELEMETRY_DISABLED=1 npx next dev -p 3000' > dev.log 2>&1 &
disown
sleep 15
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://localhost:3000/

# 2. Lint kontrolü
npx eslint src/ --quiet

# 3. Şema değişikliği varsa
bun run db:push

# 4. Demo verisi sıfırlama (gerekirse)
curl -X POST http://localhost:3000/api/seed -H "Content-Type: application/json"
```

## ⚠️ Kritik Bilgiler

### OOM Sorunu (EN KRİTİK)
- **Sandbox**: 4GB RAM, Turbopack büyük component'leri derlerken OOM
- **Geçici çözüm**: `NODE_OPTIONS=--max-old-space-size=2048` (yukarıdaki komutta var)
- **Kalıcı çözüm**: Büyük component'leri böl:
  - `customer-360.tsx` (2250 satır) — alt component'lere ayır
  - `kanban-board.tsx` (1834 satır) — KanbanColumn, DealCard ayrı dosyalar
  - `lead-mining-view.tsx` (1599 satır) — MapView, ResultsTable ayrı

### Tek Route Kısıtı
- **SADECE** `/` route'u var (App Router, SPA mimarisi)
- Tüm görünümler Zustand store ile yönetilir: `useAppStore` → `view` state
- Client-side navigation, URL değişmez
- Navigation: `setView('customers')`, `openCustomer(id)`

### Auth Sistemi
- **Demo auth**: Kullanıcı seçimi → session = userId
- Session header: `x-gnc-session: <userId>`
- Login API: `POST /api/auth { userId }` → `{ sessionId, user }`
- Admin userId (demo): `cmtupc2ga0003u9261ucf9oab`
- Rep userId (demo): `cmtupc2gx0009u92681zva6ds`
- Stock userId (demo): `cmtwbts6j0001nmebmo69eqo3`

### Veritabanı Erişimi
```typescript
import { db } from '@/lib/db'
// Prisma Client — global singleton, log: ['query']
```

### API Route Pattern (Next.js 16)
```typescript
// params artık Promise! Mutlaka await edin
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // ...
}
```

## 📂 Mimari Genel Bakış

### Veri Akışı
```
Browser → Zustand (view state) → Component → TanStack Query → API Route → Prisma → SQLite
```

### Katmanlar
1. **UI** (`src/components/`) — React + shadcn/ui, 'use client'
2. **State** (`src/store/`) — Zustand (persist), TanStack Query
3. **API** (`src/app/api/`) — Next.js Route Handlers, tenant izolasyonu
4. **DB** (`src/lib/db.ts`) — Prisma Client
5. **RBAC** (`src/lib/rbac.ts`) — Rol + yetki + görünürlük

### Güvenlik Katmanları (3 katman)
1. **API**: `requirePermission(user, 'erp.manage')` — her route'ta
2. **UI**: `hasPermission(user, 'perm')` — sidebar/app-shell'de
3. **Veri**: `getVisibilityFilter(user)` — tenant + ownerId filtresi

## 📊 Modül Durumları

| Modül | Durum | Dosya | Notlar |
|-------|-------|-------|--------|
| Dashboard | ✅ Stabil | `src/components/dashboard/` | Widget'lar + KPI + trend |
| Müşteriler | ✅ Stabil | `src/components/customers/` | 360° + fotoğraf + tür |
| Lead Madenciliği | ✅ Stabil | `src/components/maps/` | Mock Places + harita |
| Pipeline | ⚠️ Büyük dosya | `src/components/pipeline/` | 1834 satır — böl |
| Görevler | ✅ Stabil | `src/components/tasks/` | AI + otomasyon |
| Raporlar | ✅ Stabil | `src/components/reports/` | 10 bölüm + ERP + gün sonu |
| ERP (Ürün/Teklif/Fatura/Sipariş) | ✅ Bölündü | `src/components/erp/parts/` | 24 dosya |
| Kafe ERP | ✅ Stabil | `src/components/cafe/` | 7 component |
| AI | ✅ Stabil | `src/components/ai/` | Potansiyel analizi |
| Chat | ✅ Stabil | `src/components/chat/` | Polling-based |
| Admin Panel | ✅ Stabil | `src/components/admin/` | 3 kolonlu |
| Users | ✅ Stabil | `src/components/users/` | Yetki ağacı |

## 🔧 Düzenli Bakım Görevleri

### Her Agent Turunda Yapılacaklar
1. `worklog.md` oku (tail -50) — son durumu anla
2. Sunucuyu başlat (yukarıdaki komut)
3. `npx eslint src/ --quiet` — hata kontrolü
4. API health check: `curl` ile test
5. Değişiklik sonrası lint + compile kontrolü
6. `worklog.md`'ye iş kaydı ekle (append, `---` ile başla)

### Worklog Formatı
```markdown
---
Task ID: <unique-id>
Agent: <agent-name>
Task: <kısa açıklama>

Work Log:
- <adım 1>
- <adım 2>

Stage Summary:
- <sonuçlar>
```

## 🎯 Öncelik Sıralaması (Sıradaki Agent için)

1. **OOM kalıcı çözüm** — customer-360.tsx ve kanban-board.tsx'i böl
   - Her alt component'i ayrı dosyaya taşı (TimelineTab, NotesTab, DealsTab, vb.)
   - Hedef: Her dosya < 500 satır
   - Pattern: `src/components/erp/parts/` dizinine bak (başarıyla bölündü)

2. **Kafe seed verisi** — `src/lib/seed.ts`'ye kafe demo verisi ekle
   - 2 kafe, her birine 8-10 masa, menü kategorileri + ürünler, 3-5 sipariş

3. **Gerçek PDF** — jsPDF kütüphanesi ile teklif/fatura PDF üretimi

4. **Socket.io** — Mesajlaşma + kafe sipariş akışı için realtime

## 📁 Önemli Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `prisma/schema.prisma` | 32 model — tüm veritabanı şeması |
| `src/lib/rbac.ts` | 9 rol, 20+ yetki, görünürlük fonksiyonları |
| `src/lib/api-utils.ts` | getSession, requirePermission, getVisibilityFilter |
| `src/lib/format.ts` | Tarih (DD.MM.YYYY), para (TRY), telefon (E.164) format |
| `src/lib/constants.ts` | Sektörler, şehirler, aşamalar, segmentler |
| `src/store/app-store.ts` | Zustand — view, session, selectedCustomer |
| `src/components/app/app-shell.tsx` | Ana router — view → component |
| `src/components/app/sidebar.tsx` | Navigasyon — rol bazlı |
| `src/app/globals.css` | Tema + özel CSS (print, scrollbar, animasyon) |

## 🚫 Yapılmaması Gerekenler

- ❌ `bun run build` çalıştırma — sandbox'ta OOM
- ❌ Yeni route ekleme — sadece `/` route'u olmalı
- ❌ z-ai-web-dev-sdk'yi client-side kullanma — sadece backend
- ❌ Port numarasını URL'e yazma — `XTransformPort` query param kullan
- ❌ Supabase/Postgres bekleme — SQLite kullan
- ❌ Test dosyası yazma — bu projede test yok

## ✅ Yapılması Gerekenler

- ✅ Her değişiklikten sonra `npx eslint src/ --quiet` çalıştır
- ✅ API değişikliğinde `curl` ile test et
- ✅ `worklog.md`'ye her tur kayıt ekle
- ✅ Component'leri 500 satır altında tut
- ✅ Türkçe UI metinleri kullan
- ✅ Emerald/teal/amber/violet renk paleti (indigo/blue YOK)
- ✅ Mobil responsive (sm:/md:/lg: breakpoint'leri)
- ✅ `params: Promise<{...}>` — Next.js 16 async params

## 📞 Sorun Giderme

### Sunucu çöktü
```bash
pkill -9 -f "next"; sleep 3
nohup bash -c 'cd /home/z/my-project && NODE_OPTIONS="--max-old-space-size=2048" NEXT_TELEMETRY_DISABLED=1 npx next dev -p 3000' > dev.log 2>&1 &
disown; sleep 15
```

### Şema değişikliği
```bash
bun run db:push  # şemayı uygula
# Prisma Client otomatik yenilenir
```

### Lint hatası
```bash
npx eslint src/<dosya> --quiet  # tek dosya
npx eslint src/ --quiet          # tüm proje
```

### Agent Browser OOM
- Next.js + Chromium beraber OOM oluyor
- Mümkünse `curl` ile API testi yap, görsel QA'yı sınırlı tut
- VLM analizi için ekran görüntüsü alıp `z-ai vision` kullan
