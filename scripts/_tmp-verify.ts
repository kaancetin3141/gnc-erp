import { db } from '../src/lib/db'
async function main() {
  const appts = await db.appointment.findMany({
    where: { customerName: { contains: 'Ahmet' } },
    include: { customer: { select: { id: true, name: true, phoneDigits: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  for (const a of appts) {
    console.log(a.date.toISOString().slice(0, 16), '|', a.status, '| cust:', a.customer ? `${a.customer.name} (${a.customer.phoneDigits})` : 'YOK')
  }
  await db.$disconnect()
}
main()
