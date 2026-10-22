'use client'

// ============================================================
// ADMIN PANEL — Üyeler sekmesi
// GNC Randevu uç kullanıcı üyelikleri (Member) yönetimi:
// · arama (ad / telefon — sunucu tarafı, debounce'lu)
// · tablo: ad, telefon, kayıt tarihi, randevu sayısı
// · satır aksiyonu "Sil" → confirm diyaloğu + toast
//   (silme üyeyi + randevularını birlikte siler — cascade)
// Kapsam: superadmin platform geneli · admin kendi tenant'ının üyeleri
// ============================================================

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet } from '@/lib/api-client'
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
  UserRound, Search, RefreshCw, Loader2, Trash2, CalendarClock, ChevronLeft, ChevronRight,
} from 'lucide-react'

interface MemberListItem {
  id: string
  name: string
  phone: string
  email: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  appointmentCount: number
}

interface MembersResponse {
  items: MemberListItem[]
  total: number
  limit: number
  offset: number
}

const PAGE_SIZE = 20

/** 905327777777 → "0532 777 77 77" (görüntü amaçlı; beklenmedik biçimde ham döner) */
function formatMemberPhone(phone: string): string {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('90')) {
    const sub = d.slice(2) // 5XXXXXXXXX
    return `0${sub.slice(0, 3)} ${sub.slice(3, 6)} ${sub.slice(6, 8)} ${sub.slice(8, 10)}`
  }
  if (d.length === 11 && d.startsWith('0')) {
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`
  }
  return phone
}

export function MembersTab() {
  const qc = useQueryClient()

  // Arama: yazarken 350ms debounce ile sunucuya gönderilir
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0) // 0 tabanlı
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const listQ = useQuery({
    queryKey: ['admin-members', q, page],
    queryFn: () =>
      apiGet<MembersResponse>(
        `/api/admin/members?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      ),
  })

  const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null)

  const deleteMember = useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ ok: boolean; deletedMember: string; deletedAppointments: number }>(
        `/api/admin/members?id=${encodeURIComponent(id)}`,
      ),
    onSuccess: (res) => {
      toast.success(
        res.deletedAppointments > 0
          ? `Üye silindi · ${res.deletedAppointments} randevu da silindi`
          : 'Üye silindi',
      )
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['admin-members'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const items = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <UserRound className="w-4 h-4 text-emerald-600" />
                Üyeler
              </CardTitle>
              <CardDescription className="text-xs">
                GNC Randevu müşteri üyelikleri · {total} kayıt
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-44 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Ad veya telefon ara..."
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
              Üyeler yüklenemedi: {(listQ.error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                <UserRound className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                {q ? 'Aramaya uyan üye bulunamadı.' : 'Henüz kayıtlı üye yok.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ad Soyad</TableHead>
                  <TableHead className="text-xs">Telefon</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">E-posta</TableHead>
                  <TableHead className="text-xs">Kayıt Tarihi</TableHead>
                  <TableHead className="text-xs text-center">Randevu</TableHead>
                  <TableHead className="text-xs text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm font-medium">
                      <span className="flex items-center gap-1.5">
                        {m.name}
                        {!m.isActive && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            pasif
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatMemberPhone(m.phone)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-[180px] truncate">
                      {m.email || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(m.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={m.appointmentCount > 0 ? 'default' : 'secondary'}
                        className="text-[11px] gap-1"
                      >
                        <CalendarClock className="w-3 h-3" />
                        {m.appointmentCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(m)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Sil
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sayfalama */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            Sayfa {page + 1} / {pageCount} · {total} üye
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page === 0 || listQ.isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page + 1 >= pageCount || listQ.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Silme onay diyaloğu */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Üyeyi sil</DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{' '}
              ({deleteTarget ? formatMemberPhone(deleteTarget.phone) : ''}) kalıcı olarak
              silinecek. Bu üyeye bağlı{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.appointmentCount ?? 0} randevu
              </span>{' '}
              da (iptal edilenler dahil) birlikte silinir. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMember.isPending}
              onClick={() => deleteTarget && deleteMember.mutate(deleteTarget.id)}
            >
              {deleteMember.isPending ? (
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
