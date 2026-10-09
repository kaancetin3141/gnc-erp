'use client'

import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  Package, Search, Download, Upload, AlertTriangle, Printer,
  Plus, Minus, Barcode, Tag, ArrowUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, toCSV, downloadFile } from '@/lib/format'
import { cn } from '@/lib/utils'

// Barkod + product birleşik tip (backend GET /barcodes döner)
interface BarcodeRow {
  id: string
  code: string
  type: string
  product: {
    id: string
    name: string
    sku: string | null
    price: number
    stock: number
    taxRate: number
    category: string | null
    unit: string
  }
}

interface BarcodesResponse { items: BarcodeRow[] }

export function MarketStockView({ marketId }: { marketId: string }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<BarcodeRow | null>(null)
  const [adjustType, setAdjustType] = useState<'giris' | 'cikis'>('giris')
  const [adjustQty, setAdjustQty] = useState(1)
  const [adjustReason, setAdjustReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [labelProduct, setLabelProduct] = useState<BarcodeRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['market-barcodes', marketId, search],
    queryFn: () => apiGet<BarcodesResponse>(`/api/market/${marketId}/barcodes${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  })

  const all = data?.items ?? []

  const filtered = useMemo(() => {
    let list = all
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((b) =>
        b.product.name.toLowerCase().includes(q) ||
        b.code.includes(search) ||
        (b.product.sku ?? '').toLowerCase().includes(q),
      )
    }
    if (lowOnly) {
      list = list.filter((b) => b.product.stock <= ((b.product as BarcodeRow['product'] & { minStock?: number })?.minStock ?? 5))
    }
    return list
  }, [all, search, lowOnly])

  const summary = useMemo(() => {
    const stockValue = all.reduce((s, x) => s + x.product.price * x.product.stock, 0)
    const lowCount = all.filter((b) => b.product.stock <= 5).length
    return { count: all.length, stockValue, lowCount }
  }, [all])

  function openAdjust(b: BarcodeRow) {
    setAdjustProduct(b)
    setAdjustType('giris')
    setAdjustQty(1)
    setAdjustReason('')
    setAdjustOpen(true)
  }

  async function submitAdjust() {
    if (!adjustProduct) return
    if (adjustQty <= 0) { toast.error('Miktar 0\'dan büyük olmalı'); return }
    setAdjusting(true)
    try {
      // Backend'de genel stock adjustment endpoint olmadığından, satış iadesi/mal kabul benzeri
      // bir hareket yaratmak için ürünün stock alanını güncelliyoruz.
      // Not: gerçek projede /api/products/[id]/adjust endpoint'i olmalı.
      // Şimdilik /api/products/[id]/stockmovement kullanıyoruz (varsa), yoksa doğrudan product güncelle.
      const delta = adjustType === 'giris' ? adjustQty : -adjustQty
      await apiPatch(`/api/products/${adjustProduct.product.id}/stock`, {
        delta,
        type: adjustType,
        reason: adjustReason || (adjustType === 'giris' ? 'Manuel giriş' : 'Manuel çıkış'),
      })
      qc.invalidateQueries({ queryKey: ['market-barcodes', marketId] })
      setAdjustOpen(false)
      toast.success(`Stok ${adjustType === 'giris' ? 'artırıldı' : 'azaltıldı'}`)
    } catch (e) {
      // Fallback: direkt product PATCH
      try {
        const delta = adjustType === 'giris' ? adjustQty : -adjustQty
        await apiPatch(`/api/products/${adjustProduct.product.id}`, {
          stock: adjustProduct.product.stock + delta,
        })
        qc.invalidateQueries({ queryKey: ['market-barcodes', marketId] })
        setAdjustOpen(false)
        toast.success(`Stok ${adjustType === 'giris' ? 'artırıldı' : 'azaltıldı'}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Stok güncellenemedi')
      }
    } finally {
      setAdjusting(false)
    }
  }

  function exportCSV() {
    const rows = filtered.map((b) => ({
      'Barkod': b.code,
      'Ürün': b.product.name,
      'SKU': b.product.sku ?? '',
      'Kategori': b.product.category ?? '',
      'Stok': b.product.stock,
      'Birim': b.product.unit,
      'Fiyat': b.product.price,
      'KDV': b.product.taxRate,
      'Stok Değeri': b.product.stock * b.product.price,
    }))
    downloadFile(toCSV(rows), `stok-${marketId}.csv`)
  }

  function printLabel(b: BarcodeRow) {
    setLabelProduct(b)
    setTimeout(() => window.print(), 100)
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Ürün Sayısı</div>
            <div className="text-2xl font-bold mt-1">{summary.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Stok Değeri</div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{formatCurrency(summary.stockValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Düşük Stok</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{summary.lowCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtreler */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Ara</Label>
            <div className="relative mt-0.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı, barkod veya SKU..."
                className="pl-9 h-9"
              />
            </div>
          </div>
          <Button
            variant={lowOnly ? 'default' : 'outline'}
            onClick={() => setLowOnly(!lowOnly)}
            className={cn(lowOnly && 'bg-amber-600 hover:bg-amber-700')}
            size="sm"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Düşük Stok
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-3.5 h-3.5 mr-1" />
            CSV
          </Button>
        </CardContent>
      </Card>

      {/* Tablo */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Barkod</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Fiyat</TableHead>
                  <TableHead className="text-right">Değer</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Ürün bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => {
                    const isLow = b.product.stock <= 5
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{b.product.name}</div>
                          {b.product.sku && (
                            <div className="text-xs text-muted-foreground">SKU: {b.product.sku}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{b.code}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{b.product.category ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn('font-semibold', isLow && 'text-amber-600')}>
                            {b.product.stock}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{b.product.unit}</span>
                          {isLow && <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" />}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(b.product.price)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(b.product.price * b.product.stock)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" title="Raf Etiketi" onClick={() => printLabel(b)}>
                              <Tag className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Stok Düzelt" onClick={() => openAdjust(b)}>
                              <ArrowUpDown className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Stok düzeltme dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stok Düzeltme</DialogTitle>
            <DialogDescription>
              {adjustProduct?.product.name} — Mevcut: {adjustProduct?.product.stock} {adjustProduct?.product.unit}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>İşlem Türü</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => setAdjustType('giris')}
                  className={cn(
                    'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all',
                    adjustType === 'giris'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                      : 'border-border hover:border-emerald-300',
                  )}
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">Giriş</span>
                </button>
                <button
                  onClick={() => setAdjustType('cikis')}
                  className={cn(
                    'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all',
                    adjustType === 'cikis'
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                      : 'border-border hover:border-red-300',
                  )}
                >
                  <Minus className="w-4 h-4" />
                  <span className="text-sm font-medium">Çıkış</span>
                </button>
              </div>
            </div>
            <div>
              <Label>Miktar</Label>
              <Input
                type="number"
                min="1"
                value={adjustQty || ''}
                onChange={(e) => setAdjustQty(Number(e.target.value) || 0)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label>Sebep</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Örn: Bozuk ürün, hediye, sayım farkı..."
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>İptal</Button>
            <Button
              onClick={submitAdjust}
              disabled={adjusting}
              className={adjustType === 'giris' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {adjusting ? 'Uygulanıyor...' : 'Uygula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raf etiketi (print-only) */}
      {labelProduct && (
        <div className="print-content fixed inset-0 bg-white z-50 hidden print:block">
          <div className="p-8 max-w-sm mx-auto">
            <div className="border-2 border-dashed border-black p-4 text-center">
              <div className="font-bold text-lg">{labelProduct.product.name}</div>
              <div className="font-mono text-2xl my-2">{labelProduct.code}</div>
              <div className="text-2xl font-bold text-emerald-700">{formatCurrency(labelProduct.product.price)}</div>
              <div className="text-xs text-muted-foreground mt-2">{labelProduct.product.unit}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
