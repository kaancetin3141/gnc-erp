'use client'

// ============================================================
// ADMIN PANEL — Değerlendirmeler sekmesi
// Randevu sonrası değerlendirme moderasyonu:
// · durum filtresi (Tümü / Bekleyen / Onaylı / Reddedildi)
// · arama (yazar, yorum, işletme adı — debounce'lu)
// · tablo: işletme, yazar, puan (yıldız), yorum (kesik + title),
//   durum rozeti, tarih
// · satır aksiyonları: Onayla / Reddet / Sil (confirm)
// · satır genişletme: tam yorum + işletme yanıtı yazma
// Kapsam: superadmin platform geneli · admin kendi tenant'ının
// işletmelerinin değerlendirmeleri (provider.tenantId üzerinden)
// ============================================================

import { Fragment, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiDelete } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatDate } from '@/lib/format'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Star, Search, RefreshCw, Loader2, Trash2, ChevronDown, ChevronUp,
  Check, X, MessageSquareText,
} from 'lucide-react'

interface ReviewListItem {
  id: string
  providerName: string
  providerSlug: string | null
  authorName: string
  rating: number
  comment: string | null
  status: 'pending' | 'approved' | 'rejected'
  staffReply: string | null
  repliedAt: string | null
  createdAt: string
  appointmentCode: string | null
}

interface ReviewsResponse {
  items: ReviewListItem[]
  total: number
  page: number
  pageSize: number
  counts: { pending: number }
}

type StatusFilter = '' | 'pending' | 'approved' | 'rejected'

const STATUS_META: Record<ReviewListItem['status'], { label: string; className: string }> = {
  pending: {
    label: 'Beklemede',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  },
  approved: {
    label: 'Onaylandı',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  rejected: {
    label: 'Reddedildi',
    className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  },
}

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="text-amber-500 tracking-wider whitespace-nowrap"
      title={`${rating} / 5`}
      aria-label={`5 üzerinden ${rating} puan`}
    >
      {'★'.repeat(rating)}
      <span className="text-muted-foreground/40">{'☆'.repeat(5 - rating)}</span>
    </span>
  )
}

export function ReviewsTab() {
  const qc = useQueryClient()

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [page, setPage] = useState(0) // 0 tabanlı
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(0)
  }, [status])

  const PAGE_SIZE = 20
  const listQ = useQuery({
    queryKey: ['admin-reviews', status, q, page],
    queryFn: () =>
      apiGet<ReviewsResponse>(
        `/api/admin/reviews?status=${status}&q=${encodeURIComponent(q)}&page=${page + 1}`,
      ),
  })

  const [deleteTarget, setDeleteTarget] = useState<ReviewListItem | null>(null)

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      apiPatch<{ ok: boolean }>(`/api/admin/reviews/${encodeURIComponent(id)}`, { status }),
    onSuccess: (_res, vars) => {
      toast.success(vars.status === 'approved' ? 'Değerlendirme onaylandı' : 'Değerlendirme reddedildi')
      qc.invalidateQueries({ queryKey: ['admin-reviews'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveReplyMutation = useMutation({
    mutationFn: ({ id, staffReply }: { id: string; staffReply: string }) =>
      apiPatch<{ ok: boolean }>(`/api/admin/reviews/${encodeURIComponent(id)}`, {
        status: 'approved',
        staffReply,
      }),
    onSuccess: () => {
      toast.success('İşletme yanıtı kaydedildi (değerlendirme onaylı)')
      setExpanded(null)
      qc.invalidateQueries({ queryKey: ['admin-reviews'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteReview = useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ ok: boolean }>(`/api/admin/reviews/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('Değerlendirme silindi')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['admin-reviews'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const items = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const pendingCount = listQ.data?.counts.pending ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: '', label: 'Tümü' },
    { key: 'pending', label: 'Bekleyen' },
    { key: 'approved', label: 'Onaylı' },
    { key: 'rejected', label: 'Reddedildi' },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500" />
                Değerlendirmeler
                {pendingCount > 0 && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white">
                    {pendingCount} beklemede
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Randevu sonrası puanlar ve yorumlar · {total} kayıt
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-44 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Yazar, yorum veya işletme ara..."
                  className="h-8 text-xs pl-7"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => listQ.refetch()}
                disabled={listQ.isFetching}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${listQ.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {statusFilters.map((f) => (
              <Button
                key={f.key}
                variant={status === f.key ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setStatus(f.key)}
              >
                {f.label}
                {f.key === 'pending' && pendingCount > 0 && (
                  <span className="ml-1 text-[10px] opacity-80">{pendingCount}</span>
                )}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : listQ.isError ? (
            <div className="p-6 text-center text-sm text-destructive">
              Değerlendirmeler yüklenemedi: {(listQ.error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                <Star className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                {q || status
                  ? 'Aramaya uyan değerlendirme bulunamadı.'
                  : 'Henüz değerlendirme yok.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">İşletme</TableHead>
                  <TableHead className="text-xs">Yazar</TableHead>
                  <TableHead className="text-xs">Puan</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Yorum</TableHead>
                  <TableHead className="text-xs">Durum</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Tarih</TableHead>
                  <TableHead className="text-xs text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.pending
                  const isExpanded = expanded === r.id
                  return (
                    <Fragment key={r.id}>
                      <TableRow>
                        <TableCell className="w-8 px-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label={isExpanded ? 'Satırı kapat' : 'Satırı aç'}
                            onClick={() => {
                              if (isExpanded) {
                                setExpanded(null)
                              } else {
                                setExpanded(r.id)
                                setReplyDraft(r.staffReply ?? '')
                              }
                            }}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm font-medium max-w-[160px] truncate">
                          {r.providerName}
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">
                          {r.authorName}
                        </TableCell>
                        <TableCell>
                          <Stars rating={r.rating} />
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground hidden md:table-cell max-w-[260px] truncate"
                          title={r.comment ?? ''}
                        >
                          {r.comment || <span className="italic">— puansız yorum yok —</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] ${meta.className}`}>
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                          {formatDate(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {r.status !== 'approved' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              disabled={setStatusMutation.isPending}
                              onClick={() => setStatusMutation.mutate({ id: r.id, status: 'approved' })}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" />
                              Onayla
                            </Button>
                          )}
                          {r.status !== 'rejected' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              disabled={setStatusMutation.isPending}
                              onClick={() => setStatusMutation.mutate({ id: r.id, status: 'rejected' })}
                            >
                              <X className="w-3.5 h-3.5 mr-1" />
                              Reddet
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/40 px-4 py-3">
                            <div className="space-y-2 max-w-3xl">
                              <div className="text-xs text-muted-foreground">
                                {r.appointmentCode ? `Randevu No: ${r.appointmentCode} · ` : ''}
                                {formatDate(r.createdAt)}
                              </div>
                              <p className="text-sm whitespace-pre-line break-words">
                                {r.comment || '—'}
                              </p>
                              <div className="flex items-start gap-2 pt-1">
                                <MessageSquareText className="w-4 h-4 mt-2 text-muted-foreground shrink-0" />
                                <Textarea
                                  value={replyDraft}
                                  onChange={(e) => setReplyDraft(e.target.value)}
                                  placeholder="İşletme yanıtı (onaylanan değerlendirmenin altında görünür)"
                                  className="text-xs min-h-[60px]"
                                  maxLength={1000}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={
                                    saveReplyMutation.isPending || !replyDraft.trim()
                                  }
                                  onClick={() =>
                                    saveReplyMutation.mutate({
                                      id: r.id,
                                      staffReply: replyDraft.trim(),
                                    })
                                  }
                                >
                                  {saveReplyMutation.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 mr-1" />
                                  )}
                                  Yanıtı Kaydet &amp; Onayla
                                </Button>
                                <span className="text-[11px] text-muted-foreground">
                                  Yanıt kaydedildiğinde değerlendirme onaylanır ve işletme
                                  sayfasında yayınlanır.
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sayfalama */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            Sayfa {page + 1} / {pageCount} · {total} değerlendirme
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page === 0 || listQ.isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Önceki
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page + 1 >= pageCount || listQ.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Sonraki
          </Button>
        </div>
      )}

      {/* Silme onay diyaloğu */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Değerlendirmeyi sil</DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-medium text-foreground">
                {deleteTarget?.providerName}
              </span>{' '}
              — {deleteTarget?.authorName} ({deleteTarget?.rating}/5) kalıcı olarak silinecek.
              Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteReview.isPending}
              onClick={() => deleteTarget && deleteReview.mutate(deleteTarget.id)}
            >
              {deleteReview.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              Evet, Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
