'use client'

// Kafe gerçek zamanlı hook — chat-service (socket.io, port 3005) üzerinden
// aynı tenant'taki tüm kafe ekranlarını canlı senkronize eder:
//   komi sipariş açar  → barmen/mutfak FIFO kuyruğu anında güncellenir
//   barmen 'hazir'     → komi/kasa ekranları anında güncellenir
//   kasa ödeme alır    → masalar + adisyon listesi anında güncellenir
// Chat mesajlaşma hook'u (use-chat-socket) ile AYNI singleton socket'i paylaşır.
// Eventler mini-services/chat-service /internal/emit köprüsünden yayınlanır;
// servis kapalıysa polling (refetchInterval) yedeği devrede kalır.

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { getSharedSocket } from './use-chat-socket'
import type { Socket } from 'socket.io-client'

export type CafeSocketStatus = 'offline' | 'live'

export interface CafeEventEnvelope {
  cafeId?: string
  payload?: {
    orderId?: string
    action?: string
    number?: string
    after?: string
    actorName?: string
    amount?: number
    itemName?: string
    added?: { name: string; qty: number }[]
  }
}

// Sipariş akışını etkileyen tüm cache'ler — tek event'te hepsi tazelenir
const INVALIDATION_PREFIXES = [
  'cafe-orders',
  'cafe-bar-queue',
  'cafe-kitchen-queue',
  'cafe-tables',
  'cafe-kasa-open',
  'cafe-kasa-today',
  'cafe-reports',
  'cafes',
]

const CAFE_EVENT_NAMES = [
  'cafe:order-update',
  'cafe:table-update',
  'cafe:menu-update',
  'cafe:kasa-update',
] as const

export function useCafeSocket(activeCafeId?: string | null) {
  const qc = useQueryClient()
  const sessionId = useAppStore((s) => s.sessionId)
  const userId = useAppStore((s) => s.user?.id) ?? null

  const [status, setStatus] = useState<CafeSocketStatus>('offline')

  useEffect(() => {
    if (!sessionId || !userId) {
      setStatus('offline')
      return
    }

    const socket: Socket = getSharedSocket(sessionId)
    socket.auth = { token: sessionId }
    if (!socket.connected) socket.connect()

    const onConnect = () => setStatus('live')
    const onDisconnect = () => setStatus('offline')

    const invalidateCafe = () => {
      for (const prefix of INVALIDATION_PREFIXES) {
        qc.invalidateQueries({ queryKey: [prefix] })
      }
    }

    // Yeni sipariş / kalem ekleme → bar & mutfak personeline toast
    const onOrderUpdate = (envelope: CafeEventEnvelope) => {
      invalidateCafe()
      const p = envelope.payload
      if (!p) return
      // Yeni adisyon: barmen/mutfak açısından iş sinyali
      if (p.action === 'create') {
        toast.info(`Yeni sipariş ${p.number ?? ''}`, {
          description: `${p.actorName ?? 'Personel'} adisyon açtı — bar/mutfak kuyruğuna düştü`,
        })
      } else if (p.action === 'items-added' && p.added?.length) {
        const summary = p.added.map((a) => `${a.qty}× ${a.name}`).join(', ')
        toast.info(`Kalem eklendi ${p.number ?? ''}`, { description: summary })
      } else if (p.action === 'item-status' && p.after === 'hazir') {
        // Barmen/mutfak bitirdi → komiye servis sinyali
        toast.success(`Hazır: ${p.itemName ?? ''} ${p.number ? `(${p.number})` : ''}`)
      } else if (p.action === 'payment' && p.amount) {
        toast.success(`Ödeme alındı ${p.number ? `(${p.number})` : ''}`, {
          description: `₺${p.amount.toFixed(2)}`,
        })
      }
    }

    const onTableUpdate = () => invalidateCafe()
    const onMenuUpdate = () => {
      qc.invalidateQueries({ queryKey: ['cafe-menu'] })
    }
    const onKasaUpdate = () => {
      qc.invalidateQueries({ queryKey: ['cafe-kasa-open'] })
      qc.invalidateQueries({ queryKey: ['cafe-kasa-today'] })
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('cafe:order-update', onOrderUpdate)
    socket.on('cafe:table-update', onTableUpdate)
    socket.on('cafe:menu-update', onMenuUpdate)
    socket.on('cafe:kasa-update', onKasaUpdate)

    if (socket.connected) setStatus('live')

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      for (const ev of CAFE_EVENT_NAMES) socket.off(ev)
    }
  }, [sessionId, userId, qc])

  return { status }
}
