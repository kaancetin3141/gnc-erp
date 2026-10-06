import { runRealisticSeed } from '@/lib/seed-realistic'
import { ok, err } from '@/lib/api-utils'

export async function POST() {
  try {
    const result = await runRealisticSeed()
    return ok(result)
  } catch (e) {
    console.error('seed-realistic error:', e)
    return err(e instanceof Error ? e.message : 'Gerçekçi veri yüklemesi başarısız', 500)
  }
}

export async function GET() {
  return ok({
    info: 'POST ile gerçekçi demo verisi yükleyin (idempotent — ikinci çağrı atlanır).',
  })
}
