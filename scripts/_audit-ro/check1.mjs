import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const tenants = await db.tenant.findMany({ select: { id: true, name: true, plan: true } })
for (const t of tenants) console.log('TENANT', t.id, '|', t.name, '|', t.plan)
const deals = await db.deal.findMany({ select: { title: true, stage: true, value: true, wonAt: true, tenantId: true, status: true } })
console.log('DEALS total:', deals.length)
for (const d of deals) console.log(' t:', d.tenantId.slice(-4), '|', d.title, '|', d.stage, '|', d.status, '|', d.value, '| won:', d.wonAt)
await db.$disconnect()
