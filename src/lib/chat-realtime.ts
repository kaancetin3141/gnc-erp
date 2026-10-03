// Chat gerçek zamanlı yayım köprüsü — SERVER-SIDE ONLY
// Next.js API route'ları mesaj yazıldığında / okundu işaretlendiğinde
// mini-services/chat-service (socket.io, port 3003) üzerindeki
// /internal/emit ucuna fire-and-forget bildirim gönderir.
// Servis kapalıysa sessizce geçilir — polling (refetchInterval) yedek olarak çalışır.

export const CHAT_SERVICE_EMIT_URL = 'http://127.0.0.1:3003/internal/emit'
export const CHAT_INTERNAL_SECRET = 'gnc-internal-chat-2026'

export interface ChatRealtimePayload {
  event: 'message' | 'read'
  receiverId?: string | null
  senderId?: string | null
  readerId?: string | null
  message?: unknown
}

export function notifyChatService(payload: ChatRealtimePayload): void {
  try {
    fetch(CHAT_SERVICE_EMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: CHAT_INTERNAL_SECRET, ...payload }),
      signal: AbortSignal.timeout(2500),
    }).catch(() => {
      // chat-service kapalı olabilir — sessiz geç, polling yedeği devrede
    })
  } catch {
    // fetch'in kendisi bile patlayabilir (test ortamı) — sessiz geç
  }
}
