// tur5: ServiceProvider.photo -> yeni Apple-estetiği kapak (cover-salon.jpg → 1600px WebP data URL)
// Eski değeri tool-results/tur5a-old-cover.txt'e kaydeder (worklog kanıtı).
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import fs from 'fs'

const db = new PrismaClient()

async function main() {
  const p = await db.serviceProvider.findFirst({ where: { slug: 'sik-kuafor' } })
  if (!p) throw new Error('sik-kuafor bulunamadı')
  fs.writeFileSync('/home/z/my-project/tool-results/tur5a-old-cover.txt',
    `old photo length: ${p.photo ? p.photo.length : 0}\nold photo prefix: ${p.photo ? p.photo.slice(0, 60) : '(yok)'}\n`)
  const src = '/home/z/my-project/mini-services/customer-page/assets/img/cover-salon.jpg'
  for (const q of [72, 62, 50]) {
    const buf = await sharp(src).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: q }).toBuffer()
    const kb = buf.length / 1024
    console.log(`q=${q} → ${(kb).toFixed(0)} KB`)
    if (kb <= 200 || q === 50) {
      const url = `data:image/webp;base64,${buf.toString('base64')}`
      await db.serviceProvider.update({ where: { id: p.id }, data: { photo: url } })
      console.log(`YAZILDI: q=${q}, ${(kb).toFixed(0)} KB, len=${url.length}`)
      break
    }
  }
  const after = await db.serviceProvider.findFirst({ where: { slug: 'sik-kuafor' }, select: { photo: true } })
  console.log('doğrulama:', after?.photo?.slice(0, 40), '… len=', after?.photo?.length)
}
main().finally(() => db.$disconnect())
