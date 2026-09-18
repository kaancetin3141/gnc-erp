'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Package, Pencil, Trash2, RefreshCw, TrendingUp,
  Tag, Layers, ClipboardList, Plus,
} from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product, ProductDetail } from './types'
import { getMovementMeta, getRefLabel, getStockStatus } from './product-utils'

// ============================================================
// Stok Hareketi Formu (Detail dialog içinde)
// ============================================================

function StockMovementForm({
  productId, unit, currentStock, onDone,
}: {
  productId: string
  unit: string
  currentStock: number
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [type, setType] = useState<'giris' | 'cikis' | 'duzeltme'>('giris')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const q = parseInt(quantity)
    if (!Number.isFinite(q)) {
      toast.error('Miktar girin')
      return
    }
    if (type === 'giris' && q <= 0) {
      toast.error('Giriş miktarı pozitif olmalı')
      return
    }
    if (type === 'cikis' && q <= 0) {
      toast.error('Çıkış miktarı pozitif olmalı')
      return
    }
    if (type === 'cikis' && q > currentStock) {
      toast.error(`Yetersiz stok (mevcut: ${currentStock} ${unit})`)
      return
    }
    if (type === 'duzeltme' && q < 0) {
      toast.error('Düzeltme sonrası stok negatif olamaz')
      return
    }
    setSubmitting(true)
    try {
      await apiPost(`/api/products/${productId}/stock`, {
        quantity: q,
        type,
        reason: reason.trim() || null,
        refType: 'manual',
      })
      toast.success('Stok hareketi eklendi')
      setQuantity('')
      setReason('')
      setType('giris')
      qc.invalidateQueries({ queryKey: ['product', productId] })
      qc.invalidateQueries({ queryKey: ['products'] })
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hareket eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Hareket Tipi</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="giris">Giriş (+)</SelectItem>
              <SelectItem value="cikis">Çıkış (-)</SelectItem>
              <SelectItem value="duzeltme">Düzeltme (=)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Miktar ({unit})</Label>
          <Input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Açıklama / Sebep</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn. Alım, Satış, Sayım farkı..."
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {type === 'giris' && <span className="text-emerald-600">Stok artar: {currentStock} → {currentStock + (parseInt(quantity) || 0)}</span>}
          {type === 'cikis' && <span className="text-rose-600">Stok azalır: {currentStock} → {currentStock - (parseInt(quantity) || 0)}</span>}
          {type === 'duzeltme' && <span className="text-amber-600">Stok ayarlanır: {currentStock} → {parseInt(quantity) || 0}</span>}
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={submitting || !quantity}>
          {submitting && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Hareket Ekle
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Ürün Detay Dialog
// ============================================================

export function ProductDetailDialog({
  product, open, onOpenChange, onEdit,
}: {
  product: Product | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onEdit: (p: Product) => void
}) {
  const qc = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Detay sorgu (son 20 hareket)
  const { data: detail, isLoading } = useQuery({
    queryKey: ['product', product?.id],
    queryFn: () => apiGet<ProductDetail>(`/api/products/${product!.id}`),
    enabled: !!product && open,
  })

  if (!product) return null

  const status = getStockStatus(product)
  const stockValue = product.stock * product.price
  const movements = detail?.stockMovements ?? []

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiDelete(`/api/products/${product.id}`)
      toast.success('Ürün silindi')
      qc.invalidateQueries({ queryKey: ['products'] })
      setDeleteOpen(false)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme başarısız')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto custom-scroll">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                {product.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.photo}
                    alt={product.name}
                    className="w-12 h-12 rounded-xl object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                )}
                <div className="min-w-0">
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <span className="truncate">{product.name}</span>
                    <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                      {status.label}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                    {product.sku && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Tag className="w-3 h-3" />{product.sku}
                      </span>
                    )}
                    {product.category && (
                      <Badge variant="secondary" className="text-[10px] h-5">
                        <Layers className="w-3 h-3 mr-1" />{product.category}
                      </Badge>
                    )}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => onEdit(product)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Düzenle
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ürün bilgilerini düzenle</TooltipContent>
                </Tooltip>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/50"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Bilgi kartları */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fiyat</div>
                <div className="text-base font-bold mt-0.5">{formatCurrency(product.price, product.currency)}</div>
                <div className="text-[10px] text-muted-foreground">%{product.taxRate} KDV</div>
              </CardContent>
            </Card>
            <Card className={cn(
              'bg-muted/30',
              status.variant === 'low' && 'bg-amber-50/50 dark:bg-amber-950/20',
              status.variant === 'out' && 'bg-red-50/50 dark:bg-red-950/20',
            )}>
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mevcut Stok</div>
                <div className={cn(
                  'text-base font-bold mt-0.5',
                  status.variant === 'out' && 'text-red-600',
                  status.variant === 'low' && 'text-amber-600',
                )}>
                  {product.stock} {product.unit}
                </div>
                <div className="text-[10px] text-muted-foreground">Min: {product.minStock} {product.unit}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stok Değeri</div>
                <div className="text-base font-bold mt-0.5">{formatCurrency(stockValue, product.currency)}</div>
                <div className="text-[10px] text-muted-foreground">stok × fiyat</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hareket Sayısı</div>
                <div className="text-base font-bold mt-0.5">
                  {detail?._count?.stockMovements ?? product._count?.stockMovements ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">toplam kayıt</div>
              </CardContent>
            </Card>
          </div>

          {/* Açıklama */}
          {product.description && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Açıklama</div>
              <p className="text-sm">{product.description}</p>
            </div>
          )}

          <Separator />

          {/* Stok hareketi ekleme formu */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-semibold">Stok Hareketi Ekle</h4>
            </div>
            <StockMovementForm
              productId={product.id}
              unit={product.unit}
              currentStock={product.stock}
              onDone={() => {
                // detail query invalidate handled internally
              }}
            />
          </div>

          <Separator />

          {/* Hareket geçmişi */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-slate-600" />
                <h4 className="text-sm font-semibold">Stok Hareketleri</h4>
              </div>
              <span className="text-xs text-muted-foreground">
                Son {Math.min(movements.length, 20)} hareket
              </span>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : movements.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                <ClipboardList className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Henüz stok hareketi yok.
              </div>
            ) : (
              <ScrollArea className="h-64 rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="bg-muted/60">
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Tarih</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Tip</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Miktar</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Sebep</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Kaynak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => {
                      const meta = getMovementMeta(m.type)
                      return (
                        <TableRow key={m.id} className="even:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(m.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-[10px] h-5 gap-1', meta.color)}>
                              <meta.icon className="w-3 h-3" />
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className={cn(
                              m.type === 'giris' && 'text-emerald-600',
                              m.type === 'cikis' && 'text-rose-600',
                              m.type === 'duzeltme' && 'text-amber-600',
                              m.type === 'transfer' && 'text-violet-600',
                            )}>
                              {meta.sign}{m.quantity}
                            </span>
                            <span className="text-muted-foreground ml-1">{product.unit}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                            {m.reason || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {getRefLabel(m.refType)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ürünü sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{product.name}</strong> ürününü silmek üzeresiniz.
              Bu işlem geri alınamaz ve tüm stok hareketleri de silinecek.
              {product._count?.quoteLines ? (
                <span className="block mt-2 text-amber-600 font-medium">
                  Bu ürün {product._count.quoteLines} teklif kalemiyle ilişkili — silmek engellenmiş olabilir.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
              Evet, Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
