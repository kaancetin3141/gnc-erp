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
  FileText, Eye, Pencil, Plus,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Quote } from './types'
import { getQuoteStatusMeta } from './quote-utils'

interface QuoteTableProps {
  quotes: Quote[]
  isLoading: boolean
  activeFilterCount: number
  onClearFilters: () => void
  onOpenAdd: () => void
  openDetail: (q: Quote) => void
  openEdit: (q: Quote) => void
}

export function QuoteTable({
  quotes, isLoading, activeFilterCount,
  onClearFilters, onOpenAdd, openDetail, openEdit,
}: QuoteTableProps) {
  return (
    <div className="p-0">
      {isLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : quotes.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-emerald-600/70" />
          </div>
          <h3 className="font-semibold text-lg">Teklif bulunamadı</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {activeFilterCount > 0
              ? 'Seçtiğiniz filtrelere uyan teklif yok. Filtreleri temizlemeyi deneyin.'
              : 'Henüz hiç teklif oluşturulmamış. İlk teklifinizi oluşturarak başlayın.'}
          </p>
          {activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
              Filtreleri Temizle
            </Button>
          ) : (
            <Button size="sm" className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={onOpenAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              İlk Teklifi Oluştur
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto"><Table>
          <TableHeader>
            <TableRow className="bg-muted/60 border-b-2 hover:bg-muted/60">
              <TableHead className="pl-4 min-w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Teklif No</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Müşteri</TableHead>
              <TableHead className="hidden md:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Tarih</TableHead>
              <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Geçerlilik</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Tutar</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
              <TableHead className="text-right pr-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((q) => {
              const status = getQuoteStatusMeta(q.status)
              return (
                <TableRow
                  key={q.id}
                  className="cursor-pointer group table-row-hover transition-colors even:bg-muted/20"
                  onClick={() => openDetail(q)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:from-emerald-200 group-hover:to-teal-200',
                        q.isProforma
                          ? 'bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950/40 dark:to-purple-950/40'
                          : 'bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40',
                      )}>
                        <FileText className={cn(
                          'w-4 h-4',
                          q.isProforma ? 'text-violet-600 dark:text-violet-400' : 'text-emerald-600 dark:text-emerald-400',
                        )} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-medium">{q.number}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {q.isProforma ? 'Proforma' : 'Teklif'} · {q._count?.lines ?? 0} kalem
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium truncate max-w-[180px]">{q.customer?.name ?? '—'}</div>
                    {q.customer?.segment && (
                      <div className="text-[10px] text-muted-foreground">{q.customer.segment}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(q.issueDate)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(q.validUntil)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm font-bold tabular-nums">{formatCurrency(q.total, q.currency)}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      +{formatCurrency(q.taxTotal, q.currency)} KDV
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px] h-5 gap-1', status.color)}>
                      <status.icon className="w-3 h-3" />
                      {status.label}
                    </Badge>
                    {q.isProforma && (
                      <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60">
                        Proforma
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openDetail(q)}
                          >
                            <Eye className="w-4 h-4" />
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
                            onClick={() => openEdit(q)}
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
