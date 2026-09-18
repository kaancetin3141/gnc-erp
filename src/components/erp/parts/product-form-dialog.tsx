'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost, apiPatch } from '@/lib/api-client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PhotoUpload } from '@/components/ui/photo-upload'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Package, RefreshCw, Weight, Box, Truck } from 'lucide-react'
import { CURRENCIES, WEIGHT_UNITS, PACKAGING_TYPES, PALET_TYPES, CARRIERS } from '@/lib/constants'
import { toKg } from '@/lib/weight-utils'
import type { Product } from './types'

// ============================================================
// Form tipleri
// ============================================================

interface ProductForm {
  name: string
  sku: string
  description: string
  price: string
  currency: string
  taxRate: string
  stock: string
  minStock: string
  unit: string
  category: string
  photo: string | null
  // Ağırlık & ambalaj (F4)
  weight: string       // kullanıcı biriminde
  weightUnit: string   // gr | kg | ton — kullanıcı birimi
  packagingWeight: string
  packagingType: string
  paletType: string
  paletCount: string
  carrier: string
  trackingNumber: string
  color: string  // ürün rengi (serbest metin — satin altın, kirmizi, vb.)
}

const EMPTY_FORM: ProductForm = {
  name: '',
  sku: '',
  description: '',
  price: '0',
  currency: 'TRY',
  taxRate: '20',
  stock: '0',
  minStock: '0',
  unit: 'adet',
  category: '',
  photo: null,
  // Ağırlık & ambalaj
  weight: '',
  weightUnit: 'kg',
  packagingWeight: '',
  packagingType: '',
  paletType: '',
  paletCount: '',
  carrier: '',
  trackingNumber: '',
  color: '',
}

// ============================================================
// Ürün Ekleme/Düzenleme Dialog
// ============================================================

export function ProductFormDialog({
  open, onOpenChange, editProduct,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editProduct?: Product | null
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      if (editProduct) {
        // DB'de weight kg olarak saklanır — kullanıcının seçtiği birime geri çevir
        const wUnit = editProduct.weightUnit || 'kg'
        const userWeight = editProduct.weight != null
          ? (function fromKg(v: number, u: string) {
              if (u === 'gr') return v * 1000
              if (u === 'ton') return v * 0.001
              return v
            })(editProduct.weight, wUnit)
          : 0

        setForm({
          name: editProduct.name || '',
          sku: editProduct.sku || '',
          description: editProduct.description || '',
          price: String(editProduct.price ?? 0),
          currency: editProduct.currency || 'TRY',
          taxRate: String(editProduct.taxRate ?? 20),
          // Edit modunda stok doğrudan düzenlenmez — hareketler üzerinden yönetilir
          stock: String(editProduct.stock ?? 0),
          minStock: String(editProduct.minStock ?? 0),
          unit: editProduct.unit || 'adet',
          category: editProduct.category || '',
          photo: editProduct.photo ?? null,
          weight: userWeight > 0 ? String(userWeight) : '',
          weightUnit: wUnit,
          packagingWeight: editProduct.packagingWeight != null ? String(editProduct.packagingWeight) : '',
          packagingType: editProduct.packagingType || '',
          paletType: editProduct.paletType || '',
          paletCount: editProduct.paletCount != null ? String(editProduct.paletCount) : '',
          carrier: editProduct.carrier || '',
          trackingNumber: editProduct.trackingNumber || '',
          color: (editProduct as { color?: string }).color || '',
        })
      } else {
        setForm(EMPTY_FORM)
      }
    }
  }, [open, editProduct])

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Ürün adı gerekli')
      return
    }
    setSubmitting(true)
    try {
      // Kullanıcının girdiği ağırlığı kg'ya çevir
      const userWeight = parseFloat(form.weight) || 0
      const weightUnit = (['gr', 'kg', 'ton'].includes(form.weightUnit) ? form.weightUnit : 'kg') as 'gr' | 'kg' | 'ton'
      const weightKg = userWeight > 0 ? toKg(userWeight, weightUnit) : null
      const packagingWeight = parseFloat(form.packagingWeight) || null

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        currency: form.currency,
        taxRate: parseFloat(form.taxRate) || 0,
        unit: form.unit.trim() || 'adet',
        category: form.category.trim() || null,
        photo: form.photo,
        weight: weightKg,
        weightUnit: weightUnit,
        packagingWeight: packagingWeight != null && packagingWeight > 0 ? packagingWeight : null,
        packagingType: form.packagingType || null,
        paletType: form.paletType || null,
        paletCount: form.paletCount ? parseInt(form.paletCount) || null : null,
        carrier: form.carrier || null,
        trackingNumber: form.trackingNumber.trim() || null,
        color: form.color.trim() || null,
      }

      if (editProduct) {
        // PATCH — stok dahil değil
        await apiPatch(`/api/products/${editProduct.id}`, payload)
        toast.success('Ürün güncellendi')
        qc.invalidateQueries({ queryKey: ['product', editProduct.id] })
      } else {
        // POST — yeni ürün (başlangıç stoğu ayrı)
        await apiPost('/api/products', {
          ...payload,
          stock: parseInt(form.stock) || 0,
          minStock: parseInt(form.minStock) || 0,
        })
        toast.success('Ürün eklendi')
      }
      qc.invalidateQueries({ queryKey: ['products'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            {editProduct ? 'Ürünü Düzenle' : 'Yeni Ürün'}
          </DialogTitle>
          <DialogDescription>
            {editProduct
              ? 'Ürün bilgilerini güncelleyin. Stok güncellemeleri için ürün detayındaki stok hareketi formunu kullanın.'
              : 'Yeni ürün ekleyin. Başlangıç stoğu için bir "Açılış stoğu" hareketi otomatik oluşturulur.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Fotoğraf */}
          <div className="col-span-2 flex justify-center py-1">
            <PhotoUpload
              value={form.photo}
              onChange={(v) => setForm({ ...form, photo: v })}
              label="Ürün Fotoğrafı"
              size="md"
              variant="logo"
              placeholderIcon="package"
            />
          </div>

          {/* Ad */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="p-name" className="text-xs">Ürün Adı *</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Örn. CRM Pro Paket"
            />
          </div>

          {/* SKU */}
          <div className="space-y-1.5">
            <Label htmlFor="p-sku" className="text-xs">SKU / Stok Kodu</Label>
            <Input
              id="p-sku"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="CRM-PRO"
            />
          </div>

          {/* Kategori */}
          <div className="space-y-1.5">
            <Label htmlFor="p-cat" className="text-xs">Kategori</Label>
            <Input
              id="p-cat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Yazılım, Hizmet, Donanım..."
            />
          </div>

          {/* Açıklama */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="p-desc" className="text-xs">Açıklama</Label>
            <Textarea
              id="p-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ürün açıklaması..."
              rows={2}
            />
          </div>

          {/* Fiyat */}
          <div className="space-y-1.5">
            <Label htmlFor="p-price" className="text-xs">Fiyat</Label>
            <Input
              id="p-price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>

          {/* Para birimi */}
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

          {/* KDV */}
          <div className="space-y-1.5">
            <Label htmlFor="p-tax" className="text-xs">KDV (%)</Label>
            <Input
              id="p-tax"
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
            />
          </div>

          {/* Birim */}
          <div className="space-y-1.5">
            <Label htmlFor="p-unit" className="text-xs">Birim</Label>
            <Input
              id="p-unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="adet, saat, kg, lt..."
            />
          </div>

          {/* Min stok */}
          <div className="space-y-1.5">
            <Label htmlFor="p-min" className="text-xs">Min. Stok</Label>
            <Input
              id="p-min"
              type="number"
              min="0"
              step="1"
              value={form.minStock}
              onChange={(e) => setForm({ ...form, minStock: e.target.value })}
            />
          </div>

          {/* Başlangıç stoğu (yalnızca yeni ürün) */}
          {!editProduct && (
            <div className="space-y-1.5">
              <Label htmlFor="p-stock" className="text-xs">Başlangıç Stoğu</Label>
              <Input
                id="p-stock"
                type="number"
                min="0"
                step="1"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">
                Bir &quot;Açılış stoğu&quot; hareketi oluşturulur.
              </p>
            </div>
          )}
          {editProduct && (
            <div className="space-y-1.5">
              <Label className="text-xs">Mevcut Stok</Label>
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted/40 text-sm font-medium">
                {editProduct.stock} {editProduct.unit}
                <span className="ml-auto text-[10px] text-muted-foreground">Stok hareketi ile güncellenir</span>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* AĞIRLIK & AMBALAJ (F4-PRODUCT-WEIGHT-PALET) */}
          {/* ============================================================ */}
          <div className="col-span-2 mt-2 p-3 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10">
            <div className="flex items-center gap-2 mb-3">
              <Weight className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Ağırlık & Ambalaj
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Ağırlık */}
              <div className="space-y-1.5">
                <Label htmlFor="p-weight" className="text-xs">Ağırlık</Label>
                <div className="flex gap-2">
                  <Input
                    id="p-weight"
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    placeholder="0"
                    className="tabular-nums"
                  />
                  <Select
                    value={form.weightUnit}
                    onValueChange={(v) => setForm({ ...form, weightUnit: v })}
                  >
                    <SelectTrigger className="w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Boş bırakılırsa fatura/irsaliyede ağırlık gösterilmez.
                </p>
              </div>

              {/* Ambalaj Ağırlığı */}
              <div className="space-y-1.5">
                <Label htmlFor="p-pkg-weight" className="text-xs">Ambalaj Ağırlığı (kg)</Label>
                <Input
                  id="p-pkg-weight"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.packagingWeight}
                  onChange={(e) => setForm({ ...form, packagingWeight: e.target.value })}
                  placeholder="0.0"
                  className="tabular-nums"
                />
                <p className="text-[10px] text-muted-foreground">Birim başına ambalaj ağırlığı (kg)</p>
              </div>

              {/* Ambalaj Tipi */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Box className="w-3 h-3" /> Ambalaj Tipi
                </Label>
                <Select
                  value={form.packagingType}
                  onValueChange={(v) => setForm({ ...form, packagingType: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seçiniz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGING_TYPES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Palet Tipi */}
              <div className="space-y-1.5">
                <Label className="text-xs">Palet Tipi</Label>
                <Select
                  value={form.paletType}
                  onValueChange={(v) => setForm({ ...form, paletType: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seçiniz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PALET_TYPES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Palet Adedi */}
              <div className="space-y-1.5">
                <Label htmlFor="p-palet-count" className="text-xs">Palet Adedi</Label>
                <Input
                  id="p-palet-count"
                  type="number"
                  min="0"
                  step="1"
                  value={form.paletCount}
                  onChange={(e) => setForm({ ...form, paletCount: e.target.value })}
                  placeholder="0"
                  className="tabular-nums"
                />
              </div>

              {/* Kargo Firması */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Truck className="w-3 h-3" /> Kargo Firması
                </Label>
                <Select
                  value={form.carrier}
                  onValueChange={(v) => setForm({ ...form, carrier: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seçiniz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Kargo Takip No */}
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="p-tracking" className="text-xs">Kargo Takip No</Label>
                <Input
                  id="p-tracking"
                  value={form.trackingNumber}
                  onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
                  placeholder="Örn. 1234567890"
                  className="font-mono"
                />
              </div>

              {/* Ürün Rengi — serbest metin (satin altın, kirmizi, lacivert, vb.) */}
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="p-color" className="text-xs">
                  Ürün Rengi <span className="text-muted-foreground">(opsiyonel — fatura/irsaliyede görünür)</span>
                </Label>
                <Input
                  id="p-color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="Örn. satin altın, kirmizi, lacivert, antrasit..."
                  className="font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !form.name.trim()}>
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {editProduct ? 'Güncelle' : 'Ürün Ekle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
