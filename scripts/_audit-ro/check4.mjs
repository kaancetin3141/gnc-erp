import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const now = new Date()
const appts = await db.appointment.findMany({ select: { status: true, date: true, customerName: true }, orderBy: { date: 'asc' } })
for (const a of appts) console.log(a.date.toISOString().slice(0,16), '|', a.status, '|', a.customerName)
console.log('NOW:', now.toISOString())
await db.$disconnect()
