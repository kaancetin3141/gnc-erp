'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatRelative, formatDateTime, formatCompactNumber } from '@/lib/format'
import { PLATFORMS } from '@/lib/social/platforms'
import type { SocialPostItem } from '@/lib/social/types'
import { PlatformBadge } from './platform-badge'
import { ComposeDialog } from './compose-dialog'
import {
  Heart, MessageCircle, Repeat2, Eye, Send, Pencil, Trash2,
  Plus, Filter, RefreshCw, FileText, Image as ImageIcon, Video as VideoIcon, Link as LinkIcon, Clock,
  AlertTriangle, FlaskConical, RotateCcw, ExternalLink,
} from 'lucide-react'

type StatusFilter = 'all' | 'taslak' | 'zamanlandi' | 'yayinlandi' | 'basarisiz'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'taslak', label: 'Taslak' },
  { value: 'zamanlandi', label: 'Zamanlandı' },
  { value: 'yayinlandi', label: 'Yayınlandı' },
  { value: 'basarisiz', label: 'Başarısız' },
]

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  taslak: { label: 'Taslak', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  zamanlandi: { label: 'Zamanlandı', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' },
  yayinlandi: { label: 'Yayınlandı', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' },
  basarisiz: { label: 'Başarısız', className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  iptal: { label: 'İptal', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
}

const MEDIA_ICON = {
  text: FileText,
  image: ImageIcon,
  video: VideoIcon,
  link: LinkIcon,
  carousel: ImageIcon,
} as const

interface PublishResponse {
  success?: boolean
  successCount?: number
  totalTargets?: number
  finalStatus?: string
  forceMock?: boolean
  failures?: { platform: string; handle: string; success: boolean; error: string | null }[]
}

export function FeedView() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [editPost, setEditPost] = useState<SocialPostItem | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [deletePost, setDeletePost] = useState<SocialPostItem | null>(null)

  const { data: posts, isLoading, refetch, isFetching } = useQuery<SocialPostItem[]>({
    queryKey: ['social-posts', filter],
    queryFn: () => {
      const q = filter === 'all' ? '' : `?status=${filter}`
      return apiGet<SocialPostItem[]>(`/api/social/posts${q}`)
    },
  })

  function invalidateSocial() {
    qc.invalidateQueries({ queryKey: ['social-posts'] })
    qc.invalidateQueries({ queryKey: ['social-calendar'] })
    qc.invalidateQueries({ queryKey: ['social-analytics'] })
  }

  // Publish now — sonuç detayına göre doğru toast göster
  const publishMutation = useMutation({
    mutationFn: ({ id, forceMock }: { id: string; forceMock?: boolean }) =>
      apiPost<PublishResponse>(`/api/social/posts/${id}/publish`, { forceMock: forceMock ?? false }),
    onSuccess: (r, vars) => {
      const succ = r.successCount ?? 0
      const tot = r.totalTargets ?? 0
      if (r.success && succ === tot) {
        toast.success(vars.forceMock ? 'Simülasyon olarak yayınlandı' : 'Yayınlandı', {
          description: `${succ}/${tot} hedef başarılı`,
        })
      } else if (r.success) {
        // Kısmi başarı — başarısız platformları ve sebeplerini göster
        const failLines = (r.failures ?? []).map((f) => `• ${f.handle}: ${f.error ?? 'bilinmeyen hata'}`).join('\n')
        toast.warning(`${succ}/${tot} hedef yayınlandı`, {
          description: failLines || 'Bazı platformlar başarısız oldu',
          duration: 10000,
        })
      } else {
        // Tam başarısızlık — tüm sebepleri göster
        const failLines = (r.failures ?? []).map((f) => `• ${f.handle}: ${f.error ?? 'bilinmeyen hata'}`).join('\n')
        toast.error('Yayınlanamadı', {
          description: failLines || 'Tüm platformlar başarısız oldu',
          duration: 15000,
        })
      }
      invalidateSocial()
    },
    onError: (e: Error) => toast.error('Yayın başarısız', { description: e.message }),
  })

  // Delete
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/social/posts/${id}`),
    onSuccess: () => {
      toast.success('Gönderi silindi')
      setDeletePost(null)
      qc.invalidateQueries({ queryKey: ['social-posts'] })
      qc.invalidateQueries({ queryKey: ['social-calendar'] })
    },
    onError: (e: Error) => toast.error('Silme başarısız', { description: e.message }),
  })

  function handleEdit(p: SocialPostItem) {
    setEditPost(p)
    setComposeOpen(true)
  }

  function handleNew() {
    setEditPost(null)
    setComposeOpen(true)
  }

  // Toplam etkileşim hesapla
  function totalEngagement(p: SocialPostItem) {
    if (!p.targets || p.targets.length === 0) return { likes: 0, comments: 0, shares: 0, views: 0 }
    return p.targets.reduce(
      (acc, t) => ({
        likes: acc.likes + t.likes,
        comments: acc.comments + t.comments,
        shares: acc.shares + t.shares,
        views: acc.views + t.views,
      }),
      { likes: 0, comments: 0, shares: 0, views: 0 },
    )
  }

  return (
    <div className="space-y-4">
      {/* Üst toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? 'default' : 'outline'}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={handleNew}>
            <Plus className="w-4 h-4" /> Yeni Gönderi
          </Button>
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : !posts || posts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-4">Bu filtrede gönderi yok.</p>
            <Button onClick={handleNew}>
              <Plus className="w-4 h-4" /> Yeni Gönderi Oluştur
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => {
            const statusBadge = STATUS_BADGES[p.status] ?? STATUS_BADGES.taslak
            const MediaIcon = MEDIA_ICON[p.mediaType] ?? FileText
            const eng = totalEngagement(p)
            const canManage = p.status !== 'yayinlandi'
            return (
              <Card key={p.id} className="overflow-hidden transition-shadow hover:shadow-md">
                <CardContent className="p-4 space-y-3">
                  {/* Üst: yazar + status + zaman */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {(p.author?.name ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {p.author?.name ?? 'Bilinmiyor'}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {p.publishedAt ? (
                            <><span>Yayınlandı</span> · <span>{formatRelative(p.publishedAt)}</span></>
                          ) : p.scheduledAt ? (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>{formatDateTime(p.scheduledAt)}</span>
                            </>
                          ) : (
                            <span>Taslak · {formatRelative(p.createdAt)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <MediaIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', statusBadge.className)}>
                        {statusBadge.label}
                      </span>
                    </div>
                  </div>

                  {/* İçerik */}
                  <p className="text-sm leading-relaxed line-clamp-3 whitespace-pre-wrap">
                    {p.content}
                  </p>

                  {/* Hashtags */}
                  {p.hashtags && p.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.hashtags.slice(0, 8).map((h) => (
                        <span key={h} className="text-[10px] text-blue-600 dark:text-blue-400">
                          #{h}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Platformlar */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {p.platforms.map((pl) => (
                        <PlatformBadge key={pl} platform={pl} size="sm" />
                      ))}
                    </div>
                    {p.campaignName && (
                      <Badge variant="outline" className="text-[10px]">
                        🎯 {p.campaignName}
                      </Badge>
                    )}
                  </div>

                  {/* Etkileşim metrikleri */}
                  {p.status === 'yayinlandi' && (
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t">
                      <Metric icon={Heart} value={eng.likes} color="text-rose-500" />
                      <Metric icon={MessageCircle} value={eng.comments} color="text-emerald-500" />
                      <Metric icon={Repeat2} value={eng.shares} color="text-amber-500" />
                      <Metric icon={Eye} value={eng.views} color="text-primary" />
                    </div>
                  )}

                  {/* Yayın bağlantıları */}
                  {p.status === 'yayinlandi' && p.targets?.some((t) => t.externalUrl) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                      {p.targets.filter((t) => t.externalUrl).map((t) => (
                        <a
                          key={t.id}
                          href={t.externalUrl!}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {t.account?.handle ?? t.platform} görüntüle
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Hata detayı — neden yayınlanamadı? */}
                  {p.targets?.some((t) => t.status === 'basarisiz' && t.errorMessage) && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Yayın hatası — sebep:
                      </div>
                      {p.targets.filter((t) => t.status === 'basarisiz' && t.errorMessage).map((t) => (
                        <div key={t.id} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 pl-5">
                          <span>
                            <b>{t.account?.handle ?? t.platform}:</b> {t.errorMessage}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Aksiyonlar */}
                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => publishMutation.mutate({ id: p.id })}
                        disabled={publishMutation.isPending}
                      >
                        <RotateCcw className={cn('w-3.5 h-3.5', p.status === 'basarisiz' && 'hidden')} />
                        <Send className={cn('w-3.5 h-3.5', p.status !== 'basarisiz' && 'hidden')} />
                        {p.status === 'basarisiz' ? 'Tekrar Dene' : 'Yayınla'}
                      </Button>
                    )}
                    {canManage && p.status === 'basarisiz' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => publishMutation.mutate({ id: p.id, forceMock: true })}
                        disabled={publishMutation.isPending}
                        title="Gerçek API çağrısı yapmadan yayınla — hatalı token kredisi bitmiş olsa bile gönderi sistemde yayınlandı olarak işaretlenir"
                      >
                        <FlaskConical className="w-3.5 h-3.5" /> Simülasyon
                      </Button>
                    )}
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => handleEdit(p)}>
                        <Pencil className="w-3.5 h-3.5" /> Düzenle
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                      onClick={() => setDeletePost(p)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Sil
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Compose (edit mod) */}
      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        editPost={editPost}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deletePost} onOpenChange={(o) => !o && setDeletePost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gönderiyi sil?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu işlem geri alınamaz. Gönderi ve tüm hedef platform kayıtları silinecek.
              {deletePost && (
                <span className="block mt-2 text-xs">
                  İçerik: <i>"{deletePost.content.slice(0, 80)}..."</i>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletePost && deleteMutation.mutate(deletePost.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Siliniyor...' : 'Sil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Metric({ icon: Icon, value, color }: { icon: typeof Heart; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn('w-3.5 h-3.5', color)} />
      <span className="text-xs font-medium">{formatCompactNumber(value)}</span>
    </div>
  )
}

export function getPlatformLabel(p: string): string {
  return PLATFORMS[p as keyof typeof PLATFORMS]?.label ?? p
}
