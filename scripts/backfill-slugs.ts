import { db } from '../src/lib/db'
import { slugify, ensureUniqueSlug } from '../src/lib/slug'

async function main() {
  const providers = await db.serviceProvider.findMany()
  console.log(`Found ${providers.length} providers`)
  for (const p of providers) {
    if (p.slug) {
      console.log(`  ✓ ${p.name} already has slug: ${p.slug}`)
      continue
    }
    const slug = await ensureUniqueSlug(p.name, async (candidate) => {
      const exists = await db.serviceProvider.findFirst({
        where: { slug: candidate, NOT: { id: p.id } },
        select: { id: true },
      })
      return !!exists
    })
    console.log(`  → ${p.name} → ${slug}`)
    await db.serviceProvider.update({ where: { id: p.id }, data: { slug } })
  }
  const after = await db.serviceProvider.findMany({ select: { id: true, name: true, slug: true } })
  console.log('Result:', JSON.stringify(after, null, 2))
  // Also check that the hardcoded sik-kuafor slug works if there's a provider with that exact name
  const sik = after.find((p) => p.name === 'Şık Kuaför & Berber Salonu')
  if (sik && sik.slug !== 'sik-kuafor') {
    console.log(`Fixing Şık Kuaför slug: ${sik.slug} → sik-kuafor`)
    await db.serviceProvider.update({ where: { id: sik.id }, data: { slug: 'sik-kuafor' } })
  }
  console.log('Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
