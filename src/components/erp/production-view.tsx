'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import type { SessionUser } from '@/types'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  ClipboardCheck, CheckCircle2, Package, RefreshCw, Factory,
  Clock, Check, Search, AlertCircle, Building2, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'

// ============================================================
// Tipler
// ============================================================

interface ProductionItem {
  id: string
  tenantId: string
  orderId: string
  orderNumber: string | null
  customerId: string | null
  customerName: string | null
  productId: string | null
  productName: string | null
  productPhoto: string | null
  description: string
  qty: number
  status: string
  producedAt: string | null
  producedBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface ProductionListResponse {
  items: ProductionItem[]
  total: number
  limit: number
  offset: number
}

// ============================================================
// Durum yardımcıları
// ============================================================

const STATUS_BADGES: Record<string, { color: string; label: string; icon: typeof Clock }> = {
  bekliyor: { color: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/50', label: 'Bekliyor', icon: Clock },
  uretiliyor: { color: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-950/40 dark:border-sky-900/50', label: 'Üretiliyor', icon: RefreshCw },
  uretildi: { color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/50', label: 'Üretildi', icon: CheckCircle2 },
}

function getStatusMeta(status: string) {
  return STATUS_BADGES[status] ?? STATUS_BADGES.bekliyor
}

// ============================================================
// Üretim Listesi View
// ============================================================

export function ProductionView() {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<string>('bekliyor')
  const [search, setSearch] = useState('')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [marking, setMarking] = useState(false)

  const canManage = hasPermission(user as SessionUser | null, 'production.manage')

  // Tümünü çek — sekmeleri ve sayaçları client-side filtrele.
  // Tek kaynak: 1 sorgu, 1 cache key.
  const { data, isLoading } = useQuery({
    queryKey: ['production'],
    queryFn: () => apiGet<ProductionListResponse>('/api/production'),
    refetchInterval: 30_000,
  })

  const allItems = data?.items ?? []

  // Sekme bazında filtre
  const items = useMemo(() => {
    let list = allItems
    if (tab !== 'tumu') {
      list = list.filter((it) => it.status === tab)
    }
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (it) =>
        it.description?.toLowerCase().includes(q) ||
        it.productName?.toLowerCase().includes(q) ||
        it.customerName?.toLowerCase().includes(q) ||
        it.orderNumber?.toLowerCase().includes(q),
    )
  }, [allItems, tab, search])

  // Özet sayaçlar — tüm veriden türet
  const counts = useMemo(() => {
    return {
      bekliyor: allItems.filter((i) => i.status === 'bekliyor').length,
      uretiliyor: allItems.filter((i) => i.status === 'uretiliyor').length,
      uretildi: allItems.filter((i) => i.status === 'uretildi').length,
      total: allItems.length,
    }
  }, [allItems])

  const handleMarkProduced = async () => {
    if (!markingId) return
    setMarking(true)
    try {
      await apiPatch(`/api/production/${markingId}`, { status: 'uretildi' })
      toast.success('Kalem üretildi olarak işaretlendi')
      qc.invalidateQueries({ queryKey: ['production'] })
      setMarkingId(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setMarking(false)
    }
  }

  const handleRevert = async (id: string) => {
    try {
      await apiPatch(`/api/production/${id}`, { status: 'uretiliyor' })
      toast.success('Kalem tekrar üretime alındı')
      qc.invalidateQueries({ queryKey: ['production'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Factory className="w-6 h-6 text-emerald-600" />
            Üretim Listesi
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sipariş kalemlerinin üretim takibi · <span className="text-amber-700 dark:text-amber-400 font-medium">Fiyat bilgisi gösterilmez</span>
          </p>
        </div>

        {/* Özet kartları */}
        <div className="flex flex-wrap gap-2">
          <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40">
            <CardContent className="p-2.5 min-w-[80px]">
              <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Bekliyor</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{counts.bekliyor}</div>
            </CardContent>
          </Card>
          <Card className="bg-sky-50/50 dark:bg-sky-950/20 border-sky-200/60 dark:border-sky-900/40">
            <CardContent className="p-2.5 min-w-[80px]">
              <div className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400">Üretiliyor</div>
              <div className="text-lg font-bold text-sky-700 dark:text-sky-400">{counts.uretiliyor}</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40">
            <CardContent className="p-2.5 min-w-[80px]">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Üretildi</div>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{counts.uretildi}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filtre + Arama */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-4 w-full sm:w-auto">
                <TabsTrigger value="bekliyor" className="text-xs">Bekliyor</TabsTrigger>
                <TabsTrigger value="uretiliyor" className="text-xs">Üretiyor</TabsTrigger>
                <TabsTrigger value="uretildi" className="text-xs">Üretildi</TabsTrigger>
                <TabsTrigger value="tumu" className="text-xs">Tümü</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün, müşteri veya sipariş no ara..."
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tablo */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
              <ClipboardCheck className="w-8 h-8 text-emerald-600/70" />
            </div>
            <h3 className="font-semibold text-lg">Üretim bekleyen kalem yok</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {tab === 'tumu'
                ? 'Henüz hiç üretim kalemi oluşturulmamış. Siparişler üretim aşamasına geçtiğinde kalemler burada listelenir.'
                : 'Bu filtrede gösterilecek kalem yok.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scroll">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 border-b-2 hover:bg-muted/60">
                  <TableHead className="pl-4 min-w-[220px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Ürün</TableHead>
                  <TableHead className="hidden md:table-cell min-w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Müşteri</TableHead>
                  <TableHead className="hidden sm:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Sipariş No</TableHead>
                  <TableHead className="text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground">Miktar</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
                  <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Üretim Tarihi</TableHead>
                  <TableHead className="text-right pr-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const meta = getStatusMeta(it.status)
                  const Icon = meta.icon
                  return (
                    <TableRow key={it.id} className={cn('even:bg-muted/20 hover:bg-muted/30 transition-colors')}>
                      <TableCell className="pl-4">
                        <div className="flex items-start gap-3">
                          {it.productPhoto ? (
                             
                            <img
                              src={it.productPhoto}
                              alt={it.productName || it.description}
                              className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate max-w-[200px]">
                              {it.productName || it.description || 'Ürün'}
                            </div>
                            {(it.productName && it.description && it.productName !== it.description) && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                                {it.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {it.customerName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            <span className="truncate max-w-[140px]">{it.customerName}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm font-mono">
                        {it.orderNumber || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-bold tabular-nums">{it.qty}</span>
                        <span className="text-xs text-muted-foreground ml-1">adet</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px] h-6 gap-1', meta.color)}>
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {it.producedAt ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {formatDateTime(it.producedAt)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && it.status !== 'uretildi' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-8 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => setMarkingId(it.id)}
                                >
                                  <Check className="w-3.5 h-3.5 mr-1" />
                                  Üretildi
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Üretildi olarak işaretle</TooltipContent>
                            </Tooltip>
                          )}
                          {canManage && it.status === 'uretildi' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() => handleRevert(it.id)}
                                >
                                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                                  Geri Al
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Tekrar üretime al</TooltipContent>
                            </Tooltip>
                          )}
                          {!canManage && (
                            <span className="text-xs text-muted-foreground italic">salt okunur</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Bilgi notu — rep rolü için */}
      {user?.role === 'rep' && (
        <Card className="bg-sky-50/50 dark:bg-sky-950/20 border-sky-200/60 dark:border-sky-900/40">
          <CardContent className="p-3">
            <div className="flex items-start gap-2 text-xs text-sky-800 dark:text-sky-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Üretim Durumu:</strong> Yalnızca kendi müşterilerinizin siparişlerinden gelen üretim kalemlerini görüyorsunuz.
                Bir kalem üretildiğinde burada yeşil işaret görünür.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bilgi notu — stock rolü için */}
      {user?.role === 'stock' && (
        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40">
          <CardContent className="p-3">
            <div className="flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
              <User className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Depo Sorumlusu:</strong> Tüm siparişlerin üretim kalemlerini görüyorsunuz.
                Üretilen kalemleri işaretleyebilirsiniz. Fiyat bilgisi gösterilmez.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Üretildi onay dialoğu */}
      <AlertDialog open={!!markingId} onOpenChange={(o) => !o && setMarkingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Üretildi olarak işaretle?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bu kalem üretilendi olarak işaretlenecek ve üretim tarihi otomatik kaydedilecek.
              Bu işlemi geri alabilirsiniz (kalem tekrar üretime alınır).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={marking}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleMarkProduced()
              }}
              disabled={marking}
              className="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600"
            >
              {marking && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
              Evet, Üretildi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
