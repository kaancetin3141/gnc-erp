// ============================================================
// Canlı döviz kuru servisi — open.er-api.com (anahtarsız, ücretsiz)
// TRY bazına dönüşüm için USD/EUR/GBP kurları; 1 saat bellek-içi
// cache. Erişilemezse güvenli fallback kurlar kullanılır.
// dashboard + trend + /api/fx (client) bu servisi kullanır.
// ============================================================

const FALLBACK: Record<string, number> = { TRY: 1, USD: 42, EUR: 45, GBP: 52 }
const TTL = 60 * 60 * 1000

interface FxState {
  rates: Record<string, number>
  source: 'live' | 'fallback'
  at: number
}

let cache: FxState | null = null

export async function getFxToTry(): Promise<FxState> {
  if (cache && Date.now() - cache.at < TTL) return cache

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/TRY', { cache: 'no-store' })
    if (res.ok) {
      const json = (await res.json()) as {
        result?: string
        rates?: Record<string, number>
      }
      const r = json.rates
      if (json.result === 'success' && r?.USD && r?.EUR && r?.GBP) {
        const round = (n: number) => Math.round(n * 10000) / 10000
        const rates: Record<string, number> = {
          TRY: 1,
          USD: round(1 / r.USD),
          EUR: round(1 / r.EUR),
          GBP: round(1 / r.GBP),
        }
        cache = { rates, source: 'live', at: Date.now() }
        return cache
      }
    }
  } catch {
    // ağ hatası — fallback'e düş
  }

  cache = { rates: { ...FALLBACK }, source: 'fallback', at: Date.now() }
  return cache
}
