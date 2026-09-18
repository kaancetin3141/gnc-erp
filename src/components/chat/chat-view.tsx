'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
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
  Send, ArrowLeft, MessageCircle, Search, Trash2, CheckCheck,
  Paperclip,
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

const ROLE_AVATAR_GRADIENT: Record<Role, string> = {
  superadmin: 'from-amber-500 to-orange-600',
  admin: 'from-emerald-500 to-teal-600',
  manager: 'from-violet-500 to-purple-600',
  rep: 'from-teal-500 to-cyan-600',
  readonly: 'from-slate-500 to-slate-600',
  stock: 'from-rose-500 to-pink-600',
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

// ─── Mock online status (deterministic by user id) ───────────────
function isOnline(userId: string): boolean {
  // Online: id hash'in %3'ü 0 ise (yaklaşık 1/3)
  const hash = userId.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return hash % 3 === 0
}

// ─── Main view ───────────────────────────────────────────────────
export function ChatView() {
  const { user } = useAppStore()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [mobileShowConversation, setMobileShowConversation] = useState(false)
  const [search, setSearch] = useState('')

  // Aynı şirketteki kullanıcıları çek (mesajlaşma için)
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['chat-users'],
    queryFn: () => apiGet<UsersResponse>('/api/messages?type=users'),
    enabled: !!user,
  })

  // Tüm mesajları çek (currentUser ile ilgili) — sol panel preview + unread için
  const { data: allMessagesData } = useQuery({
    queryKey: ['all-messages'],
    queryFn: () => apiGet<MessagesResponse>('/api/messages?limit=200'),
    enabled: !!user,
    refetchInterval: 3_000, // 3 saniye — daha hızlı yenileme
  })

  // Seçili kullanıcı ile 1-1 sohbet mesajları
  const { data: conversationData, isLoading: conversationLoading } = useQuery({
    queryKey: ['conversation', selectedUserId],
    queryFn: () => apiGet<MessagesResponse>(`/api/messages?userId=${selectedUserId}&limit=200`),
    enabled: !!user && !!selectedUserId,
    refetchInterval: 2_000, // 2 saniye — sohbette daha hızlı
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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
              Mesajlar
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Şirket içi anlık mesajlaşma — {colleagues.length} meslektaşınla iletişim kur.
            </p>
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] h-[70vh] min-h-[520px]">
              {/* Sol panel — kullanıcı listesi */}
              <div
                className={cn(
                  'border-r flex flex-col bg-muted/20',
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
                        const online = isOnline(u.id)
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
                                  <Badge className="shrink-0 h-4 px-1.5 text-[10px] bg-emerald-600 text-white hover:bg-emerald-600">
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
                  'flex flex-col bg-background',
                  !mobileShowConversation && selectedUserId ? 'hidden md:flex' : 'flex',
                )}
              >
                {selectedUserId ? (
                  <ConversationPanel
                    otherUser={colleagues.find((u) => u.id === selectedUserId) ?? null}
                    messages={conversationData?.items ?? []}
                    loading={conversationLoading}
                    currentUserId={user.id}
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

// ─── Conversation panel ──────────────────────────────────────────
function ConversationPanel({
  otherUser,
  messages,
  loading,
  currentUserId,
  onBack,
}: {
  otherUser: UsersResponse['items'][0] | null
  messages: ChatMessage[]
  loading: boolean
  currentUserId: string
  onBack: () => void
}) {
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const sendMut = useMutation({
    mutationFn: (body: { receiverId: string; content: string }) =>
      apiPost<ChatMessage>('/api/messages', body),
    onSuccess: () => {
      setInput('')
      qc.invalidateQueries({ queryKey: ['all-messages'] })
      qc.invalidateQueries({ queryKey: ['conversation', otherUser?.id] })
      qc.invalidateQueries({ queryKey: ['unread-messages'] })
    },
    onError: (e: ApiError) => toast.error('Mesaj gönderilemedi', { description: e.message }),
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
    sendMut.mutate({ receiverId: otherUser.id, content: input.trim() })
  }

  // Belge gönder (fatura/sipariş/proforma/çeki listesi)
  const handleSendAttachment = (type: string, id: string, name: string) => {
    if (!otherUser) return
    sendMut.mutate({
      receiverId: otherUser.id,
      content: `${type} gönderildi: ${name}`,
      attachmentType: type,
      attachmentId: id,
      attachmentName: name,
    })
    toast.success(`${type} gönderildi`, { description: name })
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Mark received messages as read on view
  const unreadReceived = messages.filter(
    (m) => m.receiverId === currentUserId && !m.isRead,
  )
  useEffect(() => {
    if (unreadReceived.length === 0) return
    const mark = async () => {
      await Promise.all(
        unreadReceived.map((m) =>
          apiPatch(`/api/messages/${m.id}`, {}).catch(() => null),
        ),
      )
      qc.invalidateQueries({ queryKey: ['all-messages'] })
      qc.invalidateQueries({ queryKey: ['conversation', otherUser?.id] })
      qc.invalidateQueries({ queryKey: ['unread-messages'] })
    }
    const t = setTimeout(mark, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadReceived.length, otherUser?.id])

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

  const online = isOnline(otherUser.id)

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

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4 bg-muted/10"
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
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm relative',
                        mine
                          ? 'bg-emerald-600 text-white rounded-br-sm'
                          : 'bg-background border rounded-bl-sm',
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words leading-snug">
                        {m.content}
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
              <DropdownMenuItem onClick={() => otherUser && handleSendAttachment('Fatura', 'son', otherUser.name)}>
                🧾 Fatura
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => otherUser && handleSendAttachment('Sipariş', 'son', otherUser.name)}>
                📦 Sipariş
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => otherUser && handleSendAttachment('Proforma', 'son', otherUser.name)}>
                📄 Proforma
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => otherUser && handleSendAttachment('Çeki Listesi', 'son', otherUser.name)}>
                📋 Çeki Listesi
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
    </>
  )
}
