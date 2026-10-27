'use client'

// ============================================================
// ADMIN PANEL — Damga Kartları sekmesi
// Klasik sadakat kartı ("N hizmet al → 1 ücretsiz"):
// · üstte işletme ayarı formu: işletme seçimi + damga sayısı
//   (3-30) + ödül açıklaması + aktif toggle + kaydet (upsert)
// · altta kart tablosu: üye (isim+telefon), damga N/M göstergesi,
//   ödül sayısı, son damga zamanı
// · satır aksiyonları: +1 Damga / Ödül Ver / Sıfırla
// Damga, randevu 'tamamlandi' olduğunda da otomatik basılır —
// bu ekran manuel müdahale (kaçırılan damga, manuel ödül) için.
// Kapsam: superadmin platform geneli · admin kendi tenant'ının
// işletmeleri (provider.tenantId üzerinden)
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatDate } from '@/lib/format'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Stamp, Search, RefreshCw, Loader2, PlusCircle, Gift, RotateCcw, ChevronLeft, ChevronRight,
} from 'lucide-react'

interface StampCardItem {
  id: string
  providerId: string
  providerName: string
  memberId: string
  memberName: string
  memberPhone: string // 905XXXXXXXXX
  stamps: number
  redeemedCount: number
  lastStampAt: string | null
  updatedAt: string
}

interface StampCardProvider {
  id: string
  name: string
  hasSetting: boolean
  requiredStamps: number | null
  rewardDescription: string | null
  isActive: boolean | null
}

interface StampCardResponse {
  items: StampCardItem[]
  settings: {
    id: string; providerId: string; providerName: string
    requiredStamps: number; rewardDescription: string; isActive: boolean; updatedAt: string
  }[]
  providers: StampCardProvider[]
  total: number
  page: number
  pageSize: number
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

export function StampCardTab() {
  const qc = useQueryClient()

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0) // 0 tabanlı

  // ayar formu durumu
  const [formProviderId, setFormProviderId] = useState('')
  const [formStamps, setFormStamps] = useState('10')
  const [formReward, setFormReward] = useState('')
  const [formActive, setFormActive] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const PAGE_SIZE = 20
  const listQ = useQuery({
    queryKey: ['admin-stampcard', q, page],
    queryFn: () =>
      apiGet<StampCardResponse>(
        `/api/admin/stampcard?q=${encodeURIComponent(q)}&page=${page + 1}`,
      ),
  })

  // ---- form: işletme seçilince mevcut ayarı yükle
  const providers = listQ.data?.providers ?? []
  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === formProviderId) ?? null,
    [providers, formProviderId],
  )

  useEffect(() => {
    if (!selectedProvider) return
    setFormStamps(String(selectedProvider.requiredStamps ?? 10))
    setFormReward(selectedProvider.rewardDescription ?? '')
    setFormActive(selectedProvider.isActive ?? true)
  }, [formProviderId]) // yalnız seçim değişiminde yükle (kullanıcı düzenlemesini ezmesin)

  // ilk yüklemede tek işletme varsa otomatik seç
  useEffect(() => {
    if (!formProviderId && providers.length === 1) setFormProviderId(providers[0].id)
  }, [providers, formProviderId])

  const saveSetting = useMutation({
    mutationFn: () => {
      const stamps = Number(formStamps)
      if (!formProviderId) throw new Error('Önce bir işletme seçin.')
      if (!Number.isInteger(stamps) || stamps < 3 || stamps > 30) {
        throw new Error('Damga sayısı 3 ile 30 arasında olmalı.')
      }
      if (!formReward.trim()) throw new Error('Ödül açıklaması gerekli.')
      if (formReward.trim().length > 200) throw new Error('Ödül açıklaması en fazla 200 karakter olabilir.')
      return apiPost<{ ok: boolean }>('/api/admin/stampcard', {
        providerId: formProviderId,
        requiredStamps: stamps,
        rewardDescription: formReward.trim(),
        isActive: formActive,
      })
    },
    onSuccess: () => {
      toast.success('Damga kartı ayarı kaydedildi')
      qc.invalidateQueries({ queryKey: ['admin-stampcard'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const cardAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'add_stamp' | 'redeem' | 'reset' }) =>
      apiPatch<{ ok: boolean; rewardWon: boolean; message: string }>(
        `/api/admin/stampcard/${encodeURIComponent(id)}`,
        { action },
      ),
    onSuccess: (res) => {
      if (res.rewardWon) toast.success(res.message)
      else toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['admin-stampcard'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const items = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const activeSettings = (listQ.data?.settings ?? []).filter((s) => s.isActive)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // kart satırı için gerekli damga sayısı — ayar yoksa "—"
  const requiredByProvider = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of listQ.data?.settings ?? []) m.set(s.providerId, s.requiredStamps)
    return m
  }, [listQ.data])

  return (
    <div className="space-y-4">
      {/* ---- işletme ayarı formu ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Stamp className="w-4 h-4 text-amber-500" />
            Damga Kartı Programı Ayarı
          </CardTitle>
          <CardDescription className="text-xs">
            &quot;N hizmet al → 1 ücretsiz&quot; sadakat programı — randevu tamamlandığında damga otomatik basılır
            {activeSettings.length > 0 && (
              <> · <span className="text-emerald-600 font-medium">{activeSettings.length} işletmede aktif</span></>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Kapsamında randevu işletmesi bulunmuyor — damga kartı ayarı oluşturulamaz.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4">
                <label className="text-xs font-medium text-muted-foreground block mb-1" htmlFor="sc-provider">
                  İşletme
                </label>
                <select
                  id="sc-provider"
                  value={formProviderId}
                  onChange={(e) => setFormProviderId(e.target.value)}
                  className="h-8 w-full text-xs rounded-md border border-input bg-background px-2"
                >
                  <option value="">İşletme seçin…</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.hasSetting ? (p.isActive ? ' ✓' : ' (pasif)') : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1" htmlFor="sc-stamps">
                  Ödül için damga
                </label>
                <Input
                  id="sc-stamps"
                  type="number"
                  min={3}
                  max={30}
                  value={formStamps}
                  onChange={(e) => setFormStamps(e.target.value)}
                  className="h-8 text-xs"
                  aria-describedby="sc-stamps-hint"
                />
                <p id="sc-stamps-hint" className="text-[10px] text-muted-foreground mt-0.5">3 – 30 arası</p>
              </div>
              <div className="sm:col-span-4">
                <label className="text-xs font-medium text-muted-foreground block mb-1" htmlFor="sc-reward">
                  Ödül açıklaması
                </label>
                <Input
                  id="sc-reward"
                  value={formReward}
                  onChange={(e) => setFormReward(e.target.value)}
                  placeholder='örn. "Ücretsiz saç kesimi"'
                  maxLength={200}
                  className="h-8 text-xs"
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 pb-0.5">
                <Switch
                  checked={formActive}
                  onCheckedChange={setFormActive}
                  aria-label="Damga programı aktif"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <div className="sm:col-span-12">
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!formProviderId || saveSetting.isPending}
                  onClick={() => saveSetting.mutate()}
                >
                  {saveSetting.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Stamp className="w-3.5 h-3.5 mr-1" />
                  )}
                  {selectedProvider?.hasSetting ? 'Ayarı Güncelle' : 'Programı Oluştur'}
                </Button>
                {selectedProvider?.hasSetting && (
                  <span className="text-[11px] text-muted-foreground ml-2">
                    {selectedProvider.name} için mevcut ayar yüklendi
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- kart tablosu ---- */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Stamp className="w-4 h-4 text-amber-500" />
                Üye Kartları
                {total > 0 && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white">
                    {total} kart
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Tamamlanan randevularda damga otomatik basılır — buradan manuel düzeltme yapabilirsiniz · {total} kayıt
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-44 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Üye, telefon veya işletme ara..."
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
              Damga kartları yüklenemedi: {(listQ.error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                <Stamp className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                {q
                  ? 'Aramaya uyan damga kartı bulunamadı.'
                  : 'Henüz damga kartı yok — üyeler hizmet aldıkça kartlar burada listelenir.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">İşletme</TableHead>
                  <TableHead className="text-xs">Üye</TableHead>
                  <TableHead className="text-xs">Damga</TableHead>
                  <TableHead className="text-xs">Ödül</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Son Damga</TableHead>
                  <TableHead className="text-xs text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => {
                  const req = requiredByProvider.get(c.providerId) ?? null
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm font-medium max-w-[150px] truncate">
                        {c.providerName}
                      </TableCell>
                      <TableCell className="text-sm max-w-[170px]">
                        <div className="font-medium truncate">{c.memberName}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {fmtPhone(c.memberPhone)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className="font-bold text-amber-600 tabular-nums">{c.stamps}</span>
                        <span className="text-muted-foreground"> / {req ?? '—'}</span>
                        {req !== null && (
                          <span className="inline-flex gap-0.5 ml-1.5 align-middle" aria-hidden="true">
                            {Array.from({ length: Math.min(req, 10) }).map((_, i) => (
                              <span
                                key={i}
                                className={`inline-block w-1.5 h-1.5 rounded-full ${
                                  i < Math.min(c.stamps, 10) ? 'bg-amber-500' : 'bg-stone-300 dark:bg-stone-700'
                                }`}
                              />
                            ))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.redeemedCount > 0 ? (
                          <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                            🏆 {c.redeemedCount} kazandı
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {c.lastStampAt ? formatDate(c.lastStampAt) : '—'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          title="Manuel damga ekle"
                          disabled={cardAction.isPending}
                          onClick={() => cardAction.mutate({ id: c.id, action: 'add_stamp' })}
                        >
                          <PlusCircle className="w-3.5 h-3.5 mr-1" />
                          +1 Damga
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          title="Ödülü teslim edildi olarak işaretle — kart sıfırlanır"
                          disabled={cardAction.isPending}
                          onClick={() => cardAction.mutate({ id: c.id, action: 'redeem' })}
                        >
                          <Gift className="w-3.5 h-3.5 mr-1" />
                          Ödül Ver
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-stone-600 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900/40"
                          title="Damgaları sıfırla (ödül sayısı korunur)"
                          disabled={cardAction.isPending}
                          onClick={() => cardAction.mutate({ id: c.id, action: 'reset' })}
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          Sıfırla
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
    </div>
  )
}
