import { db } from '@/lib/db'
import { runSeed } from '@/lib/seed'
import { ok, err } from '@/lib/api-utils'

// ============================================================
// POST /api/seed — demo verisini yükle
// GÜVENLİK (sızma testi bulgusu): Bu endpoint önceden TAMAMEN
// açıktı ve runSeed() önce TÜM tabloları deleteMany() ile
// sildiği için kimlik doğrulamasız tek istekle veritabanı
// uçurulabiliyordu (catastrophic data destruction).
//
// Yeni kural:
// 1) DB boşsa (kullanıcı yok) — herkese açık (ilk kurulum akışı,
//    login ekranındaki "demo verisi yükle" butonu buna bağlı)
// 2) DB doluysa — yalnızca SEED_SECRET header'ı ile (x-seed-secret)
//    tetiklenebilir; aksi halde 403 ve HİÇBİR veri silinmez.
// ============================================================
export async function POST(req: Request) {
  const userCount = await db.user.count()
  const isFreshInstall = userCount === 0

  if (!isFreshInstall) {
    const secret = process.env.SEED_SECRET
    const provided = req.headers.get('x-seed-secret')
    if (!secret || provided !== secret) {
      return err(
        'Veritabanı dolu — yeniden seed için x-seed-secret header gerekli',
        403,
      )
    }
  }

  const result = await runSeed()
  return ok(result)
}

// GET — seed durumu (dolu/boş) — veri sızdırmaz, sadece boolean
export async function GET() {
  const userCount = await db.user.count()
  return ok({ seeded: userCount > 0 })
}
