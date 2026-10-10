# KaloriAI Deploy Dosyaları — bu klasörün amacı

Bu dosyalar **kullanıcının KaloriAI deposundan** (github.com/kaancetin3141/KaloriAI,
`scripts/deploy/` + `DEPLOYMENT.md`) GNC CRM sunucu kurulumuna entegrasyon için alındı.
Kullanıcı için önemli dosyalardır ve burada güvenle saklanır (git'e commit'lidir).

## Dosyalar

| Dosya | Kaynak | Açıklama |
|---|---|---|
| `DEPLOYMENT.md` | repo kökü | Tam Ubuntu VDS dağıtım rehberi (Node 22, bun, nginx, certbot, swap) |
| `deploy.sh` | scripts/deploy/ | 6 adımlı kurulum/güncelleme: git pull → install → prisma → build → restart |
| `backup.sh` | scripts/deploy/ | Günlük SQLite WAL-safe yedek + upload/ + .env (14 gün saklama) |
| `nginx-kaloriai.conf` | scripts/deploy/ | nginx şablonu (rate limit, gzip, statik cache) — nginx kullananlar için |
| `kaloriai.service` | scripts/deploy/ | **ORİJİNAL** systemd unit (port 3000, /home/kaloriai/KaloriAI) — değişmedi |
| `kaloriai-3004.service` | uyarlanmış | GNC sistemine uyarlı: **port 3004**, `/var/www/my-project/mini-services/kaloriai` — `server-setup.sh` bunu kurar |

## GNC sistemine entegrasyon

- Port düzeni: KaloriAI = **3004** (ana site 3000, müşteri 3002, oyun 3003)
- Domain: `kalori.gncinc.online` → Caddy `reverse_proxy localhost:3004`
  (nginx conf'u tercih edersen Caddy satırı yerine onu kullan — İKİSİ BİRDEN ÇALIŞMAZ, 80/443 tek proxy'ye ait)
- `server-setup.sh` artık KaloriAI'yı production build + systemd servisi ile kurar
  (klasik `bun run dev` yerine — VDS için daha sağlam, RAM sınırlı + güvenlik sertleştirmeli)
- Yedekleme: `backup.sh` kaloriai kullanıcısı crontab'ına eklenebilir
  (örn. `0 3 * * * /var/www/my-project/deploy/kaloriai/backup.sh`)

## KaloriAI'nin kendi .env'i (KRİTİK)

KaloriAI CRM'in veritabanını ASLA kullanmamalı (geçmişte üzerine yazma kazası oldu):
`mini-services/kaloriai/.env` → `DATABASE_URL=file:/var/www/my-project/mini-services/kaloriai/db/kaloriai.db`
`server-setup.sh` bunu otomatik garanti eder.
