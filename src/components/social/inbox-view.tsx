'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatRelative, initials as initialsOf } from '@/lib/format'
import { PLATFORMS } from '@/lib/social/platforms'
import type { SocialInboxItem } from '@/lib/social/types'
import { PlatformBadge } from './platform-badge'
import {
  Inbox, Send, RefreshCw, AtSign, MessageCircle, Star, Mail,
  CheckCheck, AlertCircle, Trash2, ChevronDown, ChevronRight, Sparkles,
} from 'lucide-react'

type FilterTab = 'all' | 'unread' | 'dm' | 'comment' | 'mention' | 'review'

const TABS: { value: FilterTab; label: string; icon: typeof Mail }[] = [
  { value: 'all', label: 'Tümü', icon: Inbox },
  { value: 'unread', label: 'Okunmamış', icon: Mail },
  { value: 'dm', label: 'DM', icon: MessageCircle },
  { value: 'comment', label: 'Yorum', icon: MessageCircle },
  { value: 'mention', label: 'Mention', icon: AtSign },
  { value: 'review', label: 'Değerlendirme', icon: Star },
]

const TYPE_LABELS: Record<string, { label: string; icon: typeof Mail }> = {
  dm: { label: 'DM', icon: MessageCircle },
  comment: { label: 'Yorum', icon: MessageCircle },
  mention: { label: 'Mention', icon: AtSign },
  review: { label: 'Değerlendirme', icon: Star },
  story_reply: { label: 'Story Yanıt', icon: MessageCircle },
}

const PRIORITY_DOT: Record<string, string> = {
  acil: 'bg-red-500',
  yuksek: 'bg-orange-500',
  normal: 'bg-blue-500',
  dusuk: 'bg-slate-300',
}

const PRIORITY_LABEL: Record<string, string> = {
  acil: 'Acil',
  yuksek: 'Yüksek',
  normal: 'Normal',
  dusuk: 'Düşük',
}

export function InboxView() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<FilterTab>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replyText, setReplyText] = useState<Record<string, string>>({})

  const query = (() => {
    switch (tab) {
      case 'unread': return '?unread=1'
      case 'dm': return '?type=dm'
      case 'comment': return '?type=comment'
      case 'mention': return '?type=mention'
      case 'review': return '?type=review'
      default: return ''
    }
  })()

  const { data: messages, isLoading, isFetching, refetch } = useQuery<SocialInboxItem[]>({
    queryKey: ['social-inbox', tab],
    queryFn: () => apiGet<SocialInboxItem[]>(`/api/social/inbox${query}`),
  })

  // Mark as read
  const markReadMutation = useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
      apiPatch(`/api/social/inbox/${id}`, { isRead }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-inbox'] }),
    onError: (e: Error) => toast.error('İşlem başarısız', { description: e.message }),
  })

  // Reply
  const replyMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiPatch(`/api/social/inbox/${id}`, { replyText: text }),
    onSuccess: () => {
      toast.success('Yanıt gönderildi')
      qc.invalidateQueries({ queryKey: ['social-inbox'] })
      setReplyText((p) => ({ ...p, ['_' + id]: '' }))
    },
    onError: (e: Error) => toast.error('Yanıt başarısız', { description: e.message }),
  })

  // Priority change
  const priorityMutation = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: string }) =>
      apiPatch(`/api/social/inbox/${id}`, { priority }),
    onSuccess: () => {
      toast.success('Öncelik güncellendi')
      qc.invalidateQueries({ queryKey: ['social-inbox'] })
    },
    onError: (e: Error) => toast.error('İşlem başarısız', { description: e.message }),
  })

  // Delete
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/social/inbox/${id}`),
    onSuccess: () => {
      toast.success('Mesaj silindi')
      qc.invalidateQueries({ queryKey: ['social-inbox'] })
    },
    onError: (e: Error) => toast.error('Silme başarısız', { description: e.message }),
  })

  // Generate mock messages
  const mockMutation = useMutation({
    mutationFn: () => apiPost('/api/social/inbox', { action: 'generate-mock' }),
    onSuccess: (r: { generated?: number }) => {
      toast.success(`${r.generated ?? 0} mock mesaj üretildi`)
      qc.invalidateQueries({ queryKey: ['social-inbox'] })
    },
    onError: (e: Error) => toast.error('Üretim başarısız', { description: e.message }),
  })

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id))
    // Eğer okunmamış ise okundu işaretle
    const msg = messages?.find((m) => m.id === id)
    if (msg && !msg.isRead) {
      markReadMutation.mutate({ id, isRead: true })
    }
  }

  function sendReply(id: string) {
    const text = replyText[id] || replyText['_' + id] || ''
    if (!text.trim()) return
    replyMutation.mutate({ id, text: text.trim() })
  }

  const unreadCount = (messages ?? []).filter((m) => !m.isRead).length
  const urgentCount = (messages ?? []).filter((m) => m.priority === 'acil').length

  return (
    <div className="space-y-4">
      {/* Üst toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <Button
                key={t.value}
                size="sm"
                variant={tab === t.value ? 'default' : 'outline'}
                onClick={() => { setTab(t.value); setExpanded(null) }}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
                {t.value === 'unread' && unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          {urgentCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="w-3 h-3" /> {urgentCount} acil
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => mockMutation.mutate()}
            disabled={mockMutation.isPending}
          >
            <Sparkles className="w-3.5 h-3.5" /> Mock Üret
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !messages || messages.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-4">
              Bu filtrede mesaj yok. Test için "Mock Üret" butonuna basın.
            </p>
            <Button onClick={() => mockMutation.mutate()} disabled={mockMutation.isPending}>
              <Sparkles className="w-4 h-4" /> Mock Mesaj Üret
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {messages.map((m) => {
            const isOpen = expanded === m.id
            const typeMeta = TYPE_LABELS[m.type] ?? TYPE_LABELS.comment
            const TypeIcon = typeMeta.icon
            const senderDisplay = m.senderName
            const senderSub = m.senderHandle ? `@${m.senderHandle}` : ''
            return (
              <Card
                key={m.id}
                className={cn(
                  'transition-shadow',
                  isOpen ? 'shadow-md' : 'hover:shadow-sm',
                  !m.isRead && 'border-l-4 border-l-primary',
                )}
              >
                <CardContent className="p-3">
                  {/* Satır */}
                  <button
                    className="w-full flex items-start gap-3 text-left"
                    onClick={() => toggleExpand(m.id)}
                  >
                    {/* Avatar + priority dot */}
                    <div className="relative shrink-0">
                      <Avatar className="w-9 h-9">
                        {m.senderAvatar && (
                          <img src={m.senderAvatar} alt={m.senderName} className="w-full h-full object-cover rounded-full" />
                        )}
                        <AvatarFallback className="text-xs bg-gradient-to-br from-slate-500 to-slate-700 text-white">
                          {initialsOf(senderDisplay)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                          PRIORITY_DOT[m.priority] ?? PRIORITY_DOT.normal,
                        )}
                        title={`Öncelik: ${PRIORITY_LABEL[m.priority] ?? m.priority}`}
                      />
                    </div>

                    {/* İçerik */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <PlatformBadge platform={m.platform} size="sm" showLabel={false} />
                        <span className="text-sm font-semibold truncate">{senderDisplay}</span>
                        {senderSub && (
                          <span className="text-xs text-muted-foreground truncate">{senderSub}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <TypeIcon className="w-3 h-3" /> {typeMeta.label}
                        </span>
                        {!m.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Okunmamış" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        {m.content}
                      </p>
                    </div>

                    {/* Sağ: zaman + ok simgesi */}
                    <div className="shrink-0 text-right flex flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">{formatRelative(m.receivedAt)}</span>
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  </button>

                  {/* Açık durumda: detay + yanıt kutusu */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {/* Reply history */}
                      {m.isReplied && m.replyText && (
                        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-2">
                          <div className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
                            <CheckCheck className="w-3 h-3" /> YANITLANDI
                          </div>
                          <p className="text-xs">{m.replyText}</p>
                        </div>
                      )}
                      {/* Reply box */}
                      <div className="flex gap-2 items-end">
                        <Input
                          placeholder="Yanıt yazın..."
                          value={replyText[m.id] ?? ''}
                          onChange={(e) => setReplyText((p) => ({ ...p, [m.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(m.id) } }}
                        />
                        <Button
                          size="sm"
                          onClick={() => sendReply(m.id)}
                          disabled={replyMutation.isPending || !(replyText[m.id]?.trim())}
                        >
                          <Send className="w-3.5 h-3.5" /> Yanıtla
                        </Button>
                      </div>
                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Select
                          value={m.priority}
                          onValueChange={(v) => priorityMutation.mutate({ id: m.id, priority: v })}
                        >
                          <SelectTrigger size="sm" className="w-32 h-7 text-xs">
                            <SelectValue placeholder="Öncelik" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="acil">Acil</SelectItem>
                            <SelectItem value="yuksek">Yüksek</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="dusuk">Düşük</SelectItem>
                          </SelectContent>
                        </Select>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markReadMutation.mutate({ id: m.id, isRead: !m.isRead })}
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                              {m.isRead ? 'Okundu' : 'Okundu işaretle'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Okuma durumunu değiştir</TooltipContent>
                        </Tooltip>
                        {m.postUrl && (
                          <a href={m.postUrl} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost">
                              Orijinal gönderi
                            </Button>
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 ml-auto"
                          onClick={() => deleteMutation.mutate(m.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Sil
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
