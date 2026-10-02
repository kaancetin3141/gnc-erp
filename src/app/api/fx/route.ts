// ============================================================
// GET /api/fx — canlı TRY bazlı kurlar (client bileşenleri için)
// Oturum gerekmez (halka açık piyasa verisi); sunucuda 1 saat cache.
// ============================================================

import { ok } from '@/lib/api-utils'
import { getFxToTry } from '@/lib/fx-server'

export async function GET() {
  const { rates, source } = await getFxToTry()
  return ok({ rates, source })
}
