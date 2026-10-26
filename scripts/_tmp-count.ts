import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const [a, m, p, w, t, r] = await Promise.all([
    db.appointment.count(), db.member.count(), db.serviceProvider.count(),
    db.waitlistEntry.count(), db.tenantSetting.count(), db.review.count(),
  ])
  console.log(JSON.stringify({ appointment: a, member: m, provider: p, waitlist: w, tenantSetting: t, review: r }))
}
main().finally(() => db.$disconnect())
