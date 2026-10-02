'use client'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Truck, Plus, ScanLine, Check, X, ArrowRight, Trash2,
  Package, FileText, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime, formatCurrency } from '@/lib/format'

interface PurchaseItem {
  id: string
  productId: string | null
  barcode: string | null
  name: string
  qty: number
  unitPrice: number
  lineTotal: number
  accepted: boolean
  product?: { id: string; name: string; sku: string | null; stock: number } | null
}

interface Purchase {
  id: string
  number: string
  supplier: string | null
  invoiceNo: string | null
  status: string
  totalAmount: number
  notes: string | null
  createdAt: string
  items?: PurchaseItem[]
  _count?: { items: number }
}

interface PurchasesResponse { items: Purchase[] }

interface LookupResponse {
  found: boolean
  product: { id: string; name: string; price: number; sku: string | null } | null
  barcode: { id: string; code: string } | null
}

interface NewItem {
  barcode: string
  productId: string | null
  name: string
  qty: number
  unitPrice: number
}

export function MarketPurchase({ marketId }: { marketId: string }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Purchase | null>(null)
  const [supplier, setSupplier] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [newItems, setNewItems] = useState<NewItem[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [accepting, setAccepting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['market-purchases', marketId],
    queryFn: () => apiGet<PurchasesResponse>(`/api/market/${marketId}/purchases`),
  })

  const purchases = data?.items ?? []

  const { data: detailData } = useQuery({
    queryKey: ['market-purchase', marketId, selected?.id],
    queryFn: () => apiGet<Purchase>(`/api/market/${marketId}/purchases/${selected!.id}`),
    enabled: !!selected,
  })

  const detail = detailData

  const total = newItems.reduce((s, x) => s + x.qty * x.unitPrice, 0)

  async function lookupAndAdd(code: string) {
    if (!code.trim()) return
    try {
      const res = await apiPost<LookupResponse>(`/api/market/${marketId}/barcodes/lookup`, { code })
      if (res.found && res.product) {
        setNewItems((prev) => [
          ...prev,
          {
            barcode: res.barcode?.code ?? code,
            productId: res.product.id,
            name: res.product.name,
            qty: 1,
            unitPrice: res.product.price,
          },
        ])
        setBarcodeInput('')
        toast.success(`${res.product.name} eklendi`)
      } else {
        // Barkod bulunamadı: manuel ekle
        setNewItems((prev) => [
          ...prev,
          { barcode: code, productId: null, name: '', qty: 1, unitPrice: 0 },
        ])
        setBarcodeInput('')
        toast.error('Barkod bulunamadı, manuel giriş gerekli')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Arama başarısız')
    }
  }

  function updateItem(idx: number, patch: Partial<NewItem>) {
    setNewItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function removeItem(idx: number) {
    setNewItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function createPurchase() {
    if (newItems.length === 0) { toast.error('En az bir kalem gerekli'); return }
    setCreating(true)
    try {
      const created = await apiPost<Purchase>(`/api/market/${marketId}/purchases`, {
        supplier: supplier || undefined,
        invoiceNo: invoiceNo || undefined,
        notes: notes || undefined,
        items: newItems.map((it) => ({
          barcode: it.barcode || undefined,
          productId: it.productId || undefined,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })),
      })
      qc.invalidateQueries({ queryKey: ['market-purchases', marketId] })
      setCreateOpen(false)
      setSupplier('')
      setInvoiceNo('')
      setNotes('')
      setNewItems([])
      toast.success(`Mal kabul oluşturuldu: ${created.number}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  async function acceptPurchase() {
    if (!selected) return
    setAccepting(true)
    try {
      await apiPatch(`/api/market/${marketId}/purchases/${selected.id}`, { action: 'accept' })
      qc.invalidateQueries({ queryKey: ['market-purchases', marketId] })
      qc.invalidateQueries({ queryKey: ['market-purchase', marketId, selected.id] })
      qc.invalidateQueries({ queryKey: ['market-barcodes', marketId] })
      toast.success('Mal kabul edildi, stok güncellendi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kabul edilemedi')
    } finally {
      setAccepting(false)
    }
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  // Detay görünümü
  if (selected) {
    const detailItems = detail?.items ?? []
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{selected.number}</h3>
                  <Badge variant={selected.status === 'kabul_edildi' ? 'default' : selected.status === 'reddedildi' ? 'destructive' : 'secondary'}
                    className={selected.status === 'kabul_edildi' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : ''}>
                    {selected.status === 'kabul_edildi' ? 'Kabul Edildi' : selected.status === 'reddedildi' ? 'Reddedildi' : 'Bekliyor'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div>{formatDateTime(selected.createdAt)}</div>
                  {selected.supplier && <div>Tedarikçi: {selected.supplier}</div>}
                  {selected.invoiceNo && <div>İrsaliye: {selected.invoiceNo}</div>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                  <X className="w-3.5 h-3.5 mr-1" />
                  Geri
                </Button>
                {selected.status === 'bekliyor' && (
                  <Button size="sm" onClick={acceptPurchase} disabled={accepting} className="bg-emerald-600 hover:bg-emerald-700">
                    <Check className="w-3.5 h-3.5 mr-1" />
                    {accepting ? 'Kabul ediliyor...' : 'Kabul Et (Stok Artır)'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Barkod</TableHead>
                  <TableHead className="text-right">Miktar</TableHead>
                  <TableHead className="text-right">Birim Fiyat</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead className="text-center">Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailItems.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{it.name}</div>
                      {it.product && (
                        <div className="text-xs text-muted-foreground">SKU: {it.product.sku ?? '—'}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {it.barcode ? <Badge variant="outline" className="font-mono text-xs">{it.barcode}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-right">{it.qty}</TableCell>
                    <TableCell className="text-right">{formatCurrency(it.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(it.lineTotal)}</TableCell>
                    <TableCell className="text-center">
                      {it.accepted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground mx-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">Toplam:</TableCell>
                  <TableCell className="text-right font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(selected.totalAmount)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Mal Kabul</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tedarikçiden gelen ürünleri barkod ile kabul edin. Kabul edildiğinde stok otomatik artar.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1" />
            Yeni Mal Kabul
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tedarikçi</TableHead>
                  <TableHead>İrsaliye</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Henüz mal kabul yok
                    </TableCell>
                  </TableRow>
                ) : (
                  purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.number}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(p.createdAt)}</TableCell>
                      <TableCell className="text-sm">{p.supplier ?? '—'}</TableCell>
                      <TableCell className="text-sm">{p.invoiceNo ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === 'kabul_edildi' ? 'default' : p.status === 'reddedildi' ? 'destructive' : 'secondary'}
                          className={p.status === 'kabul_edildi' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : ''}>
                          {p.status === 'kabul_edildi' ? 'Kabul Edildi' : p.status === 'reddedildi' ? 'Reddedildi' : 'Bekliyor'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(p.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(p)}>
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

      {/* Yeni mal kabul dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" />
              Yeni Mal Kabul
            </DialogTitle>
            <DialogDescription>
              Tedarikçi bilgisi ve ürünleri girin. Kabul ettiğinizde stok otomatik artar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tedarikçi</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Tedarikçi adı" className="mt-1" />
              </div>
              <div>
                <Label>İrsaliye / Fatura No</Label>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Örn: IRS-2024-001" className="mt-1" />
              </div>
            </div>

            {/* Barkod ile ürün ekle */}
            <div>
              <Label>Ürün Ekle (Barkod ile)</Label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                  <Input
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupAndAdd(barcodeInput) } }}
                    placeholder="Barkod okutun ve Enter'a basın..."
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => lookupAndAdd(barcodeInput)} className="bg-emerald-600 hover:bg-emerald-700">
                  Ekle
                </Button>
              </div>
            </div>

            {/* Kalemler */}
            {newItems.length > 0 && (
              <div className="border rounded-lg">
                <ScrollArea className="max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="w-24">Miktar</TableHead>
                        <TableHead className="w-32">Birim Fiyat</TableHead>
                        <TableHead className="w-28 text-right">Tutar</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newItems.map((it, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input
                              value={it.name}
                              onChange={(e) => updateItem(idx, { name: e.target.value })}
                              placeholder="Ürün adı"
                              className="h-8"
                              disabled={!!it.productId}
                            />
                            <div className="text-xs text-muted-foreground mt-0.5">{it.barcode}</div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={it.qty || ''}
                              onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 0 })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={it.unitPrice || ''}
                              onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {formatCurrency(it.qty * it.unitPrice)}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                <div className="p-2 border-t flex justify-between text-sm">
                  <span className="text-muted-foreground">Toplam: {newItems.length} kalem</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            <div>
              <Label>Notlar</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opsiyonel..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button onClick={createPurchase} disabled={creating || newItems.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {creating ? 'Oluşturuluyor...' : 'Mal Kabul Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
