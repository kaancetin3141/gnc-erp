import { db } from '../src/lib/db'
async function main() {
  const a = await db.appointment.findFirst({ where: { customerName: 'e', status: 'gelmedi' }, orderBy: { createdAt: 'desc' } })
  if (a) { await db.appointment.update({ where: { id: a.id }, data: { status: 'onaylandi' } }); console.log('geri alındı:', a.id) }
  await db.$disconnect()
}
main()
