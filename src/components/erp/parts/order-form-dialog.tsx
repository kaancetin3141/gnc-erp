'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Package, RefreshCw, Link2, FileText } from 'lucide-react'
import { CURRENCIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/format'
import { useAppStore } from '@/store/app-store'
import type {
  Order, ErpCustomer, ErpCustomerListResponse, Quote, QuoteListResponse,
} from './types'
import { emptyOrderForm, ORDER_STATUSES } from './order-utils'

// ============================================================
// Sipariş Formu (Yeni / Düzenle)
// ============================================================

export function OrderFormDialog({
  open, onOpenChange, editOrder,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editOrder?: Order | null
}) {
  const qc = useQueryClient()
  const { user } = useAppStore()
  const [form, setForm] = useState(emptyOrderForm(user?.tenant.defaultCurrency || 'TRY'))
  const [submitting, setSubmitting] = useState(false)

  // Müşteri listesi
  const { data: customersData } = useQuery({
    queryKey: ['customers', { limit: '100' }],
    queryFn: () => apiGet<ErpCustomerListResponse>('/api/customers?limit=100'),
    enabled: open,
  })
  const customers: ErpCustomer[] = customersData?.items ?? []

  // Teklif listesi (seçilen müşteri için)
  const { data: quotesData } = useQuery({
    queryKey: ['quotes', { customerId: form.customerId, limit: '50' }],
    queryFn: () => {
      const qs = new URLSearchParams({ customerId: form.customerId, limit: '50' }).toString()
      return apiGet<QuoteListResponse>(`/api/quotes?${qs}`)
    },
    enabled: open && !!form.customerId,
  })
  const customerQuotes: Quote[] = quotesData?.items ?? []

  useEffect(() => {
    if (open) {
      if (editOrder) {
        setForm({
          customerId: editOrder.customerId,
          quoteId: editOrder.quoteId ?? '',
          totalAmount: String(editOrder.totalAmount),
          currency: editOrder.currency,
          expectedDelivery: editOrder.expectedDelivery
            ? editOrder.expectedDelivery.slice(0, 10)
            : '',
          notes: editOrder.notes ?? '',
          status: editOrder.status,
        })
      } else {
        setForm(emptyOrderForm(user?.tenant.defaultCurrency || 'TRY'))
      }
    }
  }, [open, editOrder, user?.tenant.defaultCurrency])

  // Teklif seçilince tutar/para birimi otomatik doldur
  const handleQuoteSelect = (quoteId: string) => {
    if (!quoteId) {
      setForm({ ...form, quoteId: '' })
      return
    }
    const quote = customerQuotes.find((q) => q.id === quoteId)
    if (quote) {
      setForm({
        ...form,
        quoteId,
        totalAmount: String(quote.total),
        currency: quote.currency,
      })
    } else {
      setForm({ ...form, quoteId })
    }
  }

  const handleSubmit = async () => {
    if (!form.customerId) {
      toast.error('Müşteri seçin')
      return
    }
    if (form.totalAmount === '' || isNaN(parseFloat(form.totalAmount))) {
      toast.error('Geçerli bir tutar girin')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        customerId: form.customerId,
        quoteId: form.quoteId || undefined,
        totalAmount: parseFloat(form.totalAmount) || 0,
        currency: form.currency,
        expectedDelivery: form.expectedDelivery || undefined,
        notes: form.notes || undefined,
        status: form.status,
      }
      if (editOrder) {
        await apiPatch(`/api/orders/${editOrder.id}`, payload)
        toast.success('Sipariş güncellendi')
        qc.invalidateQueries({ queryKey: ['order', editOrder.id] })
      } else {
        await apiPost('/api/orders', payload)
        toast.success('Sipariş oluşturuldu')
      }
      qc.invalidateQueries({ queryKey: ['orders'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-violet-600" />
            {editOrder ? 'Siparişi Düzenle' : 'Yeni Sipariş'}
          </DialogTitle>
          <DialogDescription>
            {editOrder
              ? `${editOrder.number} numaralı siparişi güncelleyin.`
              : 'Yeni sipariş oluşturun. İsteğe bağlı bir teklif bağlayabilirsiniz.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Üst bilgi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Müşteri *</Label>
              <Select
                value={form.customerId}
                onValueChange={(v) => setForm({ ...form, customerId: v, quoteId: '' })}
                disabled={!!editOrder}
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
              <Label className="text-xs flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                Teklif Bağla (opsiyonel)
              </Label>
              <Select
                value={form.quoteId}
                onValueChange={handleQuoteSelect}
                disabled={!form.customerId || !!editOrder}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={form.customerId ? 'Teklif seç (opsiyonel)...' : 'Önce müşteri seçin'} />
                </SelectTrigger>
                <SelectContent>
                  {customerQuotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        <span className="font-mono">{q.number}</span>
                        <span className="text-[10px] text-muted-foreground">
                          · {formatCurrency(q.total, q.currency)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tutar</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
              />
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
              <Label className="text-xs">Beklenen Teslimat</Label>
              <Input
                type="date"
                value={form.expectedDelivery}
                onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Durum</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs">Notlar</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Sipariş ile ilgili notlar (opsiyonel)..."
              className="min-h-20 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.customerId}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {editOrder ? 'Güncelle' : 'Sipariş Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
