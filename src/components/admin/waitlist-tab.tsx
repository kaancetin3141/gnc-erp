'use client'

// ============================================================
// ADMIN PANEL — Bekleme Listesi sekmesi
// Dolu randevu slotu için bekleyen müşteriler (Fresha/Booksy
// "waitlist" deseni):
// · durum filtresi (Tümü / Bekliyor / Bildirildi / Randevu verildi /
//   İptal / Süresi geçti) + "N sırada" rozeti
// · arama (müşteri adı / telefon / işletme — debounce'lu)
// · tarih aralığı (istenen tarih from/to)
// · tablo: işletme, müşteri (isim+telefon), hizmet, istenen
//   tarih/slot, durum rozeti, not, kayıt tarihi
// · satır aksiyonları: Bildirildi / Randevu verildi / İptal / Sil (confirm)
// Kapsam: superadmin platform geneli · admin kendi tenant'ının
// işletmeleri (provider.tenantId üzerinden)
// ============================================================

import { useEffect, useState } from 'react'
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Hourglass, Search, RefreshCw, Loader2, Trash2, ChevronLeft, ChevronRight,
  PhoneCall, CalendarCheck, XCircle,
} from 'lucide-react'

interface WaitlistListItem {
  id: string
  providerName: string
  providerSlug: string | null
  customerName: string
  customerPhone: string // 905XXXXXXXXX
  serviceName: string | null
  preferredDate: string
  preferredSlot: string | null
  note: string | null
  status: 'waiting' | 'notified' | 'booked' | 'cancelled' | 'expired'
  notifiedAt: string | null
  createdAt: string
  appointmentCode: string | null
}

interface WaitlistResponse {
  items: WaitlistListItem[]
  total: number
  page: number
  pageSize: number
  counts: { waiting: number }
}

type StatusFilter = '' | 'waiting' | 'notified' | 'booked' | 'cancelled' | 'expired'

const STATUS_META: Record<WaitlistListItem['status'], { label: string; className: string }> = {
  waiting: {
    label: 'Bekliyor',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  },
  notified: {
    label: 'Bildirildi',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  booked: {
    label: 'Randevu verildi',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  cancelled: {
    label: 'İptal',
    className: 'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-900/40 dark:text-stone-400 dark:border-stone-700',
  },
  expired: {
    label: 'Süresi geçti',
    className: 'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-900/40 dark:text-stone-400 dark:border-stone-700',
  },
}

/** 905XXXXXXXXX → 05XX XXX XX XX (görüntü formatı) */
function fmtPhone(d: string): string {
  const raw = String(d || '').replace(/\D/g, '')
  if (raw.length === 12 && raw.startsWith('90')) {
    const n = raw.slice(2)
    return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}`
  }
  return d
}

export function WaitlistTab() {
  const qc = useQueryClient()

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0) // 0 tabanlı
  const [deleteTarget, setDeleteTarget] = useState<WaitlistListItem | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(0)
  }, [status, from, to])

  const PAGE_SIZE = 20
  const listQ = useQuery({
    queryKey: ['admin-waitlist', status, q, from, to, page],
    queryFn: () =>
      apiGet<WaitlistResponse>(
        `/api/admin/waitlist?status=${status}&q=${encodeURIComponent(q)}` +
        `&from=${from}&to=${to}&page=${page + 1}`,
      ),
  })

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'notified' | 'booked' | 'cancelled' | 'expired' }) =>
      apiPatch<{ ok: boolean }>(`/api/admin/waitlist/${encodeURIComponent(id)}`, { status }),
    onSuccess: (_res, vars) => {
      const msg = vars.status === 'notified' ? 'Müşteri arandı olarak işaretlendi'
        : vars.status === 'booked' ? 'Randevu verildi olarak işaretlendi'
        : vars.status === 'cancelled' ? 'Bekleme kaydı iptal edildi'
        : 'Bekleme kaydının süresi geçti olarak işaretlendi'
      toast.success(msg)
      qc.invalidateQueries({ queryKey: ['admin-waitlist'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ ok: boolean }>(`/api/admin/waitlist/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('Bekleme kaydı silindi')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['admin-waitlist'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const items = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const waitingCount = listQ.data?.counts.waiting ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: '', label: 'Tümü' },
    { key: 'waiting', label: 'Bekliyor' },
    { key: 'notified', label: 'Bildirildi' },
    { key: 'booked', label: 'Randevu verildi' },
    { key: 'cancelled', label: 'İptal' },
    { key: 'expired', label: 'Süresi geçti' },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Hourglass className="w-4 h-4 text-amber-500" />
                Bekleme Listesi
                {waitingCount > 0 && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white">
                    {waitingCount} sırada
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Dolu slot için bekleyen müşteriler — iptal olduğunda sıradan arayın · {total} kayıt
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 text-xs w-[140px]"
                aria-label="İstenen tarih (başlangıç)"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 text-xs w-[140px]"
                aria-label="İstenen tarih (bitiş)"
              />
              <div className="relative w-44 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Müşteri, telefon veya işletme ara..."
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
                {f.key === 'waiting' && waitingCount > 0 && (
                  <span className="ml-1 text-[10px] opacity-80">{waitingCount}</span>
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
              Bekleme listesi yüklenemedi: {(listQ.error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                <Hourglass className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                {q || status || from || to
                  ? 'Aramaya uyan bekleme kaydı bulunamadı.'
                  : 'Henüz bekleme kaydı yok.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">İşletme</TableHead>
                  <TableHead className="text-xs">Müşteri</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Hizmet</TableHead>
                  <TableHead className="text-xs">İstenen</TableHead>
                  <TableHead className="text-xs">Durum</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Not</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Kayıt</TableHead>
                  <TableHead className="text-xs text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((w) => {
                  const meta = STATUS_META[w.status] ?? STATUS_META.waiting
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm font-medium max-w-[150px] truncate">
                        {w.providerName}
                      </TableCell>
                      <TableCell className="text-sm max-w-[170px]">
                        <div className="font-medium truncate">{w.customerName}</div>
                        <a
                          href={`tel:+${w.customerPhone}`}
                          className="text-xs text-muted-foreground tabular-nums hover:text-emerald-700 dark:hover:text-emerald-400 underline-offset-2 hover:underline"
                          title="Müşteriyi ara"
                        >
                          {fmtPhone(w.customerPhone)}
                        </a>
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground hidden md:table-cell max-w-[150px] truncate"
                        title={w.serviceName ?? ''}
                      >
                        {w.serviceName || <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <div>{formatDate(w.preferredDate)}</div>
                        {w.preferredSlot && (
                          <div className="text-muted-foreground tabular-nums">⏱ {w.preferredSlot}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[11px] ${meta.className}`}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground hidden lg:table-cell max-w-[200px] truncate"
                        title={w.note ?? ''}
                      >
                        {w.note || <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {formatDate(w.createdAt)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {w.status === 'waiting' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              title="Müşteriyi aradınız — bildirildi olarak işaretle"
                              disabled={setStatusMutation.isPending}
                              onClick={() => setStatusMutation.mutate({ id: w.id, status: 'notified' })}
                            >
                              <PhoneCall className="w-3.5 h-3.5 mr-1" />
                              Bildirildi
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              title="Müşteriye yer verildi — randevu verildi olarak işaretle"
                              disabled={setStatusMutation.isPending}
                              onClick={() => setStatusMutation.mutate({ id: w.id, status: 'booked' })}
                            >
                              <CalendarCheck className="w-3.5 h-3.5 mr-1" />
                              Randevu verildi
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-stone-600 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900/40"
                              disabled={setStatusMutation.isPending}
                              onClick={() => setStatusMutation.mutate({ id: w.id, status: 'cancelled' })}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              İptal
                            </Button>
                          </>
                        )}
                        {w.status !== 'waiting' && w.status !== 'expired' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-stone-600 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900/40"
                            disabled={setStatusMutation.isPending}
                            onClick={() => setStatusMutation.mutate({ id: w.id, status: 'expired' })}
                            title="İstenen tarih geçti"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Süresi geçti
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(w)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
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
            Sayfa {page + 1} / {pageCount} · {total} kayıt
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page === 0 || listQ.isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
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
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Silme onay diyaloğu */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Bekleme kaydını sil</DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-medium text-foreground">{deleteTarget?.customerName}</span>{' '}
              ({deleteTarget ? fmtPhone(deleteTarget.customerPhone) : ''}) —{' '}
              {deleteTarget?.providerName} için{' '}
              {deleteTarget ? formatDate(deleteTarget.preferredDate) : ''}
              {deleteTarget?.preferredSlot ? ` ${deleteTarget.preferredSlot}` : ''} bekleme kaydı
              kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteEntry.isPending}
              onClick={() => deleteTarget && deleteEntry.mutate(deleteTarget.id)}
            >
              {deleteEntry.isPending ? (
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
