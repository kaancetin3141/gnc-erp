import { db } from '@/lib/db'

// ============================================================
// STOK ÇIKIŞI TELAFİ YARDIMCILARI (ERP-1)
//
// Standart akış: Teklif → Sipariş → İrsaliye (sevk) → Fatura
// İrsaliye 'sevk_edildi' olduğunda stok DÜŞER. Fatura oluşturulunca
// da düşülüyorsa AYNI ÜRÜNLER İKİ KEZ düşer — stok fiilen varken
// eksiye düşer, sonraki faturalar stok korumasına takılır.
//
// Bu yardımcı, fatura oluşturulmadan önce "bu teklifin/siparişin
// stoğu zaten irsaliye ile düşüldü mü?" sorusunu yanıtlar.
// ============================================================

export async function shippedViaIrsaliye(
  quoteId?: string | null,
  orderId?: string | null,
): Promise<boolean> {
  const where: Record<string, unknown> = {
    status: { in: ['sevk_edildi', 'teslim_edildi'] },
  }
  if (orderId) {
    where.orderId = orderId
  } else if (quoteId) {
    where.order = { quoteId }
  } else {
    return false
  }
  const count = await db.irsaliye.count({ where })
  return count > 0
}
