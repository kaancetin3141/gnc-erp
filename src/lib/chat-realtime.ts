// Gerçek zamanlı yayım köprüsü — SERVER-SIDE ONLY
// Next.js API route'ları mesaj yazıldığında / okundu işaretlendiğinde /
// kafe sipariş değiştiğinde mini-services/chat-service (socket.io, PORT 3005)
// üzerindeki /internal/emit ucuna fire-and-forget bildirim gönderir.
// Servis kapalıysa sessizce geçilir — polling (refetchInterval) yedek olarak çalışır.
// NOT: port 3003 Fruit Storm'a (oyun) tahsis edildi; chat-service 3005'te.

export const CHAT_SERVICE_EMIT_URL = 'http://127.0.0.1:3005/internal/emit'
export const CHAT_INTERNAL_SECRET = 'gnc-internal-chat-2026'

export interface ChatRealtimePayload {
  event: 'message' | 'read' | 'cafe'
  receiverId?: string | null
  senderId?: string | null
  readerId?: string | null
  message?: unknown
  // event === 'cafe' için:
  cafeEvent?: 'order-update' | 'table-update' | 'menu-update' | 'kasa-update'
  tenantId?: string
  cafeId?: string
  payload?: unknown
}

export function notifyChatService(payload: ChatRealtimePayload): void {
  try {
    fetch(CHAT_SERVICE_EMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: CHAT_INTERNAL_SECRET, ...payload }),
      signal: AbortSignal.timeout(2500),
      // Next.js fetch patch'i (Data Cache) bu fire-and-forget çağrıyı
      // önbelleğe almasın — yanıt asla cache'lenmez
      cache: 'no-store',
    }).catch((e) => {
      // chat-service kapalı olabilir — sessiz geç, polling yedeği devrede
      console.warn('[chat-realtime] emit başarısız:', e instanceof Error ? e.message : e)
    })
  } catch (e) {
    // fetch'in kendisi bile patlayabilir (test ortamı) — sessiz geç
    console.warn('[chat-realtime] emit çağrılamadı:', e instanceof Error ? e.message : e)
  }
}
