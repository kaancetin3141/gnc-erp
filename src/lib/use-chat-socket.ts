'use client'

// Gerçek zamanlı chat socket hook'u — tek paylaşılan (singleton) bağlantı.
//
// URL kuralı: ASLA port yazma, SADECE XTransformPort query (Caddy gateway).
// Socket.io option'larında path VERİLMEZ (client default path '/' kalır).
//
// Eventler (mini-services/chat-service):
//  - chat:message  → yeni mesaj (REST'ten yazılır, servis yayınlar)
//  - chat:typing   → yazıyor göstergesi (client emit eder)
//  - chat:read     → görüldü bilgisi
//  - presence:sync / presence:list → tenant bazlı online kullanıcı id'leri

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/app-store'

export type ChatSocketStatus = 'connecting' | 'online' | 'offline'

// REST /api/messages ile aynı şekil (JSON serileştirilmiş)
export interface ChatMessagePayload {
  id: string
  tenantId: string
  senderId: string
  receiverId: string | null
  content: string
  isRead: boolean
  createdAt: string
  sender?: unknown
  receiver?: unknown
}

interface MessagesCacheShape {
  items: ChatMessagePayload[]
  total: number
}

// ─── Modül seviyesi singleton socket ─────────────────────────
let sharedSocket: Socket | null = null
let sharedSocketToken: string | null = null

function getSharedSocket(token: string): Socket {
  if (sharedSocket && sharedSocketToken === token) return sharedSocket
  if (sharedSocket) sharedSocket.disconnect()
  sharedSocketToken = token
  sharedSocket = io('/?XTransformPort=3003', {
    transports: ['websocket', 'polling'],
    // KRİTİK: chat-service socket.io path '/' ile kurulur (Caddy kuralı).
    // path verilmezse istemci varsayılan '/socket.io/' ile yanlış yola
    // bağlanır ve UI sonsuza dek "Bağlanıyor…" kalır.
    path: '/',
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: { token },
  })
  return sharedSocket
}

export function disconnectChatSocket(): void {
  if (sharedSocket) {
    sharedSocket.disconnect()
    sharedSocket = null
    sharedSocketToken = null
  }
}

// ─── Hook ────────────────────────────────────────────────────
export function useChatSocket() {
  const qc = useQueryClient()
  const sessionId = useAppStore((s) => s.sessionId)
  const userId = useAppStore((s) => s.user?.id) ?? null

  const [status, setStatus] = useState<ChatSocketStatus>('connecting')
  const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(new Set())
  const [typingUserIds, setTypingUserIds] = useState<ReadonlySet<string>>(new Set())

  const typingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const lastTypingSentAtRef = useRef(0)

  useEffect(() => {
    if (!sessionId || !userId) {
      setStatus('offline')
      return
    }

    const socket = getSharedSocket(sessionId)
    // Oturum değişmiş olabilir — auth'u her seferinde güncelle
    socket.auth = { token: sessionId }
    if (!socket.connected) socket.connect()

    const applyPresence = (data: { online?: string[] } | undefined) => {
      if (Array.isArray(data?.online)) setOnlineUserIds(new Set(data.online))
    }

    const onConnect = () => setStatus('online')
    const onDisconnect = () => setStatus('connecting') // otomatik yeniden bağlanıyor
    const onConnectError = () => setStatus('connecting')

    // Yeni mesaj → TanStack Query cache'ine anında ekle (yoksa)
    const onMessage = (msg: ChatMessagePayload) => {
      if (!msg?.id) return
      const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId
      if (!otherId) return

      const conv = qc.getQueryData<MessagesCacheShape>(['conversation', otherId])
      if (conv && !conv.items.some((m) => m.id === msg.id)) {
        qc.setQueryData<MessagesCacheShape>(['conversation', otherId], {
          ...conv,
          items: [...conv.items, msg],
          total: conv.total + 1,
        })
      }

      const all = qc.getQueryData<MessagesCacheShape>(['all-messages'])
      if (all && !all.items.some((m) => m.id === msg.id)) {
        qc.setQueryData<MessagesCacheShape>(['all-messages'], {
          ...all,
          items: [...all.items, msg],
          total: all.total + 1,
        })
      }

      // okunmamış rozetleri (sidebar/topbar) tazelensin
      qc.invalidateQueries({ queryKey: ['unread-messages'] })
    }

    // Görüldü → karşı taraf benim gönderdiklerimi okudu
    const onRead = (data: { readerId?: string; senderId?: string } | undefined) => {
      const readerId = data?.readerId
      if (!readerId || readerId === userId) return

      const markRead = (old?: MessagesCacheShape) =>
        old
          ? {
              ...old,
              items: old.items.map((m) =>
                m.senderId === userId && m.receiverId === readerId && !m.isRead
                  ? { ...m, isRead: true }
                  : m,
              ),
            }
          : old

      qc.setQueryData<MessagesCacheShape>(['conversation', readerId], markRead)
      qc.setQueryData<MessagesCacheShape>(['all-messages'], markRead)
    }

    // Yazıyor → 3sn timeout'lu gösterge
    const onTyping = (data: { fromUserId?: string; fromName?: string } | undefined) => {
      const from = data?.fromUserId
      if (!from || from === userId) return
      setTypingUserIds((prev) => {
        if (prev.has(from)) return prev
        const next = new Set(prev)
        next.add(from)
        return next
      })
      const timers = typingTimersRef.current
      const prevTimer = timers.get(from)
      if (prevTimer) clearTimeout(prevTimer)
      timers.set(
        from,
        setTimeout(() => {
          setTypingUserIds((prev) => {
            const next = new Set(prev)
            next.delete(from)
            return next
          })
          timers.delete(from)
        }, 3000),
      )
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('chat:message', onMessage)
    socket.on('chat:read', onRead)
    socket.on('chat:typing', onTyping)
    socket.on('presence:sync', applyPresence)
    socket.on('presence:list', applyPresence)

    if (socket.connected) setStatus('online')

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('chat:message', onMessage)
      socket.off('chat:read', onRead)
      socket.off('chat:typing', onTyping)
      socket.off('presence:sync', applyPresence)
      socket.off('presence:list', applyPresence)
    }
  }, [sessionId, userId, qc])

  // Yazıyor sinyali gönder (throttle: en sık 1.2 sn'de bir)
  const sendTyping = useCallback((toUserId: string) => {
    const socket = sharedSocket
    if (!socket?.connected || !toUserId) return
    const now = Date.now()
    if (now - lastTypingSentAtRef.current < 1200) return
    lastTypingSentAtRef.current = now
    socket.emit('chat:typing', { toUserId })
  }, [])

  // Görüldü sinyali gönder (karşı taraf kendi gönderdiklerini okuduğumu görsün)
  const sendReadReceipt = useCallback((senderId: string) => {
    const socket = sharedSocket
    if (!socket?.connected || !senderId) return
    socket.emit('chat:read', { senderId })
  }, [])

  return { status, onlineUserIds, typingUserIds, sendTyping, sendReadReceipt }
}
