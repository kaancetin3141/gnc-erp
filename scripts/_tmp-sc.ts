import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const member = await db.member.findUnique({ where: { phone: '905335550999' } })
  const provider = await db.serviceProvider.findFirst()
  if (!member || !provider) throw new Error('member/provider yok')
  const card = await db.stampCard.upsert({
    where: { providerId_memberId: { providerId: provider.id, memberId: member.id } },
    create: { providerId: provider.id, memberId: member.id, stamps: 8, lastStampAt: new Date() },
    update: { stamps: 8 },
  })
  console.log('CARD_ID=' + card.id)
}
main().finally(() => db.$disconnect())
