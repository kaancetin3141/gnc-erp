import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const invs = await db.invoice.findMany({ select: { number: true, status: true, total: true, currency: true, dueDate: true, issueDate: true } })
for (const i of invs) console.log(i.number, '|', i.status, '|', i.total, i.currency, '| due:', i.dueDate?.toISOString()?.slice(0,10), '| issue:', i.issueDate?.toISOString()?.slice(0,10))
await db.$disconnect()
