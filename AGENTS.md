# AGENTS.md — Çoklu-Ajan Orkestrasyon Haritası

> **Bu dosya nedir?** Bu projede çalışan TÜM ajanların ortak kuralları, rol haritası,
> handoff şemaları ve durum makinelerinin tek kaynağıdır.
> Her ajanın "Zorunlu Başlangıç Sırası"nın **1. adımı budur** — bu dosya okunmadan
> plan, kod, karar veya onay üretme.

---

## 📁 1. Dosya Haritası

```
AGENTS.md                      ← bu dosya: orkestrasyon haritası (herkes okur)
agents/                        ← 10 ajan rol dosyası (kısa davranış özetleri)
  ceo.md · debugger.md · designer.md · developer.md · devops.md
  frontend.md · product-manager.md · research.md · security.md
  technical-writer.md
skills/                        ← 12 skill (düşünme modları + rol detay tanımları)
  opus55-thinking/SKILL.md     ← dikkatli/planlı/verifikasyon odaklı mod
  kimik3-thinking/SKILL.md     ← hızlı/builder odaklı mod
  ceo-strategy-agent/SKILL.md  developer-agent/SKILL.md
  debugger-qa-agent/SKILL.md   designer-agent/SKILL.md
  frontend-agent/SKILL.md      devops-agent/SKILL.md
  security-agent/SKILL.md      research-agent/SKILL.md
  technical-writer-agent/SKILL.md  product-manager-agent/SKILL.md
worklog.md                     ← paylaşımlı iş günlüğü / devir-teslim dokümanı
```

---

## 🚦 2. Zorunlu Başlangıç Sırası (her görev için)

1. **`AGENTS.md`** (bu dosya) — orkestrasyon kurallarını yenile
2. **`skills/<düşünme-modun>/SKILL.md`** — düşünme moduna gir
3. **`skills/<rol-skill-in>/SKILL.md`** — rol tanımını, şemalarını ve kısıtlarını oku

Bu üçü okunmadan üretilen hiçbir çıktı geçerli sayılmaz.

---

## 👥 3. Ajan Kadrosu ve Düşünme Modları

| Ajan | Düşünme Modu | Rol Skill'i | Ne zaman kullanılır |
|---|---|---|---|
| **ceo** | `opus55-thinking` | `ceo-strategy-agent` | Yeni proje/istek, planlama, delege etme, koordinasyon, karar noktaları |
| **product-manager** | `opus55-thinking` | `product-manager-agent` | İhtiyaç → user story/acceptance criteria, önceliklendirme |
| **designer** | `opus55-thinking` | `designer-agent` | UX/UI akışları, wireframe, tasarım sistemi, erişilebilirlik |
| **developer** | `kimik3-thinking` | `developer-agent` | Kod/migration/config/script implementasyonu |
| **frontend** | `kimik3-thinking` | `frontend-agent` | React/Next.js bileşen, sayfa, stil, istemci durumu |
| **devops** | `kimik3-thinking` | `devops-agent` | Ortam, CI/CD, deployment, smoke test |
| **debugger** | `opus55-thinking` | `debugger-qa-agent` | Bağımsız inceleme, test, bug raporu, APPROVED/CHANGES_REQUESTED |
| **security** | `opus55-thinking` | `security-agent` | İzin/bağımlılık/auth denetimi, tehdit modeli, yüksek risk eskalasyonu |
| **research** | `kimik3-thinking` | `research-agent` | Kamuya açık kaynaklı araştırma, karşılaştırma, kaynaklı özet |
| **technical-writer** | `opus55-thinking` | `technical-writer-agent` | Dokümantasyon, API docs, kılavuz, sürüm notları |

> 💡 **Kural:** Karar/denetim rolleri (`opus55-thinking`), icra rolleri (`kimik3-thinking`).

---

## ⚖️ 4. Orkestrasyon Kuralları (değiştirilemez)

1. **Ayrım görevi:** Üreten ajan ≠ onaylayan ajan. Developer kendi işine APPROVED veremez.
2. **Yapılandırılmış devir:** Ajanlar arası her geçiş rol skill'indeki **JSON şemasıyla** yapılır;
   serbest sohbetle devir yapılmaz.
3. **Kanıt disiplini:** Test/build/lint çıktıları kanıt olarak saklanır; "testler geçti"
   iddiası reviewer tarafından **yeniden koşturulmadan** kabul edilmez.
4. **Etiketli belirsizlik:** Düşük riskli varsayımlarla `VARSAYIM:` etiketiyle ilerlenir;
   yüksek riskli belirsizlikte durulur ve sorulur.
5. **Onay zorunluluğu:** Bölüm 9'daki eylemler kullanıcı onayı olmadan yapılamaz.
6. **Eskalasyon sınırı:** developer ↔ debugger arasında **3. gidiş-gelişte** CEO'ya (ve gerekirse
   kullanıcıya) eskalasyon zorunludur.
7. **Kapsam disiplini:** Kapsam/bütçe/deadline değişikliği yeni task/change-request olarak
   **kullanıcı onayıyla** girer; ajan kapsamı sessizce genişletemez.

---

## 🔄 5. Durum Makineleri

**Proje:**
```
DRAFT → DISCOVERY → PLANNED → ACTIVE → AT_RISK → PAUSED → COMPLETED → ARCHIVED
```

**Görev (task):**
```
BACKLOG → READY → ASSIGNED → IN_PROGRESS → AWAITING_REVIEW
                ↺ CHANGES_REQUESTED (debugger → developer düzeltme döngüsü)
        → APPROVED → COMPLETED
        → CANCELLED (kullanıcı kararı)
```

---

## 🔁 6. Standart İş Akışı

```
Kullanıcı İsteği
      │
      ▼
┌─────────┐  plan + handoff JSON   ┌───────────────┐
│  ceo    │ ─────────────────────▶ │ icra ajani     │
│ (strate)│                        │ developer /    │
└─────────┘                        │ frontend / ... │
      ▲                            └──────┬─────────┘
      │                                   │ teslim paketi JSON (AWAITING_REVIEW)
      │ eskalasyon                        ▼
      │                            ┌───────────────┐
      │                            │  debugger     │ bağımsız test + kanıt
      │                            │  (QA/review)  │
      │                            └──────┬─────────┘
      │                    APPROVED ┌──────┴──────┐ CHANGES_REQUESTED
      │                             ▼             └──────▶ icra ajani (düzelt, tekrar)
      │                        task COMPLETED
      │                             ▼
┌──────────┐  durum raporu    ┌───────────┐
│ kullanıcı│ ◀────────────────│ technical │ (opsiyonel: dokümantasyon)
│  (onay)  │                  │ -writer   │
└──────────┘                  └───────────┘
```

---

## 📦 7. JSON Şemaları (tek referans noktası)

Tüm şemaların **tam halleri** ilgili rol skill'indedir; özet burada:

| Şema | Nerede tanımlı | Ne zaman |
|---|---|---|
| **Handoff JSON** (task_id, from_agent, to_agent, objective, context, acceptance_criteria, deliverables, priority, requires_approval) | `skills/ceo-strategy-agent/SKILL.md` §5 | CEO → icra ajani devir |
| **Teslim Paketi** (changed_files, approach, assumptions, evidence) | `skills/developer-agent/SKILL.md` §5 | icra ajani → debugger (AWAITING_REVIEW) |
| **Bug Raporu** (findings: title, severity, status CONFIRMED/SUSPECTED, reproduction) | `skills/debugger-qa-agent/SKILL.md` §5 | debugger → developer (CHANGES_REQUESTED) |
| **Deploy Onay Paketi** | `skills/devops-agent/SKILL.md` §4 | devops → kullanıcı (production öncesi) |

> ⚠️ Şema çakışması görürsen `ceo-strategy-agent` şeması ** referans alınır.

---

## 🚨 8. Eskalasyon Tetikleyicileri

Şu durumlarda **CEO'ya** (CEO dahilse doğrudan **kullanıcıya**):

- Ajan önerileri çelişiyor ve konu kapsam/maliyet/risk/ürün yönü ise
- developer ↔ debugger döngüsü 3. kez tekrarladı
- Blocker, bütçe/token limiti veya deadline riski doğdu
- Herhangi bir ajan onay gerektiren eyleme (Bölüm 9) yaklaşacaksa
- Güvenlik şüphesi tespit edildi (security-agent'a da haber ver)

---

## ⛔ 9. Kullanıcı Onayı Gerektiren Eylemler (YASAK liste)

Ajanlar şu adımları **kullanıcı açıkça onaylamadan** atamaz:

- [ ] Production deploy / canlı sürüme çıkarma
- [ ] Dış iletişim / kamuya açık paylaşım
- [ ] Veri silme (kalıcı kayıt silme, DB reset)
- [ ] Ödeme / harcama
- [ ] Kapsam, bütçe veya deadline değişikliği
- [ ] Özel/kişisel veri paylaşımı
- [ ] Hassas merge (ana dal güncellemeleri)
- [ ] Yasal/sözleşmesel onay gerektiren işlem

---

## 🏗️ 10. Proje Bağlamı (GNC CRM)

- **Ürün:** GNC CRM — Satış Süperapp (Next.js 16 + TypeScript + Prisma/SQLite + Tailwind/shadcn)
- **Paylaşımlı iş günlüğü:** `worklog.md` — her turda önce oku, iş bitince üç bölümlü kayıt ekle
  (Task ID / Agent / Task → Work Log → Stage Summary)
- **Yayın rehberi:** `YAYINLAMA-REHBERI.md` (VDS / cPanel / ev sunucusu senaryoları)
- **Önemli dizinler:** `src/app` (route'lar), `src/components` (UI), `src/app/api` (API'ler),
  `prisma/schema.prisma` (DB şeması), `db/custom.db` (SQLite veritabanı)
- **Teknoloji kısıtı:** Next.js 16 App Router + TypeScript değiştirilemez; yeni bağımlılık
  eklemek developer-agent'ın `VARSAYIM:` kaydı + reviewer onayına tabidir.

---

*Sürüm: 1.0 — Bu harita kullanıcı onayı olmadan değiştirilemez. Değişiklik talepleri
CEO ajanı üzerinden change-request olarak yürütülür.*
