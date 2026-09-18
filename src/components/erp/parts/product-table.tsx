'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Package, AlertTriangle, Pencil, Layers, Plus,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from './types'
import { getStockStatus } from './product-utils'

interface ProductTableProps {
  products: Product[]
  isLoading: boolean
  activeFilterCount: number
  onClearFilters: () => void
  onOpenAdd: () => void
  openDetail: (p: Product) => void
  openEdit: (p: Product) => void
}

export function ProductTable({
  products, isLoading, activeFilterCount,
  onClearFilters, onOpenAdd, openDetail, openEdit,
}: ProductTableProps) {
  return (
    <div className="p-0">
      {isLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-emerald-600/70" />
          </div>
          <h3 className="font-semibold text-lg">Ürün bulunamadı</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {activeFilterCount > 0
              ? 'Seçtiğiniz filtrelere uyan ürün yok. Filtreleri temizlemeyi deneyin.'
              : 'Henüz hiç ürün eklenmemiş. İlk ürününüzü ekleyerek başlayın.'}
          </p>
          {activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
              Filtreleri Temizle
            </Button>
          ) : (
            <Button size="sm" className="mt-4" onClick={onOpenAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              İlk Ürünü Ekle
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 border-b-2 hover:bg-muted/60">
              <TableHead className="pl-4 min-w-[200px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Ürün</TableHead>
              <TableHead className="hidden md:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Kategori</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Fiyat</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Stok</TableHead>
              <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Min Stok</TableHead>
              <TableHead className="hidden md:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Birim</TableHead>
              <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">KDV</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
              <TableHead className="text-right pr-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => {
              const status = getStockStatus(p)
              const isLow = status.variant !== 'ok'
              return (
                <TableRow
                  key={p.id}
                  className={cn(
                    'cursor-pointer group table-row-hover transition-colors',
                    isLow ? 'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20' : 'even:bg-muted/20',
                  )}
                  onClick={() => openDetail(p)}
                >
                  {/* Sol border — düşük stok için amber */}
                  <TableCell className="pl-4 relative">
                    {isLow && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                    )}
                    <div className="flex items-start gap-3">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo}
                          alt={p.name}
                          className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                          isLow
                            ? 'bg-amber-100 dark:bg-amber-950/40 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/40'
                            : 'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 group-hover:from-emerald-100 group-hover:to-emerald-200 dark:group-hover:from-emerald-900/40 dark:group-hover:to-emerald-800/40',
                        )}>
                          <Package className={cn(
                            'w-4 h-4',
                            isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-300 group-hover:text-emerald-600',
                          )} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate max-w-[220px]">{p.name}</div>
                        {p.sku && (
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {p.sku}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {p.category ? (
                      <Badge variant="secondary" className="text-[10px] h-5">
                        <Layers className="w-3 h-3 mr-1" />{p.category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {formatCurrency(p.price, p.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={cn(
                        'text-sm font-bold tabular-nums',
                        status.variant === 'out' && 'text-red-600',
                        status.variant === 'low' && 'text-amber-600',
                      )}>
                        {p.stock}
                      </span>
                      {status.variant === 'low' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Min stok sınırının altında ({p.minStock})</TooltipContent>
                        </Tooltip>
                      )}
                      {status.variant === 'out' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Stok tükendi</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground tabular-nums">
                    {p.minStock}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {p.unit}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground tabular-nums">
                    %{p.taxRate}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px] h-5', status.color)}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openDetail(p)}
                          >
                            <Package className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Detay</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Düzenle</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
