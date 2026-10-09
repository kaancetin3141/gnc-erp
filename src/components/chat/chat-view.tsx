'use client'

// Mesajlar — şirket içi gerçek zamanlı sohbet
// - Gerçek zamanlı: socket.io (mini-services/chat-service, port 3003 → useChatSocket)
//   Mesaj gönderimi REST POST /api/messages (kaynak doğruluk) + servis yayınlar.
// - Scroll: kimlik bazlı akıllı kaydırma — kullanıcı yukarıdayken otomatik
//   kaydırma yapılmaz, "↓ Yeni mesaj" pill butonu gösterilir.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { useChatSocket, type ChatSocketStatus } from '@/lib/use-chat-socket'
import { cn } from '@/lib/utils'
import { initials, formatCurrency, formatDate } from '@/lib/format'
import type { Role } from '@/types'
import {
  Card, CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Send, ArrowLeft, MessageCircle, Search, Trash2, CheckCheck,
  Paperclip, ArrowDown, FileText, Package, FileSpreadsheet,
  ClipboardList, Loader2, ExternalLink, Download, type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────
interface ChatMessage {
  id: string
  tenantId: string
  senderId: string
  receiverId: string | null
  content: string
  isRead: boolean
  createdAt: string
  sender: {
    id: string; name: string; avatarUrl: string | null
    title: string | null; role: Role
  }
  receiver: {
    id: string; name: string; avatarUrl: string | null
    title: string | null; role: Role
  } | null
}

interface MessagesResponse {
  items: ChatMessage[]
  total: number
}

interface UsersResponse {
  items: {
    id: string
    name: string
    email: string
    role: Role
    title: string | null
    avatarUrl: string | null
    phone: string | null
    status?: string
  }[]
  total: number
}

type ChatDocumentType = 'Fatura' | 'Sipariş' | 'Proforma' | 'Teklif'

interface ChatDocument {
  id: string
  number: string
  customerName: string
  total: number
  currency: string
  type: ChatDocumentType
  createdAt: string
}

interface DocumentsResponse {
  items: ChatDocument[]
  total: number
}

const ROLE_AVATAR_GRADIENT: Record<Role, string> = {
  superadmin: 'from-amber-500 to-orange-600',
  admin: 'from-emerald-500 to-teal-600',
  manager: 'from-violet-500 to-purple-600',
  rep: 'from-teal-500 to-cyan-600',
  readonly: 'from-slate-500 to-slate-600',
  stock: 'from-rose-500 to-pink-600',
  kasa: 'from-lime-500 to-green-600',
  barmen: 'from-fuchsia-500 to-pink-600',
  komi: 'from-orange-500 to-amber-600',
  kasiyer: 'from-cyan-500 to-teal-600',
  depo_sorumlusu: 'from-stone-500 to-neutral-600',
}

const DOC_TYPE_ICON: Record<ChatDocumentType, LucideIcon> = {
  Fatura: FileText,
  Sipariş: Package,
  Proforma: FileSpreadsheet,
  Teklif: ClipboardList,
}

// Bağlantı durumu → rozet metni/renkleri
const CONNECTION_META: Record<ChatSocketStatus, { label: string; dot: string; cls: string }> = {
  online: {
    label: 'Anlık',
    dot: 'bg-emerald-500',
    cls: 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300',
  },
  connecting: {
    label: 'Bağlanıyor…',
    dot: 'bg-amber-500',
    cls: 'text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300',
  },
  offline: {
    label: 'Yenileniyor',
    dot: 'bg-slate-400',
    cls: 'text-slate-600 border-border bg-muted/40 dark:text-slate-300',
  },
}

// Belge eki çözümleme — mesajdan canlı sorgulanır, DB'ye dosya yazılmaz
interface DocLookupResult {
  type: string
  id: string
  number: string
  customerName: string
  total: number
  currency: string
  canPreview: boolean
  url: string | null
}
interface DocPreviewState {
  loading: boolean
  title: string
  url: string | null
  canPreview: boolean
}

// ─── Helper: format time HH:mm ───────────────────────────────────
function fmtTime(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const isYesterday = d.toDateString() === yest.toDateString()
  if (isToday) return 'Bugün'
  if (isYesterday) return 'Dün'
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

// ─── Helper: mesaj içeriğinden belge eki çıkar ───────────────────
// Format: "📎 Fatura FAT-2026-001 — Müşteri Adı — 1.234,56 TRY"
function parseAttachment(content: string): { type: ChatDocumentType; number: string; rest: string } | null {
  const match = /^📎\s*(Fatura|Sipariş|Proforma|Teklif)\s+([A-Za-z0-9çğıöşüÇĞİÖŞÜ._-]+)\s*—\s*([\s\S]*)$/.exec(content)
  if (!match) return null
  return { type: match[1] as ChatDocumentType, number: match[2], rest: match[3].trim() }
}

// ─── Main view ───────────────────────────────────────────────────
export function ChatView() {
  const { user } = useAppStore()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [mobileShowConversation, setMobileShowConversation] = useState(false)
  const [search, setSearch] = useState('')

  // Gerçek zamanlı bağlantı (socket.io) — presence + typing + read receipt
  const { status: socketStatus, onlineUserIds, typingUserIds, sendTyping, sendReadReceipt } = useChatSocket()

  // Aynı şirketteki kullanıcıları çek (mesajlaşma için)
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['chat-users'],
    queryFn: () => apiGet<UsersResponse>('/api/messages?type=users'),
    enabled: !!user,
  })

  // Tüm mesajları çek (currentUser ile ilgili) — sol panel preview + unread için
  // (gerçek zamanlı akış socket'tan gelir; polling yedek: 30sn)
  const { data: allMessagesData } = useQuery({
    queryKey: ['all-messages'],
    queryFn: () => apiGet<MessagesResponse>('/api/messages?limit=200'),
    enabled: !!user,
    refetchInterval: 30_000,
  })

  // Seçili kullanıcı ile 1-1 sohbet mesajları (polling yedek: 30sn)
  const { data: conversationData, isLoading: conversationLoading } = useQuery({
    queryKey: ['conversation', selectedUserId],
    queryFn: () => apiGet<MessagesResponse>(`/api/messages?userId=${selectedUserId}&limit=200`),
    enabled: !!user && !!selectedUserId,
    refetchInterval: 30_000,
  })

  const allMessages = useMemo(() => allMessagesData?.items ?? [], [allMessagesData])
  const colleagues = useMemo(() => {
    let list = (usersData?.items ?? []).filter(
      (u) => u.id !== user?.id,
    )
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (u) => u.name.toLowerCase().includes(q) || (u.title ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [usersData, user, search])

  // Kullanıcı bazlı son mesaj ve okunmamış sayısı
  const userMeta = useMemo(() => {
    const meta = new Map<string, { lastMsg: ChatMessage; unread: number }>()
    for (const m of allMessages) {
      // currentUser ↔ otherUser
      const otherId = m.senderId === user?.id ? m.receiverId : m.senderId
      if (!otherId) continue
      const existing = meta.get(otherId)
      if (!existing || new Date(m.createdAt) > new Date(existing.lastMsg.createdAt)) {
        meta.set(otherId, {
          lastMsg: m,
          unread: existing?.unread ?? 0,
        })
      }
      // Unread: bana gelen ve okunmamış
      if (m.receiverId === user?.id && !m.isRead) {
        const cur = meta.get(otherId)
        if (cur) {
          cur.unread += 1
        }
      }
    }
    return meta
  }, [allMessages, user])

  const handleSelectUser = (uid: string) => {
    setSelectedUserId(uid)
    setMobileShowConversation(true)
  }

  const handleBack = () => {
    setMobileShowConversation(false)
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Oturum açmanız gerekir.
      </div>
    )
  }

  const conn = CONNECTION_META[socketStatus]

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3 shrink-0">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
              <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 bg-clip-text text-transparent">
                Mesajlar
              </span>
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Şirket içi anlık mesajlaşma — {colleagues.length} meslektaşınla iletişim kur.
            </p>
          </div>
          {/* Bağlantı göstergesi */}
          <Badge variant="outline" className={cn('gap-1.5 font-normal', conn.cls)}>
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                conn.dot,
                socketStatus === 'online' && 'animate-pulse',
              )}
            />
            {conn.label}
          </Badge>
        </div>

        <Card className="overflow-hidden flex-1 min-h-[440px] flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] flex-1 min-h-0">
              {/* Sol panel — kullanıcı listesi */}
              <div
                className={cn(
                  'border-r flex flex-col min-h-0 bg-muted/20',
                  mobileShowConversation && selectedUserId ? 'hidden md:flex' : 'flex',
                )}
              >
                <div className="p-3 border-b bg-background">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Meslektaş ara…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-1.5">
                    {usersLoading ? (
                      [...Array(5)].map((_, i) => (
                        <div key={i} className="p-2.5 animate-pulse">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-full bg-muted" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3 w-24 bg-muted rounded" />
                              <div className="h-2.5 w-32 bg-muted rounded" />
                            </div>
                          </div>
                        </div>
                      ))
                    ) : colleagues.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Meslektaş bulunamadı.
                      </div>
                    ) : (
                      colleagues.map((u) => {
                        const meta = userMeta.get(u.id)
                        const unread = meta?.unread ?? 0
                        const isSelected = selectedUserId === u.id
                        const online = onlineUserIds.has(u.id) // gerçek presence
                        return (
                          <button
                            key={u.id}
                            onClick={() => handleSelectUser(u.id)}
                            className={cn(
                              'w-full flex items-center gap-2.5 p-2.5 rounded-lg transition-colors text-left',
                              isSelected
                                ? 'bg-emerald-50 dark:bg-emerald-950/30'
                                : 'hover:bg-muted/60',
                            )}
                          >
                            <div className="relative shrink-0">
                              <Avatar className="w-10 h-10">
                                {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
                                <AvatarFallback
                                  className={cn(
                                    'bg-gradient-to-br text-white text-xs font-semibold',
                                    ROLE_AVATAR_GRADIENT[u.role],
                                  )}
                                >
                                  {initials(u.name)}
                                </AvatarFallback>
                              </Avatar>
                              {online && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">{u.name}</span>
                                {meta && (
                                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                    {fmtTime(meta.lastMsg.createdAt)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground truncate">
                                  {meta
                                    ? (meta.lastMsg.senderId === user.id ? 'Sen: ' : '') + meta.lastMsg.content
                                    : u.title ?? '—'}
                                </span>
                                {unread > 0 && (
                                  <Badge className="unread-pulse shrink-0 h-4 px-1.5 text-[10px] bg-emerald-600 text-white hover:bg-emerald-600">
                                    {unread}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Sağ panel — sohbet */}
              <div
                className={cn(
                  'relative flex flex-col min-h-0 bg-background',
                  !mobileShowConversation && selectedUserId ? 'hidden md:flex' : 'flex',
                )}
              >
                {selectedUserId ? (
                  <ConversationPanel
                    otherUser={colleagues.find((u) => u.id === selectedUserId) ?? null}
                    messages={conversationData?.items ?? []}
                    loading={conversationLoading}
                    currentUserId={user.id}
                    onlineUserIds={onlineUserIds}
                    isTyping={typingUserIds.has(selectedUserId)}
                    sendTyping={sendTyping}
                    sendReadReceipt={sendReadReceipt}
                    onBack={handleBack}
                  />
                ) : (
                  <EmptyConversation />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

// ─── Empty state ─────────────────────────────────────────────────
function EmptyConversation() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
        <MessageCircle className="w-8 h-8 text-emerald-600" />
      </div>
      <h3 className="font-semibold text-base mb-1">Sohbet başlat</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Bir kullanıcı seçin veya mesaj gönderin. Meslektaşlarınla anlık olarak iletişim kurabilirsin.
      </p>
    </div>
  )
}

// ─── Belge seçici diyaloğu (gerçek kayıtlar, aramalı) ────────────
function DocumentPickerDialog({
  open,
  onOpenChange,
  initialType,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialType: ChatDocumentType
  onPick: (doc: ChatDocument) => void
}) {
  const [typeFilter, setTypeFilter] = useState<ChatDocumentType | 'Tümü'>(initialType)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) {
      setTypeFilter(initialType)
      setSearch('')
    }
  }, [open, initialType])

  const { data, isLoading } = useQuery({
    queryKey: ['chat-documents'],
    queryFn: () => apiGet<DocumentsResponse>('/api/messages?type=documents'),
    enabled: open,
    staleTime: 30_000,
  })

  const filtered = useMemo(() => {
    let list = data?.items ?? []
    if (typeFilter !== 'Tümü') list = list.filter((d) => d.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (d) =>
          d.number.toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q),
      )
    }
    return list
  }, [data, typeFilter, search])

  const types: (ChatDocumentType | 'Tümü')[] = ['Tümü', 'Fatura', 'Sipariş', 'Proforma', 'Teklif']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Belge Gönder</DialogTitle>
          <DialogDescription>
            Gerçek bir belge seç — numarası mesaja ek olarak gider.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                typeFilter === t
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Numara veya müşteri ara…"
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="max-h-80 overflow-y-auto custom-scroll space-y-1.5 -mx-1 px-1">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Belgeler yükleniyor…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Bu kriterde belge bulunamadı.
            </div>
          ) : (
            filtered.map((doc) => {
              const Icon = DOC_TYPE_ICON[doc.type] ?? FileText
              return (
                <button
                  key={`${doc.type}-${doc.id}`}
                  type="button"
                  onClick={() => onPick(doc)}
                  className="w-full flex items-center gap-3 rounded-lg border p-2.5 text-left hover:bg-muted/60 transition-colors"
                >
                  <span className="w-8 h-8 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{doc.number}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {doc.customerName} · {formatDate(doc.createdAt)}
                    </span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums shrink-0">
                    {formatCurrency(doc.total, doc.currency)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Conversation panel ──────────────────────────────────────────
function ConversationPanel({
  otherUser,
  messages,
  loading,
  currentUserId,
  onlineUserIds,
  isTyping,
  sendTyping,
  sendReadReceipt,
  onBack,
}: {
  otherUser: UsersResponse['items'][0] | null
  messages: ChatMessage[]
  loading: boolean
  currentUserId: string
  onlineUserIds: ReadonlySet<string>
  isTyping: boolean
  sendTyping: (toUserId: string) => void
  sendReadReceipt: (senderId: string) => void
  onBack: () => void
}) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [docPickerOpen, setDocPickerOpen] = useState(false)
  const [docPickerType, setDocPickerType] = useState<ChatDocumentType>('Fatura')
  const [docPreview, setDocPreview] = useState<DocPreviewState | null>(null)

  // Mesaj eki chip'ine tıklandı → numaradan canlı çözümle → PDF önizleme aç
  // (PDF sunucuda anlık üretilir; mesaj tabanına dosya yazılmaz)
  const openDocPreview = async (att: { type: ChatDocumentType; number: string }) => {
    setDocPreview({ loading: true, title: `${att.type} · ${att.number}`, url: null, canPreview: true })
    try {
      const r = await apiGet<DocLookupResult>(
        `/api/messages/doc-lookup?type=${encodeURIComponent(att.type)}&number=${encodeURIComponent(att.number)}`,
      )
      setDocPreview({
        loading: false,
        title: `${r.type} · ${r.number} — ${r.customerName}`,
        url: r.url,
        canPreview: r.canPreview,
      })
    } catch (e) {
      setDocPreview(null)
      toast.error('Belge açılamadı', {
        description: e instanceof ApiError ? e.message : 'Belge çözümlenemedi',
      })
    }
  }

  // ── Akıllı kaydırma state'leri ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true) // kullanıcı altta mı? (alttan <120px)
  const forceScrollRef = useRef(false) // kendi mesajını gönderdi → her zaman en alta
  const [showJumpPill, setShowJumpPill] = useState(false)
  const [newBelowCount, setNewBelowCount] = useState(0)

  // En alta kaydır — çift requestAnimationFrame ile (DOM paint'ten sonra)
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (!el) return
        el.scrollTo({ top: el.scrollHeight, behavior })
        atBottomRef.current = true
        setShowJumpPill(false)
        setNewBelowCount(0)
      })
    })
  }, [])

  // Kullanıcı kaydırınca pozisyonu izle (alttan >120px → otomatik kaydırma durur)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distance < 120
    atBottomRef.current = atBottom
    if (atBottom) {
      setShowJumpPill(false)
      setNewBelowCount(0)
    } else {
      setShowJumpPill(true)
    }
  }, [])

  // Konuşma değişince (otherUser.id) anında en alta + göstergeleri sıfırla
  useEffect(() => {
    atBottomRef.current = true
    setShowJumpPill(false)
    setNewBelowCount(0)
    scrollToBottom('auto')
  }, [otherUser?.id, scrollToBottom])

  // Mesaj listesi değiştiğinde (array identity + son mesaj id) kaydır:
  //  - kendi gönderdiğimiz mesaj → HER ZAMAN en alta
  //  - zaten alttaysak → sessizce takip et
  //  - yukarıda okuyorsak → KAYDIRMA, "yeni mesaj" sayacını artır
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : ''
  useEffect(() => {
    if (messages.length === 0) return
    if (forceScrollRef.current) {
      forceScrollRef.current = false
      scrollToBottom('smooth')
      return
    }
    const last = messages[messages.length - 1]
    if (atBottomRef.current) {
      scrollToBottom('auto')
    } else if (last.senderId !== currentUserId) {
      setNewBelowCount((c) => c + 1)
    }
  }, [messages, lastMessageId, currentUserId, scrollToBottom])

  const sendMut = useMutation({
    mutationFn: (body: {
      receiverId: string
      content: string
      attachmentType?: string
      attachmentId?: string
      attachmentName?: string
    }) => apiPost<ChatMessage>('/api/messages', body),
    onSuccess: (msg) => {
      setInput('')
      // Optimistic enjeksiyon (socket event'i id ile tekilleştirir)
      if (otherUser?.id) {
        const conv = qc.getQueryData<MessagesResponse>(['conversation', otherUser.id])
        if (conv && !conv.items.some((m) => m.id === msg.id)) {
          qc.setQueryData<MessagesResponse>(['conversation', otherUser.id], {
            ...conv,
            items: [...conv.items, msg],
            total: conv.total + 1,
          })
        }
        const all = qc.getQueryData<MessagesResponse>(['all-messages'])
        if (all && !all.items.some((m) => m.id === msg.id)) {
          qc.setQueryData<MessagesResponse>(['all-messages'], {
            ...all,
            items: [...all.items, msg],
            total: all.total + 1,
          })
        }
      }
      qc.invalidateQueries({ queryKey: ['all-messages'] })
      qc.invalidateQueries({ queryKey: ['unread-messages'] })
    },
    onError: (e: ApiError) => {
      forceScrollRef.current = false
      toast.error('Mesaj gönderilemedi', { description: e.message })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/messages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-messages'] })
      qc.invalidateQueries({ queryKey: ['conversation', otherUser?.id] })
      qc.invalidateQueries({ queryKey: ['unread-messages'] })
    },
    onError: (e: ApiError) => {
      toast.error('Mesaj silinemedi', { description: e.message })
    },
  })

  const handleSend = () => {
    if (!input.trim() || !otherUser) return
    // Mesaj gönderince HER ZAMAN en alta (kullanıcı yukarıdayken bile)
    forceScrollRef.current = true
    scrollToBottom('smooth')
    sendMut.mutate({ receiverId: otherUser.id, content: input.trim() })
  }

  // Gerçek belge gönder (fatura/sipariş/proforma/teklif — gerçek kayıtlar)
  const handleSendDocument = (doc: ChatDocument) => {
    if (!otherUser) return
    forceScrollRef.current = true
    scrollToBottom('smooth')
    sendMut.mutate({
      receiverId: otherUser.id,
      content: `📎 ${doc.type} ${doc.number} — ${doc.customerName} — ${formatCurrency(doc.total, doc.currency)}`,
      attachmentType: doc.type,
      attachmentId: doc.id,
      attachmentName: doc.number,
    })
    toast.success(`${doc.type} gönderildi`, {
      description: `${doc.number} · ${doc.customerName}`,
    })
    setDocPickerOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleDelete = (id: string) => {
    deleteMut.mutate(id)
  }

  // ── Görüldü: gelen okunmamışları işaretle (PATCH = DB doğruluğu, socket = anında sinyal)
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  const unreadCount = useMemo(
    () => messages.reduce((n, m) => n + (m.receiverId === currentUserId && !m.isRead ? 1 : 0), 0),
    [messages, currentUserId],
  )
  const otherId = otherUser?.id ?? null
  useEffect(() => {
    if (unreadCount === 0 || !otherId) return
    const mark = async () => {
      sendReadReceipt(otherId) // anında görüldü sinyali (socket)
      const targets = messagesRef.current.filter(
        (m) => m.receiverId === currentUserId && !m.isRead,
      )
      await Promise.all(
        targets.map((m) => apiPatch(`/api/messages/${m.id}`, {}).catch(() => null)),
      )
      qc.invalidateQueries({ queryKey: ['all-messages'] })
      qc.invalidateQueries({ queryKey: ['conversation', otherId] })
      qc.invalidateQueries({ queryKey: ['unread-messages'] })
    }
    const t = setTimeout(mark, 400)
    return () => clearTimeout(t)
  }, [unreadCount, otherId, currentUserId, qc, sendReadReceipt])

  if (!otherUser) {
    return <EmptyConversation />
  }

  // Group messages by date
  const groups: { label: string; messages: ChatMessage[] }[] = []
  let currentLabel = ''
  for (const m of messages) {
    const label = fmtDateLabel(m.createdAt)
    if (label !== currentLabel) {
      groups.push({ label, messages: [] })
      currentLabel = label
    }
    groups[groups.length - 1].messages.push(m)
  }

  const online = onlineUserIds.has(otherUser.id)

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="relative">
          <Avatar className="w-9 h-9">
            {otherUser.avatarUrl ? <AvatarImage src={otherUser.avatarUrl} alt={otherUser.name} /> : null}
            <AvatarFallback
              className={cn(
                'bg-gradient-to-br text-white text-xs font-semibold',
                ROLE_AVATAR_GRADIENT[otherUser.role],
              )}
            >
              {initials(otherUser.name)}
            </AvatarFallback>
          </Avatar>
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{otherUser.name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            {otherUser.title && <span className="truncate">{otherUser.title}</span>}
            {otherUser.title && <span>·</span>}
            <span>{online ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
          </div>
        </div>
      </div>

      {/* Yazıyor göstergesi */}
      {isTyping && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b bg-emerald-50/60 dark:bg-emerald-950/20 text-[11px] text-emerald-700 dark:text-emerald-300">
          <span className="typing-dot" />
          <span className="typing-dot [animation-delay:150ms]" />
          <span className="typing-dot [animation-delay:300ms]" />
          <span className="ml-1">{otherUser.name} yazıyor…</span>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scroll p-4 space-y-4 bg-muted/10"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Mesajlar yükleniyor…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              {otherUser.name} ile henüz mesajlaşmadın. İlk mesajı gönder!
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="space-y-2">
              <div className="flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground bg-background px-2 py-0.5 rounded-full border">
                  {g.label}
                </span>
              </div>
              {g.messages.map((m) => {
                const mine = m.senderId === currentUserId
                const att = parseAttachment(m.content)
                const AttIcon = att ? DOC_TYPE_ICON[att.type] : null
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-end gap-2 group',
                      mine ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {!mine && (
                      <Avatar className="w-7 h-7 shrink-0">
                        {otherUser.avatarUrl ? <AvatarImage src={otherUser.avatarUrl} alt={otherUser.name} /> : null}
                        <AvatarFallback
                          className={cn(
                            'bg-gradient-to-br text-white text-[10px] font-semibold',
                            ROLE_AVATAR_GRADIENT[otherUser.role],
                          )}
                        >
                          {initials(otherUser.name)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm relative space-y-1.5',
                        mine
                          ? 'bg-emerald-600 text-white rounded-br-sm'
                          : 'bg-background border rounded-bl-sm',
                      )}
                    >
                      {att && AttIcon ? (
                        // Belge eki — LINK gibi: tıklayınca gerçek PDF önizlemesi açılır
                        // (dosya DB'ye yazılmaz; sunucuda anlık üretilir)
                        <button
                          type="button"
                          onClick={() => openDocPreview(att)}
                          title="PDF önizlemesini aç"
                          className={cn(
                            'group/chip flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors w-fit border',
                            mine
                              ? 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
                          )}
                        >
                          <AttIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="underline decoration-dotted underline-offset-2">
                            {att.type} · {att.number}
                          </span>
                          <span className="hidden sm:inline opacity-70">· PDF önizle</span>
                          {docPreview?.loading && docPreview.title.includes(att.number) ? (
                            <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3 h-3 opacity-60 shrink-0 group-hover/chip:opacity-100" />
                          )}
                        </button>
                      ) : null}
                      <div className="whitespace-pre-wrap break-words leading-snug">
                        {att ? att.rest : m.content}
                      </div>
                      <div
                        className={cn(
                          'flex items-center gap-1 mt-1 text-[10px]',
                          mine ? 'text-emerald-100' : 'text-muted-foreground',
                        )}
                      >
                        <span>{fmtTime(m.createdAt)}</span>
                        {mine && (
                          <span className="flex items-center gap-0.5">
                            {m.isRead && <span className="text-[9px]">Görüldü</span>}
                            <CheckCheck
                              className={cn('w-3 h-3', m.isRead ? 'text-emerald-100' : 'text-emerald-300/70')}
                            />
                          </span>
                        )}
                      </div>
                      {mine && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-background border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Mesajı sil</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* "↓ Yeni mesaj" pill — kullanıcı yukarı okurken görünür */}
      {showJumpPill && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-24 right-5 z-10 flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 transition-colors animate-fade-in"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          {newBelowCount > 0 ? 'Yeni mesaj' : 'En alta git'}
          {newBelowCount > 0 && (
            <span className="unread-pulse flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-emerald-700">
              {newBelowCount}
            </span>
          )}
        </button>
      )}

      {/* Input */}
      <div className="p-3 border-t bg-background">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" title="Belge gönder">
                <Paperclip className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Belge Gönder</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setDocPickerType('Fatura'); setDocPickerOpen(true) }}>
                🧾 Fatura
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDocPickerType('Sipariş'); setDocPickerOpen(true) }}>
                📦 Sipariş
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDocPickerType('Proforma'); setDocPickerOpen(true) }}>
                📄 Proforma
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDocPickerType('Teklif'); setDocPickerOpen(true) }}>
                📋 Teklif
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (otherUser) sendTyping(otherUser.id)
            }}
            onKeyDown={handleKeyDown}
            placeholder={`${otherUser.name} kişisine mesaj yaz…`}
            disabled={sendMut.isPending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMut.isPending}
            size="icon"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Enter ile gönder · Shift+Enter ile yeni satır
        </div>
      </div>

      {/* Gerçek belge seçici */}
      <DocumentPickerDialog
        open={docPickerOpen}
        onOpenChange={setDocPickerOpen}
        initialType={docPickerType}
        onPick={handleSendDocument}
      />

      {/* Belge PDF önizleme — gerçek sunucu PDF'i (DB'ye dosya yazılmaz) */}
      <Dialog open={!!docPreview} onOpenChange={(v) => { if (!v) setDocPreview(null) }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">{docPreview?.title}</span>
            </DialogTitle>
            <DialogDescription>
              Sunucuda üretilen gerçek PDF — mesaja yalnızca numara referansı kaydedilir, dosya veri tabanına yazılmaz.
            </DialogDescription>
          </DialogHeader>

          <div className="relative h-[60vh] rounded-lg border bg-muted/30 overflow-hidden">
            {docPreview?.loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                Belge hazırlanıyor…
              </div>
            )}
            {docPreview && !docPreview.loading && docPreview.url && (
              <iframe
                src={docPreview.url}
                title="Belge PDF önizleme"
                className="w-full h-full"
              />
            )}
            {docPreview && !docPreview.loading && !docPreview.url && !docPreview.canPreview && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                <Package className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Sipariş için doğrudan PDF yok</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Sipariş belgesi (fatura, irsaliye, çeki listesi) Belge Yönetimi sayfasından siparişe tıklayıp üretilebilir.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!docPreview?.url}
              onClick={() => docPreview?.url && window.open(docPreview.url, '_blank', 'noopener')}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Yeni Sekmede Aç
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!docPreview?.url}
              onClick={() => docPreview?.url && window.open(`${docPreview.url}?download=1`, '_blank', 'noopener')}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              PDF İndir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
