# Superpowers — Playbook Kütüphanesi

Kaynak: https://github.com/obra/superpowers (Jesse Vincent / obra, MIT)
Kurulum şekli: **Playbook kütüphanesi** (plugin değil — Z.ai Code ortamında
`/plugin` mekanizması olmadığı için skill'ler ham markdown olarak burada tutulur
ve agent'lar ihtiyaç anında okuyup uygular).

## Kullanım

- Ana agent (Z.ai Code) ve dispatch edilen subagent'lar, göreve başlarken
  aşağıdaki tablodan ilgili skill'i seçip `SKILL.md` dosyasını okur.
- Subagent prompt'larında şablon cümle:
  `Önce .agent-skills/superpowers/<skill-adi>/SKILL.md dosyasını oku ve yöntemini uygula.`

## Skill Haritası

| Skill | Ne zaman kullanılır |
|---|---|
| `using-superpowers` | Her oturum başı — skill disiplinini kurar |
| `brainstorming` | Yeni özellik/ proje öncesi — spec çıkarma, tasarım onayı |
| `writing-plans` | Spec onaylandıktan sonra — uygulama planı yazma |
| `executing-plans` | Plan hazırken — görev görev uygulama disiplini |
| `subagent-driven-development` | Planı subagent'lara bölerek yürütürken |
| `dispatching-parallel-agents` | Bağımsız görevleri paralel koştururken |
| `test-driven-development` | RED/GREEN TDD (not: bu projede test kodu yazma yasağı var — yalnızca QA script'lerinde ilkesi uygulanır) |
| `systematic-debugging` | Her bug/ beklenmeyen davranışta — KÖK NEDEN önce, semptom fix'i yasak |
| `verification-before-completion` | "Bitti" demeden önce kanıt zorunluluğu (agent-browser E2E) |
| `requesting-code-review` | Kendi işine review talep ederken |
| `receiving-code-review` | Review geri bildirimini işlerken |
| `finishing-a-development-branch` | Dal bitirme/ merge öncesi kontrol listesi |
| `using-git-worktrees` | Paralel dallarda izole çalışma (sandbox'ta genelde gereksiz) |
| `writing-skills` | Yeni skill yazarken (skill-creator ile birlikte) |
| `diagnosing-superpowers` | Skill sisteminin kendisi bozulduğunda |

## Bu Projedeki Öncelikli Kullanım Alanları

1. **systematic-debugging** → Yeni işletmede randevu alınmaması bug'ı (tüm
   saatler dolu görünmesi) gibi kök neden analizi gerektiren işler.
2. **brainstorming** → customer-page kayıt olma özelliği, SSL otomasyonu gibi
   yeni talepleri spec'e dökme.
3. **verification-before-completion** → Zaten sistem kuralı; bu skill ile
   check-list'i güçlendirilir.
