'use client'

/**
 * M4 — Satış Fırsatları / Pipeline Kanban
 *
 * Özellikler:
 *  - Kanban & Liste görünümü (toggle)
 *  - @dnd-kit ile sürükle-bırak: kart → kolon (stage güncelleme PATCH)
 *  - "kazanıldı" kolonuna bırakma → probability=100 otomatik
 *  - "kaybedildi" kolonuna bırakma → kayıp nedeni + not modalı (zorunlu)
 *  - Fırsat ekleme / düzenleme / silme (dialog + confirm)
 *  - Filtreler: arama, owner select, stage chip'leri
 *  - İstatistikler: aktif fırsat sayısı, bu ay kazanılan, kazanma oranı, toplam pipeline
 *  - CSV dışa aktarma
 *  - Responsive (mobilde yatay scroll), loading skeleton, toast feedback
 */

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import {
  Plus,
  Download,
  LayoutGrid,
  List as ListIcon,
  Search,
  Trash2,
  X,
  TrendingUp,
  Trophy,
  Target,
  Calendar as CalendarIcon,
  ChevronUp,
  ChevronDown,
  User,
  Filter,
  Briefcase,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete, qk, ApiError } from '@/lib/api-client'
import {
  DEAL_STAGES,
  LOSS_REASONS,
  CURRENCIES,
  getLabel,
  getColor,
} from '@/lib/constants'
import {
  formatCurrency,
  formatDate,
  initials,
  toCSV,
  downloadFile,
  fromDateInput,
} from '@/lib/format'
import { hasPermission } from '@/lib/rbac'
import { useAppStore } from '@/store/app-store'
import type { Deal, Customer, UserListItem } from '@/types'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ─── Helpers ──────────────────────────────────────────────────────────────

const STAGE_VALUES = DEAL_STAGES.map((s) => s.value)
const ACTIVE_STAGES = STAGE_VALUES.filter((s) => s !== 'kazanıldı' && s !== 'kaybedildi')

// Üst border rengi (kolon vurgusu) — stage başına
const STAGE_TOP_BORDER: Record<string, string> = {
  yeni: 'border-t-slate-400',
  iletisim: 'border-t-sky-400',
  teklif: 'border-t-amber-400',
  muzakere: 'border-t-violet-400',
  kazanıldı: 'border-t-emerald-500',
  kaybedildi: 'border-t-red-400',
}

// Kolon arka plan renk tonu (kazanıldı / kaybedildi için)
const COLUMN_TINT: Record<string, string> = {
  kazanıldı: 'bg-emerald-50/60 dark:bg-emerald-950/20',
  kaybedildi: 'bg-red-50/60 dark:bg-red-950/20',
}

const STAGE_DOT: Record<string, string> = {
  yeni: 'bg-slate-400',
  iletisim: 'bg-sky-400',
  teklif: 'bg-amber-400',
  muzakere: 'bg-violet-400',
  kazanıldı: 'bg-emerald-500',
  kaybedildi: 'bg-red-400',
}

function stageProbability(stage: string): number {
  return DEAL_STAGES.find((s) => s.value === stage)?.probability ?? 10
}

function isThisMonth(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

interface DealsResponse {
  items: Deal[]
  total: number
}
interface CustomersResponse {
  items: Customer[]
  total: number
}
interface UsersResponse {
  items: UserListItem[]
  total: number
}

// ─── Tarih Seçici ─────────────────────────────────────────────────────────

function DatePicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (iso: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const date = value ? new Date(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start text-left font-normal h-9"
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          {date && !isNaN(date.getTime()) ? (
            format(date, 'PPP', { locale: tr })
          ) : (
            <span className="text-muted-foreground">Tarih seçin</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? fromDateInput(format(d, 'yyyy-MM-dd')) : null)
            setOpen(false)
          }}
          locale={tr}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

// ─── Fırsat Formu (Add & Edit) ────────────────────────────────────────────

interface DealFormValues {
  title: string
  customerId: string
  value: number
  currency: string
  stage: string
  probability: number
  expectedCloseDate: string | null
  ownerId: string
  lossReason?: string | null
  lossNote?: string | null
}

function emptyDealForm(defaultOwnerId: string): DealFormValues {
  return {
    title: '',
    customerId: '',
    value: 0,
    currency: 'TRY',
    stage: 'yeni',
    probability: 10,
    expectedCloseDate: null,
    ownerId: defaultOwnerId,
  }
}

function DealFormDialog({
  open,
  onOpenChange,
  deal,
  customers,
  users,
  currentUserId,
  onSaved,
  onDelete,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  deal: Deal | null // null = add mode
  customers: Customer[]
  users: UserListItem[]
  currentUserId: string
  onSaved: (deal: Deal) => void
  onDelete?: (deal: Deal) => void
}) {
  const isEdit = !!deal
  const [form, setForm] = React.useState<DealFormValues>(() =>
    deal
      ? {
          title: deal.title,
          customerId: deal.customerId,
          value: deal.value,
          currency: deal.currency,
          stage: deal.stage,
          probability: deal.probability,
          expectedCloseDate: deal.expectedCloseDate,
          ownerId: deal.ownerId ?? currentUserId,
          lossReason: deal.lossReason,
          lossNote: deal.lossNote,
        }
      : emptyDealForm(currentUserId),
  )
  const [customerSearch, setCustomerSearch] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setForm(
        deal
          ? {
              title: deal.title,
              customerId: deal.customerId,
              value: deal.value,
              currency: deal.currency,
              stage: deal.stage,
              probability: deal.probability,
              expectedCloseDate: deal.expectedCloseDate,
              ownerId: deal.ownerId ?? currentUserId,
              lossReason: deal.lossReason,
              lossNote: deal.lossNote,
            }
          : emptyDealForm(currentUserId),
      )
      setCustomerSearch('')
      setConfirmDelete(false)
    }
  }, [open, deal, currentUserId])

  // Stage değişimi → probability'i otomatik ayarla (sadece add mode'da veya edit'te kullanıcı stage değiştirdiyse)
  const handleStageChange = (stage: string) => {
    const newProb = stageProbability(stage)
    setForm((f) => ({
      ...f,
      stage,
      probability:
        stage === 'kazanıldı' ? 100 : stage === 'kaybedildi' ? 0 : newProb,
    }))
  }

  const filteredCustomers = React.useMemo(() => {
    if (!customerSearch) return customers.slice(0, 50)
    const q = customerSearch.toLowerCase()
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [customers, customerSearch])

  const canSubmit = form.title.trim() && form.customerId

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Lütfen başlık ve müşteri alanlarını doldurun')
      return
    }
    setSaving(true)
    try {
      const payload: DealFormValues = { ...form }
      if (isEdit && deal) {
        const updated = await apiPatch<Deal>(`/api/deals/${deal.id}`, payload)
        toast.success('Fırsat güncellendi')
        onSaved(updated)
        onOpenChange(false)
      } else {
        const created = await apiPost<Deal>('/api/deals', payload)
        toast.success('Yeni fırsat eklendi')
        onSaved(created)
        onOpenChange(false)
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Kaydetme başarısız'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto custom-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-emerald-600" />
              {isEdit ? 'Fırsatı Düzenle' : 'Yeni Fırsat'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Fırsat bilgilerini güncelleyin ve kaydedin.'
                : 'Yeni bir satış fırsatı oluşturun. Aşama seçimine göre olasılık otomatik atanır.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Başlık */}
            <div className="space-y-1.5">
              <Label htmlFor="deal-title">Fırsat Başlığı *</Label>
              <Input
                id="deal-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Örn. Yıllık bakım anlaşması"
              />
            </div>

            {/* Müşteri */}
            <div className="space-y-1.5">
              <Label>Müşteri *</Label>
              <div className="flex gap-2">
                <Select
                  value={form.customerId}
                  onValueChange={(v) => setForm({ ...form, customerId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Müşteri seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerSearch && (
                      <div className="px-2 pb-1">
                        <Input
                          autoFocus
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          placeholder="Ara..."
                          className="h-8"
                        />
                      </div>
                    )}
                    {filteredCustomers.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Müşteri bulunamadı
                      </div>
                    ) : (
                      filteredCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="truncate">{c.name}</span>
                          {c.city && (
                            <span className="text-muted-foreground ml-1">
                              · {c.city}
                            </span>
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Değer + Para Birimi */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="deal-value">Değer</Label>
                <Input
                  id="deal-value"
                  type="number"
                  min={0}
                  value={form.value}
                  onChange={(e) =>
                    setForm({ ...form, value: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Para Birimi</Label>
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
                        {c.code} ({c.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Aşama + Olasılık */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Aşama</Label>
                <Select value={form.stage} onValueChange={handleStageChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              'inline-block h-2 w-2 rounded-full',
                              STAGE_DOT[s.value],
                            )}
                          />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">
                  <span>Olasılık</span>
                  <span className="text-muted-foreground font-normal">
                    {form.probability}%
                  </span>
                </Label>
                <Slider
                  value={[form.probability]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) =>
                    setForm({ ...form, probability: v[0] ?? 0 })
                  }
                  disabled={
                    form.stage === 'kazanıldı' || form.stage === 'kaybedildi'
                  }
                />
              </div>
            </div>

            {/* Tahmini Kapanış + Sorumlu */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tahmini Kapanış</Label>
                <DatePicker
                  value={form.expectedCloseDate}
                  onChange={(iso) =>
                    setForm({ ...form, expectedCloseDate: iso })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sorumlu</Label>
                <Select
                  value={form.ownerId}
                  onValueChange={(v) => setForm({ ...form, ownerId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sorumlu seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Kayıp bilgisi (sadece kaybedildi stage'inde) */}
            {isEdit && form.stage === 'kaybedildi' && (
              <div className="space-y-3 p-3 rounded-lg bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40">
                <div className="space-y-1.5">
                  <Label>Kayıp Nedeni</Label>
                  <Select
                    value={form.lossReason ?? ''}
                    onValueChange={(v) =>
                      setForm({ ...form, lossReason: v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Neden seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOSS_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Not</Label>
                  <Textarea
                    rows={2}
                    value={form.lossNote ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, lossNote: e.target.value })
                    }
                    placeholder="Ek detaylar..."
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {isEdit && onDelete && deal && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4" /> Sil
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline">
                İptal
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? 'Kaydediliyor...' : isEdit ? 'Güncelle' : 'Fırsat Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fırsatı sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deal?.title}</strong> fırsatını kalıcı olarak silmek
              üzeresiniz. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deal && onDelete) {
                  onDelete(deal)
                  setConfirmDelete(false)
                  onOpenChange(false)
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Kayıp Nedeni Modalı (drag-drop ile kaybedildi'ye bırakınca) ──────────

function LossReasonDialog({
  open,
  onOpenChange,
  deal,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  deal: Deal | null
  onConfirm: (lossReason: string, lossNote: string) => void
}) {
  const [reason, setReason] = React.useState('')
  const [note, setNote] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setReason('')
      setNote('')
    }
  }, [open])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Fırsatı kaybetti olarak işaretle
          </AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{deal?.title}</strong> fırsatını kaybedildi olarak
            işaretlemek üzeresiniz. Devam etmek için bir kayıp nedeni seçin.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Kayıp Nedeni *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Bir neden seçin" />
              </SelectTrigger>
              <SelectContent>
                {LOSS_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Not (opsiyonel)</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Kayıpla ilgili ek detaylar, dersler..."
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>İptal</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason}
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => onConfirm(reason, note)}
          >
            <XCircle className="h-4 w-4 mr-1" /> Kaybedildi olarak işaretle
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Kanban Kartı ─────────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal
  onEdit: (deal: Deal) => void
  onOpenCustomer: (id: string) => void
  isOverlay?: boolean
}

function DealCardContent({ deal, onEdit, onOpenCustomer, isOverlay }: DealCardProps) {
  const ownerName = deal.owner?.name ?? 'Atanmamış'
  const stageColor = getColor(DEAL_STAGES, deal.stage)
  const isWon = deal.stage === 'kazanıldı'
  const isLost = deal.stage === 'kaybedildi'

  return (
    <Card
      className={cn(
        'group cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md',
        isOverlay && 'shadow-xl ring-2 ring-emerald-400/50 rotate-1',
        isWon && 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/10',
        isLost && 'border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/10 opacity-80',
      )}
      onClick={(e) => {
        if (isOverlay) return
        // Sadece kart içi tıklamalar (drag değil)
        e.stopPropagation()
        onEdit(deal)
      }}
    >
      <CardContent className="p-3 space-y-2">
        {/* Başlık + değer */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-tight line-clamp-2">
              {deal.title}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (deal.customer) onOpenCustomer(deal.customer.id)
              }}
              className="text-xs text-muted-foreground hover:text-emerald-600 hover:underline transition-colors truncate block max-w-full text-left mt-0.5"
            >
              {deal.customer?.name ?? '—'}
            </button>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold tabular-nums">
              {formatCurrency(deal.value, deal.currency)}
            </div>
          </div>
        </div>

        {/* Olasılık */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" /> Olasılık
            </span>
            <span className="font-semibold tabular-nums">{deal.probability}%</span>
          </div>
          <Progress
            value={deal.probability}
            className={cn(
              'h-1.5',
              isWon && '[&>[data-slot=progress-indicator]]:bg-emerald-500',
              isLost && '[&>[data-slot=progress-indicator]]:bg-red-400',
            )}
          />
        </div>

        {/* Footer: tarih + owner + stage */}
        <div className="flex items-center justify-between pt-1 border-t">
          <div className="flex items-center gap-1.5 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] bg-muted">
                    {initials(ownerName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">{ownerName}</TooltipContent>
            </Tooltip>
            {deal.expectedCloseDate && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate">
                <CalendarIcon className="h-3 w-3 shrink-0" />
                {formatDate(deal.expectedCloseDate)}
              </span>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0 h-4', stageColor)}
          >
            {getLabel(DEAL_STAGES, deal.stage)}
          </Badge>
        </div>

        {/* Kayıp nedeni (kaybedildi ise) */}
        {isLost && deal.lossReason && (
          <div className="text-[10px] text-red-600 dark:text-red-400 truncate pt-0.5">
            {deal.lossReason}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Sürüklenebilir kart
function SortableDealCard(props: DealCardProps) {
  const { deal } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DealCardContent {...props} />
    </div>
  )
}

// ─── Kanban Kolonu ────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  deals,
  onEdit,
  onOpenCustomer,
  isDropTarget,
}: {
  stage: (typeof DEAL_STAGES)[number]
  deals: Deal[]
  onEdit: (deal: Deal) => void
  onOpenCustomer: (id: string) => void
  isDropTarget: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value })
  const totalValue = deals.reduce(
    (acc, d) => acc + d.value,
    0,
  )
  const isWon = stage.value === 'kazanıldı'
  const isLost = stage.value === 'kaybedildi'

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-[280px] shrink-0 rounded-lg border-t-4 border bg-card',
        STAGE_TOP_BORDER[stage.value],
        COLUMN_TINT[stage.value],
        (isOver || isDropTarget) && 'ring-2 ring-emerald-400/50 bg-emerald-50/40 dark:bg-emerald-950/20',
      )}
    >
      {/* Kolon başlığı */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-card/60 backdrop-blur-sm rounded-t-md">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full shrink-0',
              STAGE_DOT[stage.value],
            )}
          />
          <span className="font-semibold text-sm truncate">{stage.label}</span>
          {isWon && <Trophy className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          {isLost && <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
        </div>
        <Badge
          variant="secondary"
          className="text-[10px] h-5 tabular-nums shrink-0"
        >
          {deals.length}
        </Badge>
      </div>

      {/* Toplam değer */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-card/30">
        Toplam: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(totalValue)}</span>
      </div>

      {/* Kart listesi */}
      <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-260px)]">
        <SortableContext
          items={deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deals.length === 0 ? (
            <div
              className={cn(
                'h-28 flex flex-col items-center justify-center text-xs border border-dashed rounded-md transition-colors',
                (isOver || isDropTarget)
                  ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-600'
                  : 'border-muted-foreground/20 text-muted-foreground/60 hover:border-muted-foreground/40',
              )}
            >
              {isOver || isDropTarget ? (
                <>
                  <Plus className="w-5 h-5 mb-1 text-emerald-500" />
                  <span className="font-medium">Buraya bırak</span>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center mb-1.5">
                    {isWon ? <Trophy className="w-4 h-4" /> : isLost ? <XCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </div>
                  <span>Bu aşamada fırsat yok</span>
                  <span className="text-[10px] mt-0.5 opacity-70">Kart sürükleyerek ekle</span>
                </>
              )}
            </div>
          ) : (
            deals.map((deal) => (
              <SortableDealCard
                key={deal.id}
                deal={deal}
                onEdit={onEdit}
                onOpenCustomer={onOpenCustomer}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

// ─── Liste Görünümü ───────────────────────────────────────────────────────

type SortField = 'title' | 'customer' | 'value' | 'stage' | 'probability' | 'owner' | 'expectedCloseDate' | 'updatedAt'
type SortDir = 'asc' | 'desc'

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onToggle,
  className,
}: {
  field: SortField
  label: string
  sortField: SortField
  sortDir: SortDir
  onToggle: (field: SortField) => void
  className?: string
}) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onToggle(field)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {sortField === field &&
          (sortDir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  )
}

function ListView({
  deals,
  onEdit,
  onOpenCustomer,
}: {
  deals: Deal[]
  onEdit: (deal: Deal) => void
  onOpenCustomer: (id: string) => void
}) {
  const [sortField, setSortField] = React.useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = React.useState<SortDir>('desc')

  const sorted = React.useMemo(() => {
    const arr = [...deals]
    arr.sort((a, b) => {
      let av: string | number
      let bv: string | number
      switch (sortField) {
        case 'title':
          av = a.title.toLowerCase()
          bv = b.title.toLowerCase()
          break
        case 'customer':
          av = (a.customer?.name ?? '').toLowerCase()
          bv = (b.customer?.name ?? '').toLowerCase()
          break
        case 'value':
          av = a.value
          bv = b.value
          break
        case 'stage':
          av = STAGE_VALUES.indexOf(a.stage)
          bv = STAGE_VALUES.indexOf(b.stage)
          break
        case 'probability':
          av = a.probability
          bv = b.probability
          break
        case 'owner':
          av = (a.owner?.name ?? '').toLowerCase()
          bv = (b.owner?.name ?? '').toLowerCase()
          break
        case 'expectedCloseDate':
          av = a.expectedCloseDate ? new Date(a.expectedCloseDate).getTime() : 0
          bv = b.expectedCloseDate ? new Date(b.expectedCloseDate).getTime() : 0
          break
        case 'updatedAt':
        default:
          av = new Date(a.updatedAt).getTime()
          bv = new Date(b.updatedAt).getTime()
          break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [deals, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader field="title" label="Fırsat" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader field="customer" label="Müşteri" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader field="value" label="Değer" className="text-right" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader field="stage" label="Aşama" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader field="probability" label="Olasılık" className="w-32" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader field="owner" label="Sorumlu" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader field="expectedCloseDate" label="Kapanış" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader field="updatedAt" label="Güncelleme" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Fırsat bulunamadı
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((deal) => (
              <TableRow
                key={deal.id}
                onClick={() => onEdit(deal)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium max-w-[220px] truncate">
                  {deal.title}
                  {deal.stage === 'kazanıldı' && (
                    <Trophy className="inline-block h-3 w-3 ml-1 text-emerald-500" />
                  )}
                  {deal.stage === 'kaybedildi' && (
                    <XCircle className="inline-block h-3 w-3 ml-1 text-red-400" />
                  )}
                </TableCell>
                <TableCell className="max-w-[180px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (deal.customer) onOpenCustomer(deal.customer.id)
                    }}
                    className="text-sm hover:text-emerald-600 hover:underline truncate block max-w-full text-left"
                  >
                    {deal.customer?.name ?? '—'}
                  </button>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(deal.value, deal.currency)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn('text-[10px]', getColor(DEAL_STAGES, deal.stage))}
                  >
                    {getLabel(DEAL_STAGES, deal.stage)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={deal.probability} className="h-1.5 w-16" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {deal.probability}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {initials(deal.owner?.name ?? '?')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs truncate max-w-[120px]">
                      {deal.owner?.name ?? '—'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(deal.expectedCloseDate)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(deal.updatedAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

// ─── Filtreler ────────────────────────────────────────────────────────────

function FiltersBar({
  search,
  onSearch,
  ownerFilter,
  onOwnerFilter,
  users,
  visibleStages,
  onToggleStage,
  onReset,
}: {
  search: string
  onSearch: (v: string) => void
  ownerFilter: string
  onOwnerFilter: (v: string) => void
  users: UserListItem[]
  visibleStages: string[]
  onToggleStage: (stage: string) => void
  onReset: () => void
}) {
  const hasActiveFilters =
    search !== '' || ownerFilter !== 'all' || visibleStages.length !== STAGE_VALUES.length

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Fırsat veya müşteri ara..."
            className="pl-8"
          />
        </div>
        <Select value={ownerFilter} onValueChange={onOwnerFilter}>
          <SelectTrigger className="w-[180px]">
            <User className="h-4 w-4 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Tüm sorumlular" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm sorumlular</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="h-4 w-4" /> Temizle
          </Button>
        )}
      </div>

      {/* Stage chip'leri */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
          <Filter className="h-3.5 w-3.5" /> Aşama:
        </span>
        {DEAL_STAGES.map((s) => {
          const active = visibleStages.includes(s.value)
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onToggleStage(s.value)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all',
                active
                  ? cn(s.color, 'shadow-sm')
                  : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted',
              )}
            >
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', STAGE_DOT[s.value])} />
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── İstatistik Kartları ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  sub,
}: {
  label: string
  value: string | number
  icon: typeof TrendingUp
  iconClass: string
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
          {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Kanban Skeleton ──────────────────────────────────────────────────────

function KanbanSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-2">
        <Skeleton className="h-9 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-3 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-[60vh] w-[280px] shrink-0" />
        ))}
      </div>
    </div>
  )
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────

export function KanbanBoard() {
  const { user, openCustomer } = useAppStore()
  const queryClient = useQueryClient()

  const [view, setView] = React.useState<'kanban' | 'list'>('kanban')
  const [search, setSearch] = React.useState('')
  const [ownerFilter, setOwnerFilter] = React.useState('all')
  const [visibleStages, setVisibleStages] = React.useState<string[]>(STAGE_VALUES)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editingDeal, setEditingDeal] = React.useState<Deal | null>(null)
  const [lossDialogOpen, setLossDialogOpen] = React.useState(false)
  const [pendingLossDeal, setPendingLossDeal] = React.useState<Deal | null>(null)

  const [activeDeal, setActiveDeal] = React.useState<Deal | null>(null)
  const [dropTargetStage, setDropTargetStage] = React.useState<string | null>(null)

  const canManage = hasPermission(user, 'deals.manage')

  // Sensörler — pointer ile sürükleme, 8px aktivasyon mesafesi
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Veri sorguları
  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: qk.deals({ limit: '200' }),
    queryFn: () => apiGet<DealsResponse>('/api/deals?limit=200'),
    refetchInterval: 60_000,
  })

  const { data: usersData } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<UsersResponse>('/api/users'),
  })

  const { data: customersData } = useQuery({
    queryKey: qk.customers({ limit: '100' }),
    queryFn: () => apiGet<CustomersResponse>('/api/customers?limit=100'),
  })

  const deals = React.useMemo(() => dealsData?.items ?? [], [dealsData])
  const users = React.useMemo(() => usersData?.items ?? [], [usersData])
  const customers = React.useMemo(() => customersData?.items ?? [], [customersData])

  // Filtreleme
  const filteredDeals = React.useMemo(() => {
    return deals.filter((d) => {
      if (!visibleStages.includes(d.stage)) return false
      if (ownerFilter !== 'all' && d.ownerId !== ownerFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchesTitle = d.title.toLowerCase().includes(q)
        const matchesCustomer = (d.customer?.name ?? '').toLowerCase().includes(q)
        if (!matchesTitle && !matchesCustomer) return false
      }
      return true
    })
  }, [deals, visibleStages, ownerFilter, search])

  // Kolonlara göre grupla
  const dealsByStage = React.useMemo(() => {
    const map: Record<string, Deal[]> = {}
    for (const stage of STAGE_VALUES) map[stage] = []
    for (const deal of filteredDeals) {
      if (map[deal.stage]) map[deal.stage].push(deal)
    }
    return map
  }, [filteredDeals])

  // İstatistikler
  const stats = React.useMemo(() => {
    const activeDeals = deals.filter((d) => ACTIVE_STAGES.includes(d.stage))
    const totalPipeline = activeDeals.reduce((acc, d) => acc + d.value, 0)
    const wonThisMonth = deals.filter(
      (d) => d.stage === 'kazanıldı' && isThisMonth(d.updatedAt),
    ).length
    const totalWon = deals.filter((d) => d.stage === 'kazanıldı').length
    const totalLost = deals.filter((d) => d.stage === 'kaybedildi').length
    const winRate = totalWon + totalLost > 0
      ? Math.round((totalWon / (totalWon + totalLost)) * 100)
      : 0
    return {
      activeCount: activeDeals.length,
      totalPipeline,
      wonThisMonth,
      winRate,
    }
  }, [deals])

  // Mutasyonlar
  const invalidateDeals = () => {
    queryClient.invalidateQueries({ queryKey: qk.deals({ limit: '200' }) })
  }

  const updateDealMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiPatch<Deal>(`/api/deals/${id}`, body),
    onSuccess: () => {
      invalidateDeals()
      queryClient.invalidateQueries({ queryKey: qk.dashboard })
    },
  })

  const deleteDealMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/deals/${id}`),
    onSuccess: () => {
      invalidateDeals()
      queryClient.invalidateQueries({ queryKey: qk.dashboard })
    },
  })

  // DnD olayları
  const handleDragStart = (e: DragStartEvent) => {
    const deal = deals.find((d) => d.id === e.active.id)
    setActiveDeal(deal ?? null)
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveDeal(null)
    setDropTargetStage(null)

    if (!over || !canManage) {
      if (!canManage && over) {
        toast.error('Fırsat taşıma yetkiniz yok')
      }
      return
    }

    const dealId = String(active.id)
    const deal = deals.find((d) => d.id === dealId)
    if (!deal) return

    // Hedef stage hesapla
    let targetStage: string | null = null
    if (STAGE_VALUES.includes(String(over.id))) {
      targetStage = String(over.id)
    } else {
      // over.id bir deal.id olabilir → o deal'in stage'ini al
      const overDeal = deals.find((d) => d.id === over.id)
      if (overDeal) targetStage = overDeal.stage
    }

    if (!targetStage || targetStage === deal.stage) return

    // Kazanıldı → otomatik probability=100
    if (targetStage === 'kazanıldı') {
      try {
        await updateDealMutation.mutateAsync({
          id: dealId,
          body: { stage: 'kazanıldı', probability: 100 },
        })
        toast.success('Fırsat kazanıldı olarak işaretlendi 🎉')
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Güncelleme başarısız')
      }
      return
    }

    // Kaybedildi → kayıp nedeni modalı aç
    if (targetStage === 'kaybedildi') {
      setPendingLossDeal(deal)
      setLossDialogOpen(true)
      return
    }

    // Normal stage değişimi
    try {
      await updateDealMutation.mutateAsync({
        id: dealId,
        body: {
          stage: targetStage,
          probability: stageProbability(targetStage),
        },
      })
      toast.success(`"${deal.title}" → ${getLabel(DEAL_STAGES, targetStage)}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Güncelleme başarısız')
    }
  }

  // DnD sırasında hover edilen kolonu vurgula (drag overlay için)
  const handleDragOver = (e: DragEndEvent) => {
    const { over } = e
    if (!over) {
      setDropTargetStage(null)
      return
    }
    let targetStage: string | null = null
    if (STAGE_VALUES.includes(String(over.id))) {
      targetStage = String(over.id)
    } else {
      const overDeal = deals.find((d) => d.id === over.id)
      if (overDeal) targetStage = overDeal.stage
    }
    setDropTargetStage(targetStage)
  }

  // Kayıp nedeni onayı
  const handleLossConfirm = async (reason: string, note: string) => {
    if (!pendingLossDeal) return
    try {
      await updateDealMutation.mutateAsync({
        id: pendingLossDeal.id,
        body: {
          stage: 'kaybedildi',
          probability: 0,
          lossReason: reason,
          lossNote: note,
        },
      })
      toast.success('Fırsat kaybedildi olarak işaretlendi')
      setLossDialogOpen(false)
      setPendingLossDeal(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Güncelleme başarısız')
    }
  }

  // Silme
  const handleDelete = async (deal: Deal) => {
    try {
      await deleteDealMutation.mutateAsync(deal.id)
      toast.success('Fırsat silindi')
      setFormOpen(false)
      setEditingDeal(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Silme başarısız')
    }
  }

  // CSV dışa aktarma
  const handleExportCSV = () => {
    if (filteredDeals.length === 0) {
      toast.error('Dışa aktarılacak fırsat yok')
      return
    }
    const rows = filteredDeals.map((d) => ({
      Baslik: d.title,
      Musteri: d.customer?.name ?? '',
      Deger: d.value,
      ParaBirimi: d.currency,
      Asama: getLabel(DEAL_STAGES, d.stage),
      Olasilik: d.probability,
      Sorumlu: d.owner?.name ?? '',
      TahminiKapanis: d.expectedCloseDate ? formatDate(d.expectedCloseDate) : '',
      Guncelleme: formatDate(d.updatedAt),
      KayipNedeni: d.lossReason ?? '',
      KayipNotu: d.lossNote ?? '',
    }))
    downloadFile(toCSV(rows), `firsatlar-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${filteredDeals.length} fırsat dışa aktarıldı`)
  }

  const handleToggleStage = (stage: string) => {
    setVisibleStages((curr) =>
      curr.includes(stage) ? curr.filter((s) => s !== stage) : [...curr, stage],
    )
  }

  const handleResetFilters = () => {
    setSearch('')
    setOwnerFilter('')
    setVisibleStages(STAGE_VALUES)
  }

  const handleEdit = (deal: Deal) => {
    setEditingDeal(deal)
    setFormOpen(true)
  }

  const handleAdd = () => {
    setEditingDeal(null)
    setFormOpen(true)
  }

  const handleSaved = () => {
    invalidateDeals()
    queryClient.invalidateQueries({ queryKey: qk.dashboard })
  }

  // Yetki kontrolü: görüntüleme bile yoksa uyarı göster
  if (!user) return null

  // Loading
  if (dealsLoading) {
    return <KanbanSkeleton />
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Satış Fırsatları
              <Badge variant="secondary" className="text-xs tabular-nums">
                {stats.activeCount} aktif
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Toplam pipeline değeri:{' '}
              <span className="font-semibold text-emerald-600 tabular-nums">
                {formatCurrency(stats.totalPipeline)}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Görünüm toggle */}
            <div className="inline-flex rounded-md border bg-card p-0.5">
              <Button
                variant={view === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('kanban')}
                className={cn(
                  'h-8',
                  view === 'kanban' && 'bg-emerald-600 hover:bg-emerald-700 text-white',
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Kanban</span>
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('list')}
                className={cn(
                  'h-8',
                  view === 'list' && 'bg-emerald-600 hover:bg-emerald-700 text-white',
                )}
              >
                <ListIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Liste</span>
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={filteredDeals.length === 0}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>

            {canManage && (
              <Button
                size="sm"
                onClick={handleAdd}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-4 w-4" />
                Fırsat Ekle
              </Button>
            )}
          </div>
        </div>

        {/* İstatistik kartları */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Aktif Fırsat"
            value={stats.activeCount}
            icon={TrendingUp}
            iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30"
            sub="Açık aşamalardaki fırsatlar"
          />
          <StatCard
            label="Toplam Pipeline"
            value={formatCompactTr(stats.totalPipeline)}
            icon={Target}
            iconClass="bg-violet-50 text-violet-600 dark:bg-violet-950/30"
            sub="Aktif fırsatların toplam değeri"
          />
          <StatCard
            label="Bu Ay Kazanılan"
            value={stats.wonThisMonth}
            icon={Trophy}
            iconClass="bg-amber-50 text-amber-600 dark:bg-amber-950/30"
            sub="Bu ay kapanan fırsatlar"
          />
          <StatCard
            label="Kazanma Oranı"
            value={`${stats.winRate}%`}
            icon={CheckCircle2}
            iconClass="bg-sky-50 text-sky-600 dark:bg-sky-950/30"
            sub="Kazanılan / (Kazanılan + Kaybedilen)"
          />
        </div>

        {/* Filtreler */}
        <FiltersBar
          search={search}
          onSearch={setSearch}
          ownerFilter={ownerFilter}
          onOwnerFilter={setOwnerFilter}
          users={users}
          visibleStages={visibleStages}
          onToggleStage={handleToggleStage}
          onReset={handleResetFilters}
        />

        {/* İçerik */}
        {view === 'kanban' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="overflow-x-auto custom-scroll pb-2 -mx-1 px-1">
              <div className="flex gap-3 min-w-max">
                {DEAL_STAGES.filter((s) => visibleStages.includes(s.value)).map((stage) => (
                  <KanbanColumn
                    key={stage.value}
                    stage={stage}
                    deals={dealsByStage[stage.value] ?? []}
                    onEdit={handleEdit}
                    onOpenCustomer={openCustomer}
                    isDropTarget={dropTargetStage === stage.value}
                  />
                ))}
              </div>
            </div>

            <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeDeal ? (
                <DealCardContent
                  deal={activeDeal}
                  onEdit={handleEdit}
                  onOpenCustomer={openCustomer}
                  isOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <ListView
            deals={filteredDeals}
            onEdit={handleEdit}
            onOpenCustomer={openCustomer}
          />
        )}

        {/* Boş durum */}
        {filteredDeals.length === 0 && !dealsLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {deals.length === 0
                ? 'Henüz fırsat yok. İlk fırsatı ekleyerek başlayın.'
                : 'Filtrelere uyan fırsat bulunamadı.'}
            </p>
          </div>
        )}

        {/* Form dialog (Add & Edit) */}
        {canManage && (
          <DealFormDialog
            open={formOpen}
            onOpenChange={(v) => {
              setFormOpen(v)
              if (!v) setEditingDeal(null)
            }}
            deal={editingDeal}
            customers={customers}
            users={users}
            currentUserId={user.id}
            onSaved={handleSaved}
            onDelete={handleDelete}
          />
        )}

        {/* Kayıp nedeni modalı */}
        <LossReasonDialog
          open={lossDialogOpen}
          onOpenChange={setLossDialogOpen}
          deal={pendingLossDeal}
          onConfirm={handleLossConfirm}
        />
      </div>
    </TooltipProvider>
  )
}

// Küçük yardımcı — try-only (toplam pipeline değerini kompakt göster)
function formatCompactTr(amount: number): string {
  // 1.250.000 → "1,25 Milyon ₺" — basitleştirilmiş
  const symbol = '₺'
  if (amount < 1_000_000) {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(amount) + ' ' + symbol
  }
  return (
    new Intl.NumberFormat('tr-TR', {
      maximumFractionDigits: 1,
      notation: 'compact',
    }).format(amount) + ' ' + symbol
  )
}
