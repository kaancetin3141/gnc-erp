import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const sites = await db.site.findMany({ select: { id: true, name: true, tenantId: true, blocks: { select: { name: true, _count: { select: { apartments: true } } } } } })
for (const s of sites) console.log('SITE:', s.name, '| tenant:', s.tenantId.slice(-4), '| blocks:', s.blocks.map(b=>b.name+'('+b._count.apartments+')').join(','))
const cafes = await db.cafe.findMany({ select: { name: true, tenantId: true } })
for (const c of cafes) console.log('CAFE:', c.name, '| tenant:', c.tenantId.slice(-4))
const markets = await db.market.findMany({ select: { name: true, tenantId: true } })
for (const m of markets) console.log('MARKET:', m.name, '| tenant:', m.tenantId.slice(-4))
await db.$disconnect()
