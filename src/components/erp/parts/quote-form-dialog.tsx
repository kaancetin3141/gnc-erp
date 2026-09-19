'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
  FileText, Plus, Trash2, RefreshCw, Coins,
} from 'lucide-react'
import { CURRENCIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import { formatWeight } from '@/lib/weight-utils'
import type {
  Quote, ErpCustomer, ErpCustomerListResponse,
  ErpProductSimple, ErpProductListResponse,
} from './types'
import {
  emptyLine, emptyQuoteForm, lineTotals, quoteFormTotals,
} from './quote-utils'

// ============================================================
// Teklif Formu (Yeni / Düzenle)
// ============================================================

export function QuoteFormDialog({
  open, onOpenChange, editQuote,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editQuote?: Quote | null
}) {
  const qc = useQueryClient()
  const { user } = useAppStore()
  const [form, setForm] = useState(emptyQuoteForm(user?.tenant.defaultCurrency || 'TRY'))
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

  useEffect(() => {
    if (open) {
      if (editQuote) {
        setForm({
          customerId: editQuote.customerId,
          currency: editQuote.currency,
          issueDate: editQuote.issueDate ? editQuote.issueDate.slice(0, 10) : '',
          validUntil: editQuote.validUntil ? editQuote.validUntil.slice(0, 10) : '',
          isProforma: !!editQuote.isProforma,
          lines: (editQuote.lines ?? []).length > 0
            ? editQuote.lines!.map((l) => ({
                key: Math.random().toString(36).slice(2),
                productId: l.productId || '',
                description: l.description,
                qty: String(l.qty),
                unitPrice: String(l.unitPrice),
                taxRate: String(l.taxRate),
                weightPerUnit: l.weightPerUnit != null && l.weightPerUnit > 0 ? String(l.weightPerUnit) : '',
                weightUnit: l.weightUnit || 'kg',
                color: l.color || '',
              }))
            : [emptyLine()],
        })
      } else {
        setForm(emptyQuoteForm(user?.tenant.defaultCurrency || 'TRY'))
      }
    }
  }, [open, editQuote, user?.tenant.defaultCurrency])

  const totals = useMemo(() => quoteFormTotals(form), [form])

  const addLine = () => {
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
  }

  const removeLine = (key: string) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((l) => l.key !== key) : f.lines,
    }))
  }

  const updateLine = (key: string, patch: Partial<ReturnType<typeof emptyLine>>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }))
  }

  const onProductSelect = (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId)
    if (product) {
      // Ağırlık auto-fill (F4) — DB'de weight kg cinsinden saklanır
      const weightPerUnitKg = product.weight != null && product.weight > 0 ? String(product.weight) : ''
      updateLine(key, {
        productId,
        description: product.name,
        unitPrice: String(product.price),
        taxRate: String(product.taxRate),
        weightPerUnit: weightPerUnitKg,
        weightUnit: product.weightUnit || 'kg',
      })
    } else {
      updateLine(key, { productId: '' })
    }
  }

  const handleSubmit = async () => {
    if (!form.customerId) {
      toast.error('Müşteri seçin')
      return
    }
    if (form.lines.length === 0) {
      toast.error('En az bir kalem gereki')
      return
    }
    // Validate lines
    for (const l of form.lines) {
      if (!l.description.trim()) {
        toast.error('Tüm kalemler için açıklama gerekli')
        return
      }
    }
    setSubmitting(true)
    try {
      const payload = {
        customerId: form.customerId,
        currency: form.currency,
        issueDate: form.issueDate || undefined,
        validUntil: form.validUntil || undefined,
        lines: form.lines.map((l) => ({
          productId: l.productId || null,
          description: l.description.trim(),
          qty: parseFloat(l.qty) || 1,
          unitPrice: parseFloat(l.unitPrice) || 0,
          taxRate: parseFloat(l.taxRate) || 0,
          weightPerUnit: l.weightPerUnit ? parseFloat(l.weightPerUnit) || null : null,
          weightUnit: l.weightUnit || 'kg',
          color: l.color || null,
        })),
      }
      if (editQuote) {
        const endpoint = form.isProforma || editQuote.isProforma
          ? `/api/proforma/${editQuote.id}`
          : `/api/quotes/${editQuote.id}`
        await apiPatch(endpoint, payload)
        toast.success(form.isProforma ? 'Proforma güncellendi' : 'Teklif güncellendi')
        qc.invalidateQueries({ queryKey: ['quote', editQuote.id] })
        qc.invalidateQueries({ queryKey: ['proforma', editQuote.id] })
      } else {
        const endpoint = form.isProforma ? '/api/proforma' : '/api/quotes'
        await apiPost(endpoint, payload)
        toast.success(form.isProforma ? 'Proforma oluşturuldu' : 'Teklif oluşturuldu')
      }
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.invalidateQueries({ queryKey: ['proformas'] })
      qc.invalidateQueries({ queryKey: ['customer-quotes'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            {editQuote
              ? (form.isProforma || editQuote.isProforma ? 'Proforma Düzenle' : 'Teklifi Düzenle')
              : (form.isProforma ? 'Yeni Proforma' : 'Yeni Teklif')}
          </DialogTitle>
          <DialogDescription>
            {editQuote
              ? `${editQuote.number} numaralı ${form.isProforma || editQuote.isProforma ? 'proformayı' : 'teklifi'} güncelleyin.`
              : (form.isProforma
                ? 'Yeni bir proforma fatura oluşturun. PDF olarak kaydedip WhatsApp/e-posta ile gönderebilirsiniz.'
                : 'Yeni bir teklif oluşturun. Toplamlar otomatik hesaplanır.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Proforma toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none p-2.5 rounded-lg border border-border bg-muted/30">
            <input
              type="checkbox"
              checked={form.isProforma}
              onChange={(e) => setForm({ ...form, isProforma: e.target.checked })}
              disabled={!!editQuote && !!editQuote.isProforma}
              className="rounded border-input"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium">Proforma Fatura olarak işaretle</div>
              <div className="text-[10px] text-muted-foreground">
                Proforma; müşteriye önceden gönderilen, PDF + WhatsApp/e-posta ile iletilebilen geçici faturadır. Onaylandığında otomatik siparişe dönüşür.
              </div>
            </div>
          </label>

          <Separator />

          {/* Üst bilgi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Müşteri *</Label>
              <Select
                value={form.customerId}
                onValueChange={(v) => setForm({ ...form, customerId: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Müşteri seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Para Birimi</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} {c.code} — {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Düzenleme Tarihi</Label>
              <Input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Geçerlilik</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          {/* Kalemler */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-600" />
                Kalemler
              </h4>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Kalem Ekle
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground min-w-[180px]">Ürün / Açıklama</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground w-[70px]">Miktar</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground w-[100px]">Birim Fiyat</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground w-[70px]">KDV %</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground w-[110px]">Ağırlık</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right w-[110px]">Tutar</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.lines.map((line) => {
                    const t = lineTotals(line)
                    return (
                      <TableRow key={line.key}>
                        <TableCell className="p-2">
                          <div className="space-y-1.5">
                            <Select
                              value={line.productId}
                              onValueChange={(v) => onProductSelect(line.key, v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Ürün seç (opsiyonel)..." />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} {p.sku ? `(${p.sku})` : ''} — {formatCurrency(p.price, p.currency)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={line.description}
                              onChange={(e) => updateLine(line.key, { description: e.target.value })}
                              placeholder="Açıklama..."
                              className="h-8 text-xs"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={line.qty}
                            onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                            className="h-9 text-sm w-16 font-medium tabular-nums"
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                            className="h-9 text-sm w-24 tabular-nums"
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={line.taxRate}
                            onChange={(e) => updateLine(line.key, { taxRate: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.weightPerUnit}
                            onChange={(e) => updateLine(line.key, { weightPerUnit: e.target.value })}
                            className="h-8 text-xs w-24 tabular-nums"
                            placeholder="0"
                          />
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {t.totalWeight != null ? formatWeight(t.totalWeight, line.weightUnit) : '—'}
                          </div>
                        </TableCell>
                        <TableCell className="p-2 text-right">
                          <div className="text-sm font-medium tabular-nums">
                            {formatCurrency(t.lineTotal, form.currency)}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            +{formatCurrency(t.lineTax, form.currency)} KDV
                          </div>
                        </TableCell>
                        <TableCell className="p-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            onClick={() => removeLine(line.key)}
                            disabled={form.lines.length === 1}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Toplamlar */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 space-y-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Ara Toplam</span>
                <span className="font-medium tabular-nums">{formatCurrency(totals.subtotal, form.currency)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">KDV Toplam</span>
                <span className="font-medium tabular-nums">{formatCurrency(totals.taxTotal, form.currency)}</span>
              </div>
              {totals.totalWeightKg != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Toplam Net Ağırlık</span>
                  <span className="font-medium tabular-nums">{formatWeight(totals.totalWeightKg, 'kg')}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-sm font-semibold">Genel Toplam</span>
                <span className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(totals.total, form.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.customerId}
            className={form.isProforma ? 'bg-teal-600 hover:bg-teal-700' : 'bg-emerald-600 hover:bg-emerald-700'}
          >
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {editQuote
              ? 'Güncelle'
              : (form.isProforma ? 'Proforma Oluştur' : 'Teklif Oluştur')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
