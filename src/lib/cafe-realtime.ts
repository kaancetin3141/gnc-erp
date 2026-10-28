// Kafe gerçek zamanlı yayım köprüsü — SERVER-SIDE ONLY
// Kafe API route'ları sipariş/masa/kasa değişikliğinde chat-service
// (socket.io, port 3005) üzerinden aynı tenant'taki tüm bağlı ekranlara
// (komi → barmen → mutfak → kasa) fire-and-forget bildirim gönderir.
// Servis kapalıysa sessizce geçilir — polling (refetchInterval) yedek olarak çalışır.

import { notifyChatService } from './chat-realtime'

export type CafeRealtimeEvent =
  | 'order-update' // sipariş oluşturuldu / durumu değişti / kalem eklendi-çıkarıldı
  | 'table-update' // masa durumu değişti (bos/dolu/siparis/rezerve)
  | 'menu-update' // menü kategorisi/ürünü değişti
  | 'kasa-update' // vardiya açıldı/kapandı, ödeme alındı

export function notifyCafe(
  tenantId: string,
  cafeId: string,
  cafeEvent: CafeRealtimeEvent,
  payload?: Record<string, unknown>,
): void {
  if (!tenantId || !cafeId) return
  notifyChatService({
    event: 'cafe',
    cafeEvent,
    tenantId,
    cafeId,
    payload: {
      ...payload,
      at: new Date().toISOString(),
    },
  })
}
