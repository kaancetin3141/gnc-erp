'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Truck, Plus, Trash2, RefreshCw, Package, Scale, Box,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  Irsaliye,
} from './parts/irsaliye-types'
import type { ErpCustomer, ErpCustomerListResponse, ErpProductSimple, ErpProductListResponse, Order, OrderListResponse } from './parts/types'
import {
  CARRIERS, PALLET_TYPES, formatKg,
} from './parts/irsaliye-utils'

// ============================================================
// Form tipleri
// ============================================================
interface FormLine {
  key: string
  productId: string
  description: string
  qty: string
  unit: string
  weightPerUnit: string
  notes: string
}

function emptyLine(): FormLine {
  return {
    key: Math.random().toString(36).slice(2),
    productId: '',
    description: '',
    qty: '1',
    unit: 'adet',
    weightPerUnit: '',
    notes: '',
  }
}

function emptyForm(): {
  customerId: string
  orderId: string
  status: string
  shippingAddress: string
  carrier: string
  trackingNo: string
  palletCount: string
  palletType: string
  palletWeight: string
  notes: string
  lines: FormLine[]
} {
  return {
    customerId: '',
    orderId: '',
    status: 'taslak',
    shippingAddress: '',
    carrier: '',
    trackingNo: '',
    palletCount: '',
    palletType: '',
    palletWeight: '20',
    notes: '',
    lines: [emptyLine()],
  }
}

// ============================================================
// Form Dialog
// ============================================================

export function IrsaliyeFormDialog({
  open, onOpenChange, editIrsaliye,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editIrsaliye?: Irsaliye | null
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)

  // Müşteri listesi
  const { data: customersData } = useQuery({
    queryKey: ['customers', { limit: '100' }],
    queryFn: () => apiGet<ErpCustomerListResponse>('/api/customers?limit=100'),
    enabled: open,
  })
  const customers: ErpCustomer[] = customersData?.items ?? []

  // Ürün listesi
  const { data: productsData } = useQuery({
    queryKey: ['products', { limit: '200' }],
    queryFn: () => apiGet<ErpProductListResponse>('/api/products?limit=200'),
    enabled: open,
  })
  const products: ErpProductSimple[] = productsData?.items ?? []

  // Sipariş listesi (opsiyonel bağlantı için)
  const { data: ordersData } = useQuery({
    queryKey: ['orders', { limit: '100', depo: '1' }],
    queryFn: () => apiGet<OrderListResponse & { hidePrices?: boolean }>('/api/orders?limit=100&depo=1'),
    enabled: open,
  })
  const orders: Order[] = (ordersData?.items as Order[]) ?? []

  // Düzenleme modunda yükle
  useEffect(() => {
    if (open) {
      if (editIrsaliye) {
        setForm({
          customerId: editIrsaliye.customerId,
          orderId: editIrsaliye.orderId ?? '',
          status: editIrsaliye.status,
          shippingAddress: editIrsaliye.shippingAddress ?? '',
          carrier: editIrsaliye.carrier ?? '',
          trackingNo: editIrsaliye.trackingNo ?? '',
          palletCount: editIrsaliye.palletCount ? String(editIrsaliye.palletCount) : '',
          palletType: editIrsaliye.palletType ?? '',
          palletWeight: editIrsaliye.palletWeight ? String(editIrsaliye.palletWeight) : '20',
          notes: editIrsaliye.notes ?? '',
          lines: (editIrsaliye.lines ?? []).length > 0
            ? editIrsaliye.lines!.map((l) => ({
                key: Math.random().toString(36).slice(2),
                productId: l.productId ?? '',
                description: l.description,
                qty: String(l.qty),
                unit: l.unit,
                weightPerUnit: l.weightPerUnit ? String(l.weightPerUnit) : '',
                notes: l.notes ?? '',
              }))
            : [emptyLine()],
        })
      } else {
        setForm(emptyForm())
      }
    }
  }, [open, editIrsaliye])

  // Hesaplamalar
  const computed = useMemo(() => {
    let netWeight = 0
    const lines = form.lines.map((l) => {
      const qty = Number(l.qty) || 0
      const wpu = Number(l.weightPerUnit) || 0
      const total = qty * wpu
      netWeight += total
      return { ...l, qty, weightPerUnit: wpu, totalWeight: total }
    })
    const palletWeight = Number(form.palletWeight) || 0
    const grossWeight = netWeight + palletWeight
    return { lines, netWeight, palletWeight, grossWeight }
  }, [form])

  // Form set/get
  const setField = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: val }))
  }
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
  const removeLine = (key: string) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((l) => l.key !== key) : f.lines,
    }))
  }
  const updateLine = (key: string, patch: Partial<FormLine>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }))
  }
  const onProductSelect = (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId)
    if (product) {
      updateLine(key, {
        productId,
        description: product.name,
        unit: product.unit ?? 'adet',
      })
    } else {
      updateLine(key, { productId: '', description: '', unit: 'adet' })
    }
  }

  // Sipariş seçilince kalemleri otomatik doldur
  const onOrderSelect = async (orderId: string) => {
    setField('orderId', orderId)
    if (!orderId) return
    try {
      const detail = await apiGet<Order & { quote?: { lines?: { productId: string | null; description: string; qty: number }[] } | null; invoice?: { lines?: { productId: string | null; description: string; qty: number }[] } | null }>(`/api/orders/${orderId}`)
      const sourceLines = (detail.invoice?.lines ?? detail.quote?.lines ?? []) as { productId: string | null; description: string; qty: number }[]
      if (sourceLines.length === 0) {
        toast.info('Siparişte kalem bulunamadı')
        return
      }
      const newLines: FormLine[] = sourceLines.map((l) => ({
        key: Math.random().toString(36).slice(2),
        productId: l.productId ?? '',
        description: l.description,
        qty: String(l.qty ?? 1),
        unit: 'adet',
        weightPerUnit: '',
        notes: '',
      }))
      setForm((f) => ({ ...f, lines: newLines, customerId: detail.customerId }))
      toast.success(`${sourceLines.length} kalem otomatik eklendi`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sipariş alınamadı')
    }
  }

  // Submit
  const handleSubmit = async () => {
    if (!form.customerId) {
      toast.error('Müşteri seçin')
      return
    }
    if (form.lines.length === 0 || form.lines.every((l) => !l.description.trim())) {
      toast.error('En az bir kalem girin')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        customerId: form.customerId,
        orderId: form.orderId || null,
        status: form.status,
        shippingAddress: form.shippingAddress || null,
        carrier: form.carrier || null,
        trackingNo: form.trackingNo || null,
        palletCount: form.palletCount ? Number(form.palletCount) : null,
        palletType: form.palletType || null,
        palletWeight: Number(form.palletWeight) || 20,
        notes: form.notes || null,
        lines: form.lines
          .filter((l) => l.description.trim() || l.productId)
          .map((l) => ({
            productId: l.productId || null,
            description: l.description,
            qty: Number(l.qty) || 1,
            unit: l.unit || 'adet',
            weightPerUnit: l.weightPerUnit ? Number(l.weightPerUnit) : null,
            notes: l.notes || null,
          })),
      }

      if (editIrsaliye) {
        await apiPatch(`/api/irsaliye/${editIrsaliye.id}`, payload)
        toast.success('İrsaliye güncellendi')
      } else {
        const result = await apiPost<Irsaliye>('/api/irsaliye', payload)
        toast.success(`İrsaliye oluşturuldu: ${result.number}`)
      }
      qc.invalidateQueries({ queryKey: ['irsaliye'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-violet-600" />
            {editIrsaliye ? `İrsaliye Düzenle — ${editIrsaliye.number}` : 'Yeni İrsaliye'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Otomatik numara atanır: IRS-{new Date().getFullYear()}-XXX formatında
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Üst bilgi: Müşteri + Sipariş + Durum */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Müşteri *</Label>
              <Select
                value={form.customerId}
                onValueChange={(v) => setField('customerId', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Müşteri seçin" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sipariş (opsiyonel)</Label>
              <Select
                value={form.orderId}
                onValueChange={onOrderSelect}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Siparişten otomatik doldur" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.number} — {o.customer?.name ?? '?'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Durum</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setField('status', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="taslak">Taslak</SelectItem>
                  <SelectItem value="hazir">Hazır</SelectItem>
                  <SelectItem value="sevk_edildi">Sevk Edildi</SelectItem>
                  <SelectItem value="teslim_edildi">Teslim Edildi</SelectItem>
                  <SelectItem value="iptal">İptal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kalemler tablosu */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Kalemler</Label>
              <Button variant="outline" size="sm" onClick={addLine} className="h-7">
                <Plus className="w-3.5 h-3.5 mr-1" /> Kalem Ekle
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Ürün</TableHead>
                    <TableHead className="min-w-[180px]">Açıklama</TableHead>
                    <TableHead className="w-[80px]">Miktar</TableHead>
                    <TableHead className="w-[80px]">Birim</TableHead>
                    <TableHead className="w-[100px]">Birim Ağr.</TableHead>
                    <TableHead className="text-right w-[100px]">Toplam</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computed.lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell>
                        <Select
                          value={l.productId}
                          onValueChange={(v) => onProductSelect(l.key, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}{p.sku ? ` · ${p.sku}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.description}
                          onChange={(e) => updateLine(l.key, { description: e.target.value })}
                          placeholder="Açıklama"
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.qty}
                          onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                          className="h-8 text-xs tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.unit}
                          onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={l.weightPerUnit}
                          onChange={(e) => updateLine(l.key, { weightPerUnit: e.target.value })}
                          placeholder="kg"
                          className="h-8 text-xs tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium tabular-nums">
                        {formatKg(l.totalWeight)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => removeLine(l.key)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Ağırlık özeti */}
          <Card className="bg-violet-50/50 dark:bg-violet-950/20 border-violet-200/60 dark:border-violet-900/40">
            <CardContent className="p-3 grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Scale className="w-3 h-3" /> Net Ağırlık
                </div>
                <div className="text-sm font-bold tabular-nums">{formatKg(computed.netWeight)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Palet Ağırlığı</div>
                <div className="text-sm font-bold tabular-nums">{formatKg(computed.palletWeight)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Brüt Ağırlık</div>
                <div className="text-sm font-bold tabular-nums text-violet-700 dark:text-violet-400">{formatKg(computed.grossWeight)}</div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Sevkiyat & Palet bilgileri */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" /> Sevkiyat
              </Label>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Kargo Firması</Label>
                  <Select value={form.carrier} onValueChange={(v) => setField('carrier', v)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARRIERS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Takip No</Label>
                  <Input
                    value={form.trackingNo}
                    onChange={(e) => setField('trackingNo', e.target.value)}
                    className="h-9 text-sm font-mono"
                    placeholder="örn. 1234567890"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Teslimat Adresi</Label>
                  <Textarea
                    value={form.shippingAddress}
                    onChange={(e) => setField('shippingAddress', e.target.value)}
                    className="text-sm min-h-[60px]"
                    placeholder="Adres"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Box className="w-3.5 h-3.5" /> Palet Bilgileri
              </Label>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Palet Tipi</Label>
                    <Select value={form.palletType} onValueChange={(v) => setField('palletType', v)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {PALLET_TYPES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Palet Sayısı</Label>
                    <Input
                      type="number"
                      value={form.palletCount}
                      onChange={(e) => setField('palletCount', e.target.value)}
                      className="h-9 text-sm tabular-nums"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Palet Ağırlığı (kg)</Label>
                  <Input
                    type="number"
                    value={form.palletWeight}
                    onChange={(e) => setField('palletWeight', e.target.value)}
                    className="h-9 text-sm tabular-nums"
                    placeholder="20"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notlar */}
          <div className="space-y-1">
            <Label className="text-xs">Notlar</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              className="text-sm min-h-[60px]"
              placeholder="Opsiyonel not"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {editIrsaliye ? 'Güncelle' : 'Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
