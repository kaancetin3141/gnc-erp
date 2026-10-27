// ============================================================
// SEED — İşletme Vitrin (tur4): portföy fotoğrafları + tanıtım
// Kullanım: bun scripts/seed-storefront.ts
//
// Idempotent: yalnız BOŞ alanları doldurur —
//   · provider.photo yoksa kapak yazar (salon-interior, 1600px WebP)
//   · provider.about boşsa tanıtım metni yazar
//   · ProviderPhoto sayısı 0 ise 7 fotoğraf ekler (1280px WebP)
//   · Staff photo null ise usta fotoğrafı yazar (640px WebP)
// Kaynak görseller: db/seed-assets/*.jpg (AI üretimi demo)
// ============================================================
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const db = new PrismaClient()

const ASSETS = path.join(process.cwd(), 'db', 'seed-assets')

const ABOUT_TEXT = `2012'den beri Kadıköy'ün kalbinde, saçınıza ve sakalınıza aynı özeni gösteren bir ekiple hizmet veriyoruz. Klasik berber kültürünü modern kuaförlük anlayışıyla birleştiriyoruz: ustura tıraşından balyaj'a, çocuk kesiminden saç bakımına kadar her işlem tam zamanında, randevunuza saygıyla.

Salonumuzda 3 koltuk ve 1 yıkama ünitesi bulunur; tüm ürünler profesyonel seridir. Randevunuzu online alabilir, beklemeden hizmete girebilirsiniz. Yeni müşterilerimize ilk saç bakımı hediye!`

interface PortfolioSpec {
  file: string
  title: string
  caption: string
  category: string
}

const PORTFOLIO: PortfolioSpec[] = [
  { file: 'barber-cut.jpg', title: 'Klasik Erkek Kesimi', caption: 'Makas + makine tekniğiyle tam konturlu kesim', category: 'kesim' },
  { file: 'beard-trim.jpg', title: 'Sakal Tasarımı', caption: 'Ustura detayıyla hat kesimi ve bakım', category: 'sakal' },
  { file: 'hair-color.jpg', title: 'Balyaj & Renklendirme', caption: 'Doğal geçişli balyaj uygulaması', category: 'sac-boyama' },
  { file: 'styling.jpg', title: 'Fön & Şekillendirme', caption: 'Özel günler için hacimli styling', category: 'stil' },
  { file: 'kids-cut.jpg', title: 'Çocuk Kesimi', caption: 'Sabırlı ve eğlenceli çocuk koltuğu deneyimi', category: 'kesim' },
  { file: 'barber-tools.jpg', title: 'Ustura Ritüeli', caption: 'Sıcak havlu + ustara tıraş klasiklerimizden', category: 'sakal' },
  { file: 'salon-interior.jpg', title: 'Salonumuz', caption: "Kadıköy'deki sıcak atmosferli salonumuz", category: 'salon' },
]

async function toWebpDataUrl(file: string, maxDim: number, quality = 80): Promise<{ url: string; width: number; height: number }> {
  const src = path.join(ASSETS, file)
  if (!fs.existsSync(src)) throw new Error(`Kaynak dosya yok: ${file}`)
  const buf = await sharp(src)
    .rotate() // EXIF yönü
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true })
  const b64 = buf.data.toString('base64')
  return { url: `data:image/webp;base64,${b64}`, width: buf.info.width, height: buf.info.height }
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(0)} KB`
}

async function main() {
  const provider = await db.serviceProvider.findFirst({ where: { slug: 'sik-kuafor' } })
  if (!provider) {
    console.log('SKIP: sik-kuafor bulunamadı — önce temel seedi koşun')
    return
  }

  // 1) Kapak foto
  if (!provider.photo) {
    const cover = await toWebpDataUrl('salon-interior.jpg', 1600, 80)
    await db.serviceProvider.update({ where: { id: provider.id }, data: { photo: cover.url } })
    console.log(`✓ Kapak yazıldı (1600px, ${kb(cover.url.length)})`)
  } else {
    console.log('· Kapak zaten var — dokunulmadı')
  }

  // 2) Tanıtım metni
  if (!provider.about || !provider.about.trim()) {
    await db.serviceProvider.update({ where: { id: provider.id }, data: { about: ABOUT_TEXT } })
    console.log('✓ Hakkında metni yazıldı')
  } else {
    console.log('· Hakkında zaten var — dokunulmadı')
  }

  // 3) Portföy fotoğrafları
  const existingCount = await db.providerPhoto.count({ where: { providerId: provider.id } })
  if (existingCount === 0) {
    let i = 0
    for (const spec of PORTFOLIO) {
      try {
        const img = await toWebpDataUrl(spec.file, 1280, 78)
        await db.providerPhoto.create({
          data: {
            providerId: provider.id,
            url: img.url,
            title: spec.title,
            caption: spec.caption,
            category: spec.category,
            width: img.width,
            height: img.height,
            sortOrder: i,
          },
        })
        console.log(`✓ Portföy [${i}] ${spec.title} (${img.width}×${img.height}, ${kb(img.url.length)})`)
        i++
      } catch (e) {
        console.log(`· ATLANDI ${spec.file}: ${(e as Error).message}`)
      }
    }
    console.log(`✓ Toplam ${i} portföy fotoğrafı eklendi`)
  } else {
    console.log(`· Portföyde zaten ${existingCount} foto var — dokunulmadı`)
  }

  // 4) İlk personelin fotoğrafı (yoksa)
  const firstStaff = await db.staff.findFirst({
    where: { providerId: provider.id },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  if (firstStaff && !firstStaff.photo) {
    try {
      const avatar = await toWebpDataUrl('barber-portrait.jpg', 640, 80)
      await db.staff.update({ where: { id: firstStaff.id }, data: { photo: avatar.url } })
      console.log(`✓ Ekip foto: ${firstStaff.name} (640px, ${kb(avatar.url.length)})`)
    } catch (e) {
      console.log(`· Ekip foto atlandı: ${(e as Error).message}`)
    }
  } else if (firstStaff) {
    console.log(`· ${firstStaff.name} foto zaten var — dokunulmadı`)
  }

  const total = await db.providerPhoto.count({ where: { providerId: provider.id } })
  console.log(`\nSEED TAMAM — vitrin: ${total} portföy foto + kapak + hakkında`)
}

main()
  .catch((e) => { console.error('HATA:', e); process.exit(1) })
  .finally(() => db.$disconnect())
