import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const w = await db.waitlistEntry.findMany({ select: { customerName: true, customerPhone: true, status: true, createdAt: true } })
  console.log(JSON.stringify(w, null, 1))
}
main().finally(() => db.$disconnect())
