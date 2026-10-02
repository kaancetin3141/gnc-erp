'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ClipboardCheck, Plus, Check, X, ArrowRight, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime, formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

interface StockCountItem {
  id: string
  productId: string
  expectedQty: number
  countedQty: number | null
  difference: number | null
  notes: string | null
  product: { id: string; name: string; sku: string | null; stock: number; category: string | null; price: number }
}

interface StockCount {
  id: string
  number: string
  status: string
  startDate: string
  endDate: string | null
  notes: string | null
  createdAt: string
  items?: StockCountItem[]
  _count?: { items: number }
}

interface CountsResponse { items: StockCount[] }

export function MarketStockCount({ marketId }: { marketId: string }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<StockCount | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['market-stock-counts', marketId],
    queryFn: () => apiGet<CountsResponse>(`/api/market/${marketId}/stock-counts`),
  })

  const counts = data?.items ?? []

  const { data: detailData } = useQuery({
    queryKey: ['market-stock-count', marketId, selected?.id],
    queryFn: () => apiGet<StockCount>(`/api/market/${marketId}/stock-counts/${selected!.id}`),
    enabled: !!selected,
  })

  const detailItems = detailData?.items ?? []

  const filteredItems = useMemo(() => {
    if (!search) return detailItems
    const q = search.toLowerCase()
    return detailItems.filter((it) =>
      it.product.name.toLowerCase().includes(q) ||
      (it.product.sku ?? '').toLowerCase().includes(q),
    )
  }, [detailItems, search])

  const summary = useMemo(() => {
    const counted = detailItems.filter((i) => i.countedQty !== null)
    const diffs = counted.filter((i) => (i.difference ?? (i.countedQty! - i.expectedQty)) !== 0)
    const totalDiff = counted.reduce((s, i) => s + ((i.countedQty! - i.expectedQty) * i.product.price), 0)
    return { total: detailItems.length, counted: counted.length, diffs: diffs.length, totalDiff }
  }, [detailItems])

  async function createCount() {
    setCreating(true)
    try {
      const created = await apiPost<StockCount>(`/api/market/${marketId}/stock-counts`, {})
      qc.invalidateQueries({ queryKey: ['market-stock-counts', marketId] })
      setSelected(created)
      toast.success(`Sayım oluşturuldu: ${created.number}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  async function updateItem(itemId: string, countedQty: number) {
    if (!selected) return
    try {
      await apiPatch(`/api/market/${marketId}/stock-counts/${selected.id}/items/${itemId}`, { countedQty })
      qc.invalidateQueries({ queryKey: ['market-stock-count', marketId, selected.id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  async function finalizeCount() {
    if (!selected) return
    setFinalizing(true)
    try {
      await apiPost(`/api/market/${marketId}/stock-counts/${selected.id}`, { action: 'finalize' })
      qc.invalidateQueries({ queryKey: ['market-stock-counts', marketId] })
      qc.invalidateQueries({ queryKey: ['market-stock-count', marketId, selected.id] })
      qc.invalidateQueries({ queryKey: ['market-barcodes', marketId] })
      setConfirmFinalize(false)
      toast.success('Sayım tamamlandı, stok güncellendi')
      setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tamamlanamadı')
    } finally {
      setFinalizing(false)
    }
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  // Sayım detayı görünümü
  if (selected) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{selected.number}</h3>
                  <Badge variant={selected.status === 'tamamlandi' ? 'default' : 'secondary'}
                    className={selected.status === 'tamamlandi' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : ''}>
                    {selected.status === 'tamamlandi' ? 'Tamamlandı' : selected.status === 'iptal' ? 'İptal' : 'Taslak'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Başlangıç: {formatDateTime(selected.startDate)}
                  {selected.endDate && ` · Bitiş: ${formatDateTime(selected.endDate)}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Geri
                </Button>
                {selected.status === 'taslak' && (
                  <Button
                    size="sm"
                    onClick={() => setConfirmFinalize(true)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Sayımı Tamamla
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Özet */}
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Toplam Kalem</div>
              <div className="text-xl font-bold mt-1">{summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Sayılan</div>
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{summary.counted}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Farklı</div>
              <div className="text-xl font-bold text-amber-600 mt-1">{summary.diffs}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Değer Farkı</div>
              <div className={cn('text-xl font-bold mt-1', summary.totalDiff < 0 ? 'text-red-600' : 'text-emerald-600')}>
                {formatCurrency(summary.totalDiff)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Arama */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün ara..."
            className="pl-9 h-9"
          />
        </div>

        {/* Tablo */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Beklenen</TableHead>
                    <TableHead className="text-right">Sayılan</TableHead>
                    <TableHead className="text-right">Fark</TableHead>
                    <TableHead className="text-right">Değer Farkı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((it) => {
                    const diff = it.countedQty !== null ? it.countedQty - it.expectedQty : null
                    const valueDiff = diff !== null ? diff * it.product.price : 0
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{it.product.name}</div>
                          {it.product.sku && (
                            <div className="text-xs text-muted-foreground">SKU: {it.product.sku}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{it.expectedQty}</TableCell>
                        <TableCell className="text-right">
                          {selected.status === 'tamamlandi' ? (
                            <span>{it.countedQty ?? '—'}</span>
                          ) : (
                            <Input
                              type="number"
                              value={it.countedQty ?? ''}
                              onChange={(e) => updateItem(it.id, Number(e.target.value) || 0)}
                              className="h-8 w-20 ml-auto text-right"
                              placeholder="—"
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {diff === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : diff === 0 ? (
                            <Badge variant="outline">0</Badge>
                          ) : (
                            <Badge variant={diff > 0 ? 'default' : 'destructive'}
                              className={diff > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : ''}>
                              {diff > 0 ? '+' : ''}{diff}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={cn('text-right text-xs font-medium', valueDiff < 0 ? 'text-red-600' : valueDiff > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                          {diff === null ? '—' : formatCurrency(valueDiff)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Finalize onay */}
        <Dialog open={confirmFinalize} onOpenChange={setConfirmFinalize}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sayımı Tamamla</DialogTitle>
              <DialogDescription>
                Sayım tamamlanınca, sayılan miktarlar stoğa işlenecek ve farklar için stok hareketleri oluşturulacak. Bu işlem geri alınamaz.
              </DialogDescription>
            </DialogHeader>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-sm">
              <div className="font-medium text-amber-800 dark:text-amber-400 mb-1">Özet</div>
              <div className="text-xs space-y-0.5 text-amber-700 dark:text-amber-500">
                <div>Sayılan kalem: {summary.counted} / {summary.total}</div>
                <div>Farklı kalem: {summary.diffs}</div>
                <div>Toplam değer farkı: {formatCurrency(summary.totalDiff)}</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmFinalize(false)}>İptal</Button>
              <Button onClick={finalizeCount} disabled={finalizing} className="bg-emerald-600 hover:bg-emerald-700">
                {finalizing ? 'Tamamlanıyor...' : 'Tamamla ve Stoku Güncelle'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Sayım listesi
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Stok Sayımları</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Periyodik envanter sayımı. Sayım tamamlandığında stok farkları otomatik işlenir.
            </p>
          </div>
          <Button onClick={createCount} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1" />
            Yeni Sayım
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sayı No</TableHead>
                  <TableHead>Başlangıç</TableHead>
                  <TableHead>Bitiş</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Kalem</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Henüz sayım yok
                    </TableCell>
                  </TableRow>
                ) : (
                  counts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.number}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(c.startDate)}</TableCell>
                      <TableCell className="text-xs">{c.endDate ? formatDateTime(c.endDate) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'tamamlandi' ? 'default' : 'secondary'}
                          className={c.status === 'tamamlandi' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : ''}>
                          {c.status === 'tamamlandi' ? 'Tamamlandı' : c.status === 'iptal' ? 'İptal' : 'Taslak'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">{c._count?.items ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
