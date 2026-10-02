import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession, requireAuth, ok,
} from '@/lib/api-utils'

// Varsayılan şablonlar — ilk kurulumda yüklenir
const DEFAULT_TEMPLATES = [
  {
    name: 'Hoş geldin mesajı',
    type: 'whatsapp',
    category: 'satis',
    subject: null,
    content:
      'Merhaba {{musteri}}, {{firma}} olarak size özel fırsatlarımızı sunmaktan mutluluk duyarız. Detaylı bilgi için bizimle iletişime geçebilirsiniz.',
  },
  {
    name: 'Teklif takip',
    type: 'whatsapp',
    category: 'takip',
    subject: null,
    content:
      'Sayın {{musteri}}, gönderdiğimiz teklifi incelediniz mi? Sorularınız için buradayım. — {{temsilci}}',
  },
  {
    name: 'Randevu hatırlatma',
    type: 'whatsapp',
    category: 'takip',
    subject: null,
    content:
      'Merhaba {{musteri}}, yarın saatinizdeki görüşmemizi hatırlatmak istedim. — {{temsilci}}',
  },
  {
    name: 'Teklif sunumu',
    type: 'email',
    category: 'teklif',
    subject: 'Teklifiniz Hazır',
    content:
      'Sayın {{musteri}},\n\nTalep ettiğiniz teklif ekte sunulmuştur. Sorularınız için {{temsilci}} ile iletişime geçebilirsiniz.\n\nSaygılarımızla,\n{{firma}}',
  },
  {
    name: 'Teşekkür mesajı',
    type: 'whatsapp',
    category: 'tesekkur',
    subject: null,
    content:
      '{{musteri}} bizi tercih ettiğiniz için teşekkür ederiz! — {{firma}}',
  },
  {
    name: 'İletişim sonrası',
    type: 'whatsapp',
    category: 'takip',
    subject: null,
    content:
      'Merhaba {{musteri}}, görüşmemizden sonra belirttiğiniz konuları değerlendiriyoruz. En kısa sürede dönüş yapacağım. — {{temsilci}}',
  },
  {
    name: 'Fiyat listesi',
    type: 'email',
    category: 'satis',
    subject: 'Güncel Fiyat Listemiz',
    content:
      'Sayın {{musteri}},\n\nGüncel fiyat listemizi ekte bilgilerinize sunuyoruz. Herhangi bir sorunuz için {{temsilci}} ile iletişime geçebilirsiniz.\n\n{{firma}}',
  },
  {
    name: 'Kampanya duyurusu',
    type: 'whatsapp',
    category: 'satis',
    subject: null,
    content:
      '{{musteri}}, özel kampanyamızdan yararlanmak için son gün! Detaylar için hemen bizimle iletişime geçin. — {{firma}}',
  },
  {
    name: 'Ödeme hatırlatma',
    type: 'email',
    category: 'takip',
    subject: 'Ödeme Hatırlatması',
    content:
      'Sayın {{musteri}},\n\n{{tarih}} tarihinde vadesi gelen ödemeniz hakkında hatırlatma yapmak isteriz. Ödeme talimatınız için {{temsilci}} ile görüşebilirsiniz.\n\n{{firma}}',
  },
  {
    name: 'Doğum günü',
    type: 'whatsapp',
    category: 'tesekkur',
    subject: null,
    content:
      '{{musteri}}, doğum gününüz kutlu olsun! Sağlık, mutluluk ve başarı dolu bir yıl dileriz. — {{firma}}',
  },
]

// ============================================================
// POST — varsayılan şablonları yükle (eğer hiç şablon yoksa)
// ============================================================
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  // Mevcut şablon sayısını kontrol et
  const existingCount = await db.messageTemplate.count({
    where: { tenantId: user!.tenantId },
  })

  // Zaten şablonlar varsa, sadece eksik varsayılanları ekle (idempotent)
  // Aynı isimde şablon varsa atla
  const existingNames = await db.messageTemplate.findMany({
    where: { tenantId: user!.tenantId, name: { in: DEFAULT_TEMPLATES.map((t) => t.name) } },
    select: { name: true },
  })
  const existingNameSet = new Set(existingNames.map((t) => t.name))

  const toCreate = DEFAULT_TEMPLATES.filter((t) => !existingNameSet.has(t.name))

  if (toCreate.length === 0) {
    return ok({
      seeded: false,
      message: existingCount > 0 ? 'Tüm varsayılan şablonlar zaten mevcut' : 'Şablon bulunamadı, ancak yüklenecek yeni şablon yok',
      created: 0,
      total: existingCount,
    })
  }

  // İlk şablonu default işaretle (her tip için)
  const createdTemplates = await db.$transaction(
    toCreate.map((t) =>
      db.messageTemplate.create({
        data: {
          tenantId: user!.tenantId,
          name: t.name,
          type: t.type,
          category: t.category,
          subject: t.subject,
          content: t.content,
          isDefault: false,
        },
      }),
    ),
  )

  // Her tip için ilk şablonu default yap
  const typesSeen = new Set<string>()
  for (const t of toCreate) {
    if (!typesSeen.has(t.type)) {
      typesSeen.add(t.type)
      const created = createdTemplates.find((c) => c.name === t.name)
      if (created) {
        await db.messageTemplate.update({
          where: { id: created.id },
          data: { isDefault: true },
        })
      }
    }
  }

  return ok({
    seeded: true,
    message: `${toCreate.length} varsayılan şablon yüklendi`,
    created: toCreate.length,
    total: existingCount + toCreate.length,
  })
}
