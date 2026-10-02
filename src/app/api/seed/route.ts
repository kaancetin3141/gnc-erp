import { runSeed } from '@/lib/seed'
import { ok } from '@/lib/api-utils'

export async function POST() {
  const result = await runSeed()
  return ok(result)
}
