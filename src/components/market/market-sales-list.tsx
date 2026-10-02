'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api-client'
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
import { Receipt, Eye, Undo2, Download, Printer, Banknote, CreditCard, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime, toCSV, downloadFile } from '@/lib/format'
import { cn } from '@/lib/utils'

interface SaleItem {
  id: string
  productId: string | null
  barcode: string | null
  name: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
}

interface Sale {
  id: string
  number: string
  type: string
  status: string
  subtotal: number
  taxTotal: number
  discount: number
  total: number
  paymentMethod: string
  cashAmount: number
  cardAmount: number
  customerName: string | null
  userId: string | null
  createdAt: string
  _count?: { items: number; returns: number }
}

interface SalesResponse { items: Sale[] }
interface SaleDetail extends Sale {
  items: SaleItem[]
  returns: Array<{ id: string; reason: string; totalAmount: number; createdAt: string }>
}

const PAYMENT_META: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  cash: { label: 'Nakit', icon: Banknote, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  card: { label: 'Kart', icon: CreditCard, color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  mixed: { label: 'Karışık', icon: Wallet, color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
}

export function MarketSalesList({ marketId }: { marketId: string }) {
  const qc = useQueryClient()
  const [dateFilter, setDateFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [detailOpen, setDetailOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnItems, setReturnItems] = useState<Record<string, number>>({})
  const [returning, setReturning] = useState(false)

  const params = new URLSearchParams()
  if (dateFilter) params.set('date', dateFilter)
  if (paymentFilter !== 'all') params.set('paymentMethod', paymentFilter)
  if (typeFilter !== 'all') params.set('type', typeFilter)
  const qs = params.toString()

  const { data, isLoading } = useQuery({
    queryKey: ['market-sales', marketId, qs],
    queryFn: () => apiGet<SalesResponse>(`/api/market/${marketId}/pos/sales${qs ? `?${qs}` : ''}`),
  })

  const sales = data?.items ?? []

  const summary = useMemo(() => {
    const valid = sales.filter((s) => s.type === 'satis' && s.status === 'tamamlandi')
    const total = valid.reduce((s, x) => s + x.total, 0)
    const cash = valid.reduce((s, x) => s + x.cashAmount, 0)
    const card = valid.reduce((s, x) => s + x.cardAmount, 0)
    const returns = sales.filter((s) => s.type === 'iade').length
    return { total, cash, card, count: valid.length, returns }
  }, [sales])

  async function openDetail(sale: Sale) {
    try {
      const detail = await apiGet<SaleDetail>(`/api/market/${marketId}/pos/sales/${sale.id}`)
      setSelectedSale(detail)
      setDetailOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Detay alınamadı')
    }
  }

  function openReturn(sale: SaleDetail) {
    setReturnItems({})
    setReturnReason('')
    setReturnOpen(true)
  }

  async function submitReturn() {
    if (!selectedSale) return
    if (!returnReason.trim()) { toast.error('İade sebebi gerekli'); return }
    const items = Object.entries(returnItems)
      .filter(([, q]) => q > 0)
      .map(([saleItemId, qty]) => ({ saleItemId, qty }))
    if (items.length === 0) { toast.error('İade edilecek kalem seçin'); return }

    setReturning(true)
    try {
      await apiPost(`/api/market/${marketId}/pos/sales/${selectedSale.id}/return`, {
        reason: returnReason,
        items,
      })
      qc.invalidateQueries({ queryKey: ['market-sales', marketId] })
      setReturnOpen(false)
      setDetailOpen(false)
      toast.success('İade tamamlandı')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İade başarısız')
    } finally {
      setReturning(false)
    }
  }

  function exportCSV() {
    const rows = sales.map((s) => ({
      'Fiş No': s.number,
      'Tarih': formatDateTime(s.createdAt),
      'Tür': s.type === 'satis' ? 'Satış' : 'İade',
      'Ödeme': PAYMENT_META[s.paymentMethod]?.label ?? s.paymentMethod,
      'Ara Toplam': s.subtotal,
      'KDV': s.taxTotal,
      'İndirim': s.discount,
      'Toplam': s.total,
      'Nakit': s.cashAmount,
      'Kart': s.cardAmount,
      'Müşteri': s.customerName ?? '',
      'Kalem': s._count?.items ?? 0,
      'İade': s._count?.returns ?? 0,
    }))
    downloadFile(toCSV(rows), `satislar-${marketId}.csv`)
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <div className="space-y-4">
      {/* Özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Toplam Satış</div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{formatCurrency(summary.total)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{summary.count} fiş</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Nakit</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(summary.cash)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Banknote</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Kart</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(summary.card)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Pos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">İade</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{summary.returns}</div>
            <div className="text-xs text-muted-foreground mt-0.5">adet</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtreler */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Tarih</Label>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 w-auto mt-0.5"
            />
          </div>
          <div>
            <Label className="text-xs">Ödeme</Label>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="h-9 w-32 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="cash">Nakit</SelectItem>
                <SelectItem value="card">Kart</SelectItem>
                <SelectItem value="mixed">Karışık</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tür</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-32 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="satis">Satış</SelectItem>
                <SelectItem value="iade">İade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDateFilter(''); setPaymentFilter('all'); setTypeFilter('all') }}>
            Temizle
          </Button>
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1" />
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Satışlar tablosu */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fiş No</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Ödeme</TableHead>
                  <TableHead>Kalem</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Satış bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((s) => {
                    const meta = PAYMENT_META[s.paymentMethod] ?? PAYMENT_META.cash
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(s.total)}</TableCell>
                        <TableCell>
                          <Badge className={cn('gap-1', meta.color)} variant="secondary">
                            <meta.icon className="w-3 h-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{s._count?.items ?? 0}</TableCell>
                        <TableCell>
                          {s.type === 'iade' ? (
                            <Badge variant="destructive">İade</Badge>
                          ) : s._count?.returns ? (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">Kısmi İade</Badge>
                          ) : (
                            <Badge variant="outline">Satış</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(s)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
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

      {/* Detay dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-600" />
              {selectedSale?.number}
            </DialogTitle>
            <DialogDescription>
              {selectedSale && formatDateTime(selectedSale.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-3">
              <div className="print-content">
                <div className="font-mono text-xs space-y-2 p-4 bg-muted/30 border rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ara Toplam</span>
                    <span>{formatCurrency(selectedSale.subtotal)}</span>
                  </div>
                  {selectedSale.discount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">İndirim</span>
                      <span>-{formatCurrency(selectedSale.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">KDV</span>
                    <span>{formatCurrency(selectedSale.taxTotal)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>TOPLAM</span>
                    <span>{formatCurrency(selectedSale.total)}</span>
                  </div>
                  <div className="border-t pt-1 mt-1">
                    {selectedSale.items.map((it) => (
                      <div key={it.id} className="flex justify-between text-xs">
                        <span className="flex-1 truncate">{it.name} × {it.qty}</span>
                        <span className="ml-2">{formatCurrency(it.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {selectedSale.returns.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
                  <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">İade Geçmişi</div>
                  {selectedSale.returns.map((r) => (
                    <div key={r.id} className="text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)} — {r.reason} ({formatCurrency(r.totalAmount)})
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter className="print:hidden">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-1" />
                  Yazdır
                </Button>
                {selectedSale.type === 'satis' && (
                  <Button
                    variant="outline"
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => openReturn(selectedSale)}
                  >
                    <Undo2 className="w-4 h-4 mr-1" />
                    İade
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Kapat</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* İade dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-amber-600" />
              Satış İadesi — {selectedSale?.number}
            </DialogTitle>
            <DialogDescription>İade edilecek kalemleri seçin</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scroll">
              {selectedSale?.items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 p-2 rounded border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.qty} adet × {formatCurrency(it.unitPrice)} = {formatCurrency(it.lineTotal)}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={it.qty}
                    placeholder="0"
                    className="w-20 h-8"
                    value={returnItems[it.id] ?? ''}
                    onChange={(e) => {
                      const v = Math.min(parseInt(e.target.value) || 0, it.qty)
                      setReturnItems((p) => ({ ...p, [it.id]: v }))
                    }}
                  />
                </div>
              ))}
            </div>
            <div>
              <Label>İade Sebebi</Label>
              <Textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Örn: Müşteri memnuniyetsizliği, bozuk ürün..."
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>İptal</Button>
            <Button onClick={submitReturn} disabled={returning} className="bg-amber-600 hover:bg-amber-700">
              {returning ? 'İade ediliyor...' : 'İade Et'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
