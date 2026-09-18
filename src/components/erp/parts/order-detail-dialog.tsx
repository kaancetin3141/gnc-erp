'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api-client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
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
import { toast } from 'sonner'
import {
  Package, Pencil, Trash2, RefreshCw, User, Calendar,
  Clock, Truck, FileText, MapPin, Link2, Plus, History,
  CheckCircle2, Factory,
} from 'lucide-react'
import { formatCurrency, formatDateTime, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Order, OrderTrackingStep } from './types'
import {
  ORDER_STATUSES, getOrderStatusMeta, getNextStep, isStepCompleted,
} from './order-utils'
import { OrderProductionTab } from './order-production-tab'

// ============================================================
// Sipariş Detay Dialog — Takip timeline ile birlikte
// ============================================================

export function OrderDetailDialog({
  order, open, onOpenChange, onEdit,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onEdit: (o: Order) => void
}) {
  const qc = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [changing, setChanging] = useState(false)
  const [newStep, setNewStep] = useState('')
  const [newNote, setNewNote] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [tab, setTab] = useState('overview')

  const { data: detail, isLoading } = useQuery({
    queryKey: ['order', order?.id],
    queryFn: () => apiGet<Order>(`/api/orders/${order!.id}`),
    enabled: !!order && open,
  })

  if (!order) return null

  const status = getOrderStatusMeta(order.status)
  const d = detail ?? order
  const steps: OrderTrackingStep[] = d.trackingSteps ?? []
  const nextStep = getNextStep(order.status)
  const nextStepMeta = nextStep ? getOrderStatusMeta(nextStep) : null
  const isDelivered = order.status === 'teslim_edildi'
  const isCancelled = order.status === 'iptal'

  const changeStatus = async (newStatus: string) => {
    setChanging(true)
    try {
      await apiPatch(`/api/orders/${order.id}`, { status: newStatus })
      toast.success('Durum güncellendi')
      qc.invalidateQueries({ queryKey: ['order', order.id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncelleme başarısız')
    } finally {
      setChanging(false)
    }
  }

  const handleAddStep = async () => {
    if (!newStep) {
      toast.error('Adım seçin')
      return
    }
    setAddingStep(true)
    try {
      await apiPost(`/api/orders/${order.id}/tracking`, {
        step: newStep,
        note: newNote || undefined,
      })
      toast.success('Takip adımı eklendi')
      setNewStep('')
      setNewNote('')
      qc.invalidateQueries({ queryKey: ['order', order.id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setAddingStep(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiDelete(`/api/orders/${order.id}`)
      toast.success('Sipariş silindi')
      qc.invalidateQueries({ queryKey: ['orders'] })
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
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Package className="w-5 h-5 text-violet-600 shrink-0" />
                  <span className="font-mono">{order.number}</span>
                  <Badge variant="outline" className={cn('text-[10px]', status.color)}>
                    <status.icon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                  <User className="w-3 h-3" />
                  {order.customer?.name ?? '—'}
                  {order.quote && (
                    <span className="ml-2 flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      <span className="font-mono">{order.quote.number}</span>
                    </span>
                  )}
                  {order.invoice && (
                    <span className="ml-2 flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      <span className="font-mono">{order.invoice.number}</span>
                    </span>
                  )}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(order)}
                      disabled={isDelivered || isCancelled}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Düzenle
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Siparişi düzenle</TooltipContent>
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

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              {/* Tab seçici — Genel Bakış / Üretim Durumu */}
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="overview" className="text-xs">
                    <Package className="w-3.5 h-3.5 mr-1" /> Genel Bakış
                  </TabsTrigger>
                  <TabsTrigger value="production" className="text-xs">
                    <Factory className="w-3.5 h-3.5 mr-1" /> Üretim Durumu
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {tab === 'overview' && (
                <div className="space-y-4">
                  {/* Bilgi kartları */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="bg-muted/30">
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Sipariş Tarihi
                        </div>
                        <div className="text-sm font-bold mt-0.5">{formatDate(d.orderDate)}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/30">
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Beklenen Teslimat
                        </div>
                        <div className="text-sm font-bold mt-0.5">{formatDate(d.expectedDelivery)}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/30">
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Truck className="w-3 h-3" /> Teslim Edildi
                        </div>
                        <div className="text-sm font-bold mt-0.5">{formatDate(d.deliveredAt)}</div>
                      </CardContent>
                    </Card>
                    <Card className={cn(
                      'bg-muted/30',
                      isDelivered && 'border-emerald-200 dark:border-emerald-900/50',
                    )}>
                      <CardContent className="p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tutar</div>
                        <div className="text-sm font-bold mt-0.5 tabular-nums">
                          {formatCurrency(d.totalAmount, d.currency)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Müşteri adres bilgisi */}
                  {d.customer && (d.customer.address || d.customer.city || d.customer.phone) && (
                    <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div className="space-y-0.5">
                        {d.customer.address && <div>{d.customer.address}</div>}
                        {(d.customer.city) && (
                          <div>
                            {d.customer.city}
                          </div>
                        )}
                        {d.customer.phone && <div>Tel: {d.customer.phone}</div>}
                      </div>
                    </div>
                  )}

                  {/* Notlar */}
                  {d.notes && (
                    <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                      <div className="font-semibold mb-1">Sipariş Notu</div>
                      {d.notes}
                    </div>
                  )}

                  <Separator />

                  {/* Durum yönetimi */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-violet-600" />
                      <h4 className="text-sm font-semibold">Durum Yönetimi</h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ORDER_STATUSES.map((s) => (
                        <Button
                          key={s.value}
                          variant={order.status === s.value ? 'default' : 'outline'}
                          size="sm"
                          disabled={changing || order.status === s.value || (isCancelled && s.value !== 'iptal')}
                          onClick={() => changeStatus(s.value)}
                          className={cn(
                            order.status === s.value && 'bg-violet-600 hover:bg-violet-700',
                          )}
                        >
                          <s.icon className="w-3.5 h-3.5 mr-1" />
                          {s.label}
                        </Button>
                      ))}
                    </div>
                    {nextStepMeta && !isCancelled && !isDelivered && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Önerilen sonraki adım:</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px]"
                          disabled={changing}
                          onClick={() => changeStatus(nextStep!)}
                        >
                          <nextStepMeta.icon className="w-3 h-3 mr-1" />
                          {nextStepMeta.label}
                        </Button>
                      </div>
                    )}
                    {isDelivered && (
                      <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Sipariş teslim edildi.
                      </div>
                    )}
                    {isCancelled && (
                      <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        Bu sipariş iptal edildi.
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Takip timeline */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-violet-600" />
                      <h4 className="text-sm font-semibold">Takip Geçmişi</h4>
                      <Badge variant="outline" className="text-[10px] h-5 ml-1">
                        {steps.length} adım
                      </Badge>
                    </div>

                    {steps.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                        Henüz takip adımı yok. Aşağıdan ilk adımı ekleyin.
                      </div>
                    ) : (
                      <div className="relative pl-6 space-y-3 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                        {steps.map((step) => {
                          const meta = getOrderStatusMeta(step.step)
                          const completed = isStepCompleted(step.step, order.status)
                          const isCurrent = step.step === order.status
                          return (
                            <div key={step.id} className="relative">
                              <div
                                className={cn(
                                  'absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center',
                                  isCurrent
                                    ? 'bg-violet-600 border-violet-600'
                                    : completed
                                      ? 'bg-emerald-500 border-emerald-500'
                                      : 'bg-background border-border',
                                )}
                              />
                              <div className="flex items-center gap-2">
                                <meta.icon className={cn(
                                  'w-3.5 h-3.5',
                                  isCurrent ? 'text-violet-600' : completed ? 'text-emerald-600' : 'text-muted-foreground',
                                )} />
                                <span className="text-sm font-medium">{meta.label}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDateTime(step.createdAt)}
                                </span>
                              </div>
                              {step.note && (
                                <div className="text-xs text-muted-foreground mt-0.5 ml-5">
                                  {step.note}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Manuel adım ekleme */}
                    {!isCancelled && (
                      <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                        <Label className="text-xs font-semibold">Manuel Takip Adımı Ekle</Label>
                        <div className="flex gap-2 flex-wrap">
                          <Select value={newStep} onValueChange={setNewStep}>
                            <SelectTrigger className="h-8 text-xs flex-1 min-w-[180px]">
                              <SelectValue placeholder="Adım seçin..." />
                            </SelectTrigger>
                            <SelectContent>
                              {ORDER_STATUSES.filter((s) => s.value !== order.status).map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={addingStep || !newStep}
                            onClick={handleAddStep}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Ekle
                          </Button>
                        </div>
                        <Input
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="Not (opsiyonel)..."
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'production' && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Factory className="w-4 h-4 text-emerald-600" /> Üretim Durumu
                  </h4>
                  <OrderProductionTab orderId={order.id} />
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Siparişi sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{order.number}</strong> numaralı siparişi silmek üzeresiniz.
              Tüm takip adımları da silinecek. Bu işlem geri alınamaz.
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
