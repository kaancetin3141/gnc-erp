'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Receipt, Eye, Pencil, Plus, CheckCircle2, MoreHorizontal,
  CircleCheckBig, Undo2, MessageCircle, CalendarClock, Loader2,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Invoice } from './types'
import { getInvoiceStatusMeta } from './invoice-utils'

interface InvoiceTableProps {
  invoices: Invoice[]
  isLoading: boolean
  activeFilterCount: number
  onClearFilters: () => void
  onOpenAdd: () => void
  openDetail: (inv: Invoice) => void
  openEdit: (inv: Invoice) => void
  onQuickStatus: (inv: Invoice, status: 'odendi' | 'odeme_bekliyor') => void
  onExtendDue: (inv: Invoice) => void
  onRemind: (inv: Invoice) => void
  busyId?: string | null
}

export function InvoiceTable({
  invoices, isLoading, activeFilterCount,
  onClearFilters, onOpenAdd, openDetail, openEdit,
  onQuickStatus, onExtendDue, onRemind, busyId,
}: InvoiceTableProps) {
  return (
    <div className="p-0">
      {isLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mb-4">
            <Receipt className="w-8 h-8 text-amber-600/70" />
          </div>
          <h3 className="font-semibold text-lg">Fatura bulunamadı</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {activeFilterCount > 0
              ? 'Seçtiğiniz filtrelere uyan fatura yok. Filtreleri temizlemeyi deneyin.'
              : 'Henüz hiç fatura oluşturulmamış. İlk faturanızı oluşturarak başlayın.'}
          </p>
          {activeFilterCount > 0 ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
              Filtreleri Temizle
            </Button>
          ) : (
            <Button size="sm" className="mt-4 bg-amber-600 hover:bg-amber-700" onClick={onOpenAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              İlk Faturayı Oluştur
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto"><Table>
          <TableHeader>
            <TableRow className="bg-muted/60 border-b-2 hover:bg-muted/60">
              <TableHead className="pl-4 min-w-[140px] font-semibold text-xs uppercase tracking-wider text-muted-foreground">Fatura No</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Müşteri</TableHead>
              <TableHead className="hidden md:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Düzenleme</TableHead>
              <TableHead className="hidden lg:table-cell font-semibold text-xs uppercase tracking-wider text-muted-foreground">Vade</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Tutar</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
              <TableHead className="text-right pr-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const status = getInvoiceStatusMeta(inv.status)
              const overdue = inv.status === 'odeme_bekliyor' && inv.dueDate
                ? new Date(inv.dueDate).getTime() < Date.now()
                : false
              return (
                <TableRow
                  key={inv.id}
                  className={cn(
                    'cursor-pointer group table-row-hover transition-colors',
                    overdue ? 'bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20' : 'even:bg-muted/20',
                  )}
                  onClick={() => openDetail(inv)}
                >
                  <TableCell className="pl-4 relative">
                    {overdue && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-400" />}
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/40 group-hover:from-amber-200 group-hover:to-orange-200">
                        <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="font-mono text-sm font-medium">{inv.number}</div>
                        <div className="text-[10px] text-muted-foreground">{inv.currency}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium truncate max-w-[180px]">{inv.customer?.name ?? '—'}</div>
                    {inv.customer?.segment && (
                      <div className="text-[10px] text-muted-foreground">{inv.customer.segment}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(inv.issueDate)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm whitespace-nowrap">
                    <span className={cn(overdue && 'text-red-600 font-medium')}>{formatDate(inv.dueDate)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm font-bold tabular-nums">{formatCurrency(inv.total, inv.currency)}</div>
                    {inv.paidDate && (
                      <div className="text-[10px] text-emerald-600 tabular-nums">
                        <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                        {formatDate(inv.paidDate)}
                      </div>
                    )}
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
                            onClick={() => openDetail(inv)}
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
                            onClick={() => openEdit(inv)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Düzenle</TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 data-[state=open]:bg-muted"
                            disabled={busyId === inv.id}
                            aria-label={`${inv.number} hızlı işlemler`}
                          >
                            {busyId === inv.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <MoreHorizontal className="w-4 h-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">
                            {inv.number} · {formatCurrency(inv.total, inv.currency)}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {(inv.status === 'odeme_bekliyor' || inv.status === 'gecikti') && (
                            <>
                              <DropdownMenuItem onClick={() => onQuickStatus(inv, 'odendi')} className="text-emerald-700 dark:text-emerald-400 focus:text-emerald-700 dark:focus:text-emerald-400">
                                <CircleCheckBig className="w-4 h-4 mr-2" />
                                Ödendi Olarak İşaretle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onRemind(inv)}>
                                <MessageCircle className="w-4 h-4 mr-2" />
                                Ödeme Hatırlat (WhatsApp)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onExtendDue(inv)}>
                                <CalendarClock className="w-4 h-4 mr-2" />
                                Vade Uzat +7 Gün
                              </DropdownMenuItem>
                            </>
                          )}
                          {inv.status === 'odendi' && (
                            <DropdownMenuItem onClick={() => onQuickStatus(inv, 'odeme_bekliyor')} className="text-amber-700 dark:text-amber-400 focus:text-amber-700 dark:focus:text-amber-400">
                              <Undo2 className="w-4 h-4 mr-2" />
                              Ödemeyi Geri Al
                            </DropdownMenuItem>
                          )}
                          {inv.status === 'iptal' && (
                            <DropdownMenuItem disabled>
                              <Receipt className="w-4 h-4 mr-2" />
                              İptal edilmiş fatura
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openDetail(inv)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Detayı Gör
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(inv)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Düzenle
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
