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
  Package, Eye, Pencil, Plus,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Order } from './types'
import { getOrderStatusMeta } from './order-utils'

interface OrderTableProps {
  orders: Order[]
  isLoading: boolean
  activeFilterCount: number
  onClearFilters: () => void
  onOpenAdd: () => void
  openDetail: (o: Order) => void
  openEdit: (o: Order) => void
}

export function OrderTable({
  orders, isLoading, activeFilterCount,
  onClearFilters, onOpenAdd, openDetail, openEdit,
}: OrderTableProps) {
  return (
    <div className="p-0">
      {isLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-violet-600/70" />
          </div>
          <h3 className="font-semibold text-lg">Sipariş bulunamadı</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {activeFilterCount > 0
              ? 'Seçtiğiniz filtrelere uyan sipariş yok. Filtreleri temizlemeyi deneyin.'
              : 'Henüz hiç sipariş oluşturulmamış. İlk siparişinizi oluşturarak başlayın.'}
          </p>
          {activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
              Filtreleri Temizle
            </Button>
          ) : (
            <Button size="sm" className="mt-4 bg-violet-600 hover:bg-violet-700" onClick={onOpenAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              İlk Siparişi Oluştur
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto"><Table>
          <TableHeader>
            <TableRow className="bg-muted/60 border-b-2 hover:bg-muted/60">
              <TableHead className="pl-4 min-w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Sipariş No</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Müşteri</TableHead>
              <TableHead className="hidden md:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Tarih</TableHead>
              <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Beklenen</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Tutar</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
              <TableHead className="text-right pr-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => {
              const status = getOrderStatusMeta(o.status)
              const isDelivered = o.status === 'teslim_edildi'
              const isCancelled = o.status === 'iptal'
              return (
                <TableRow
                  key={o.id}
                  className={cn(
                    'cursor-pointer group table-row-hover transition-colors even:bg-muted/20',
                    isCancelled && 'opacity-60',
                  )}
                  onClick={() => openDetail(o)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br',
                        isDelivered
                          ? 'from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40'
                          : isCancelled
                            ? 'from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-950/40'
                            : 'from-violet-100 to-fuchsia-100 dark:from-violet-950/40 dark:to-fuchsia-950/40',
                      )}>
                        <status.icon className={cn(
                          'w-4 h-4',
                          isDelivered
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isCancelled
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-violet-600 dark:text-violet-400',
                        )} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-medium">{o.number}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {o.quote ? `Teklif: ${o.quote.number}` : 'Manuel'}
                          {o.invoice ? ` · ${o.invoice.number}` : ''}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium truncate max-w-[180px]">{o.customer?.name ?? '—'}</div>
                    {o.customer?.segment && (
                      <div className="text-[10px] text-muted-foreground">{o.customer.segment}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(o.orderDate)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(o.expectedDelivery)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm font-bold tabular-nums">{formatCurrency(o.totalAmount, o.currency)}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {o._count?.trackingSteps ?? o.trackingSteps?.length ?? 0} adım
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px] h-5 gap-1', status.color)}>
                      <status.icon className="w-3 h-3" />
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
                            onClick={() => openDetail(o)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Detay & Takip</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(o)}
                            disabled={isCancelled || isDelivered}
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
        </Table></div>
      )}
    </div>
  )
}
