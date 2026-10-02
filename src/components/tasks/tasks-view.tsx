'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  apiGet, apiPost, apiPatch, apiDelete, qk, ApiError,
} from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import {
  TASK_PRIORITIES, TASK_STATUSES, getLabel, getColor,
} from '@/lib/constants'
import {
  formatDate, formatDateTime, formatRelative, toLocalDateTimeInput, initials,
  toCSV, downloadFile,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import type { Task, Customer, UserListItem } from '@/types'

// UI
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

import {
  CheckSquare, Clock, AlertTriangle, Plus, Calendar, Flag, User, Trash2,
  Download, ListTodo, LayoutGrid, ChevronDown, Check, ChevronsUpDown,
  Bot, BellRing, CalendarDays, CalendarClock, X, Search, Pencil,
} from 'lucide-react'

import { AiPanel } from '@/components/ai/ai-panel'

// ---------------------------------------------------------------------------
// Tipler & yardımcılar
// ---------------------------------------------------------------------------

type TabKey = 'tumam' | 'bugun' | 'buhafta' | 'gecikmis' | 'tamamlanan'
type ViewMode = 'liste' | 'gruplu'

interface TaskListResponse {
  items: Task[]
  total: number
  limit: number
  offset: number
}

const PRIORITY_ORDER: Record<string, number> = {
  acil: 0, yuksek: 1, orta: 2, dusuk: 3,
}

function isOverdue(t: Task): boolean {
  if (t.status !== 'acik') return false
  return new Date(t.dueDate).getTime() < Date.now()
}

function isDueToday(t: Task): boolean {
  const d = new Date(t.dueDate)
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

function isCompletedThisWeek(t: Task): boolean {
  if (t.status !== 'tamamlandi' || !t.completedAt) return false
  const completed = new Date(t.completedAt).getTime()
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  return completed >= sevenDaysAgo
}

function isDueThisWeek(t: Task): boolean {
  if (t.status !== 'acik') return false
  const due = new Date(t.dueDate).getTime()
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfToday)
  endOfWeek.setDate(endOfWeek.getDate() + 7)
  return due >= startOfToday.getTime() && due <= endOfWeek.getTime()
}

type GroupKey = 'gecikmis' | 'bugun' | 'yarin' | 'buhafta' | 'sonra' | 'tamamlanan' | 'iptal'

const GROUP_LABELS: Record<GroupKey, string> = {
  gecikmis: 'Gecikmiş',
  bugun: 'Bugün',
  yarin: 'Yarın',
  buhafta: 'Bu Hafta',
  sonra: 'Sonra',
  tamamlanan: 'Tamamlanan',
  iptal: 'İptal',
}

const GROUP_ORDER: GroupKey[] = ['gecikmis', 'bugun', 'yarin', 'buhafta', 'sonra', 'tamamlanan', 'iptal']

function getTaskGroup(t: Task): GroupKey {
  if (t.status === 'tamamlandi') return 'tamamlanan'
  if (t.status === 'iptal') return 'iptal'
  const now = new Date()
  const due = new Date(t.dueDate)
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)
  const weekEnd = new Date(todayEnd); weekEnd.setDate(weekEnd.getDate() + 7)

  if (due.getTime() < todayStart.getTime()) return 'gecikmis'
  if (due.getTime() >= todayStart.getTime() && due.getTime() <= todayEnd.getTime()) return 'bugun'
  if (due.getTime() > todayEnd.getTime() && due.getTime() <= tomorrowEnd.getTime()) return 'yarin'
  if (due.getTime() > tomorrowEnd.getTime() && due.getTime() <= weekEnd.getTime()) return 'buhafta'
  return 'sonra'
}

function priorityRank(p: string): number {
  return PRIORITY_ORDER[p] ?? 99
}

function defaultDueDate(): string {
  // Yarın aynı saat
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setMinutes(0, 0, 0)
  return toLocalDateTimeInput(d)
}

// ---------------------------------------------------------------------------
// İçerik bileşenleri
// ---------------------------------------------------------------------------

function AvatarFor({ name }: { name: string | null | undefined }) {
  return (
    <Avatar className="w-7 h-7 border border-border/60">
      <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

interface TaskCardProps {
  task: Task
  onToggle: (task: Task, next: string) => void
  onClick: (task: Task) => void
  onOpenCustomer: (id: string) => void
}

function TaskCard({ task, onToggle, onClick, onOpenCustomer }: TaskCardProps) {
  const completed = task.status === 'tamamlandi'
  const overdue = isOverdue(task)
  const dueToday = isDueToday(task)

  const priorityColor = getColor(TASK_PRIORITIES, task.priority)
  const statusColor = getColor(TASK_STATUSES, task.status)

  // Kart tıklaması — ama checkbox / link / buton üzerinde ise yayılmasın
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-stop-propagation]')) return
    onClick(task)
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(task)
        }
      }}
      className={cn(
        'group relative transition-all hover:shadow-md hover:-translate-y-px cursor-pointer overflow-hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        overdue && 'border-l-4 border-l-red-500',
        completed && 'opacity-60',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div data-stop-propagation className="pt-0.5">
            <Checkbox
              checked={completed}
              onCheckedChange={(checked) => {
                onToggle(task, checked ? 'tamamlandi' : 'acik')
              }}
              aria-label="Görevi tamamla"
            />
          </div>

          {/* İçerik */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h4 className={cn(
                  'text-sm font-medium leading-snug break-words',
                  completed && 'line-through text-muted-foreground',
                )}>
                  {task.title}
                </h4>
                {task.autoGenerated && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50">
                          <Bot className="w-3 h-3" />
                          Otomatik
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>İletişimsiz müşteri için otomatik oluşturuldu</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {/* Sağ üst aksiyonlar */}
              <div className="flex items-center gap-1 shrink-0" data-stop-propagation>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); onClick(task) }}
                        aria-label="Düzenle"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Düzenle</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {task.description && (
              <p className={cn(
                'text-xs text-muted-foreground line-clamp-2 leading-relaxed',
                completed && 'line-through',
              )}>
                {task.description}
              </p>
            )}

            {/* Meta satırı */}
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground pt-1">
              <Badge variant="outline" className={cn('text-[10px] gap-1 px-1.5 py-0 h-5', priorityColor)}>
                <Flag className="w-2.5 h-2.5" />
                {getLabel(TASK_PRIORITIES, task.priority)}
              </Badge>

              <Badge variant="outline" className={cn('text-[10px] gap-1 px-1.5 py-0 h-5', statusColor)}>
                {getLabel(TASK_STATUSES, task.status)}
              </Badge>

              <span className={cn(
                'inline-flex items-center gap-1',
                overdue && 'text-red-600 font-medium',
                dueToday && !overdue && 'text-amber-600 font-medium',
              )}>
                <CalendarClock className="w-3 h-3" />
                {formatDateTime(task.dueDate)}
              </span>

              {task.reminderTime && (
                <span className="inline-flex items-center gap-1">
                  <BellRing className="w-3 h-3" />
                  {task.reminderTime}
                </span>
              )}

              {task.customer && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenCustomer(task.customer!.id) }}
                  className="inline-flex items-center gap-1 hover:text-foreground hover:underline truncate max-w-[180px]"
                  title={task.customer.name}
                >
                  <User className="w-3 h-3 shrink-0" />
                  <span className="truncate">{task.customer.name}</span>
                </button>
              )}

              {task.assignee && (
                <span className="inline-flex items-center gap-1 ml-auto" data-stop-propagation>
                  <AvatarFor name={task.assignee.name} />
                  <span className="hidden sm:inline">{task.assignee.name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Müşteri combobox
// ---------------------------------------------------------------------------

interface CustomerComboboxProps {
  value: string | null
  onChange: (id: string | null) => void
}

function CustomerCombobox({ value, onChange }: CustomerComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['customers-combo', search],
    queryFn: () => apiGet<{ items: Customer[]; total: number; limit: number; offset: number }>(
      '/api/customers?search=' + encodeURIComponent(search) + '&limit=20',
    ),
    enabled: open,
    staleTime: 30_000,
  })
  const customers = data?.items ?? []
  const selected = customers.find((c) => c.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9"
        >
          <span className="truncate">
            {selected ? selected.name
              : value ? 'Müşteri yükleniyor…'
              : 'Müşteri seç (opsiyonel)'}
          </span>
          <ChevronsUpDown className="opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="İsim, telefon, e-posta ara…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isFetching && <div className="py-3 text-center text-xs text-muted-foreground">Aranıyor…</div>}
            {!isFetching && customers.length === 0 && (
              <CommandEmpty>Müşteri bulunamadı.</CommandEmpty>
            )}
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id === value ? null : c.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('mr-1', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {c.sector}{c.city ? ' · ' + c.city : ''}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Görev formu (ekle & düzenle)
// ---------------------------------------------------------------------------

interface TaskFormState {
  title: string
  description: string
  dueDate: string
  assigneeId: string
  customerId: string | null
  priority: string
  reminderTime: string
  status: string
}

function emptyForm(defaultAssigneeId: string): TaskFormState {
  return {
    title: '',
    description: '',
    dueDate: defaultDueDate(),
    assigneeId: defaultAssigneeId,
    customerId: null,
    priority: 'orta',
    reminderTime: '',
    status: 'acik',
  }
}

function formFromTask(t: Task): TaskFormState {
  return {
    title: t.title,
    description: t.description ?? '',
    dueDate: toLocalDateTimeInput(t.dueDate),
    assigneeId: t.assigneeId ?? '',
    customerId: t.customerId,
    priority: t.priority,
    reminderTime: t.reminderTime ?? '',
    status: t.status,
  }
}

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialTask?: Task
  defaultAssigneeId: string
  users: UserListItem[]
  onSaved?: () => void
}

function TaskFormDialog({
  open, onOpenChange, mode, initialTask, defaultAssigneeId, users, onSaved,
}: TaskFormDialogProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState<TaskFormState>(() =>
    initialTask ? formFromTask(initialTask) : emptyForm(defaultAssigneeId),
  )
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Reset form when dialog opens or task changes
  const taskKey = initialTask?.id ?? 'new'
  const [lastKey, setLastKey] = useState<string>(taskKey)
  if (open && lastKey !== taskKey) {
    setLastKey(taskKey)
    setForm(initialTask ? formFromTask(initialTask) : emptyForm(defaultAssigneeId))
  }

  const set = <K extends keyof TaskFormState>(k: K, v: TaskFormState[K]) => {
    setForm((p) => ({ ...p, [k]: v }))
  }

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<Task>('/api/tasks', payload),
    onSuccess: () => {
      toast.success('Görev oluşturuldu')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
      onSaved?.()
    },
    onError: (e: ApiError) => toast.error(e.message || 'Görev oluşturulamadı'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiPatch<Task>(`/api/tasks/${id}`, payload),
    onSuccess: () => {
      toast.success('Görev güncellendi')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
      onSaved?.()
    },
    onError: (e: ApiError) => toast.error(e.message || 'Güncelleme başarısız'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/tasks/${id}`),
    onSuccess: () => {
      toast.success('Görev silindi')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setDeleteOpen(false)
      onOpenChange(false)
      onSaved?.()
    },
    onError: (e: ApiError) => toast.error(e.message || 'Silme başarısız'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Görev başlığı gerekli')
      return
    }
    if (!form.dueDate) {
      toast.error('Bitiş tarihi gerekli')
      return
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      dueDate: new Date(form.dueDate).toISOString(),
      assigneeId: form.assigneeId || undefined,
      customerId: form.customerId || null,
      priority: form.priority,
      reminderTime: form.reminderTime || null,
    }
    if (mode === 'edit') {
      payload.status = form.status
      updateMutation.mutate({ id: initialTask!.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-emerald-600" />
            {mode === 'create' ? 'Yeni Görev' : 'Görevi Düzenle'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Yeni bir görev veya hatırlatıcı oluştur.'
              : 'Görev detaylarını güncelle ya sil.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Başlık */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Başlık <span className="text-red-500">*</span></Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Örn: Müşteriyi ara, teklif gönder…"
              autoFocus
              required
            />
          </div>

          {/* Açıklama */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Açıklama</Label>
            <Textarea
              id="task-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Detay, bağlam, notlar…"
              rows={3}
            />
          </div>

          {/* Tarih + Hatırlatma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Bitiş Tarihi <span className="text-red-500">*</span></Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-reminder">Hatırlatma Saati</Label>
              <Input
                id="task-reminder"
                type="time"
                value={form.reminderTime}
                onChange={(e) => set('reminderTime', e.target.value)}
              />
            </div>
          </div>

          {/* Atanan + Öncelik */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Atanan Kişi</Label>
              <Select value={form.assigneeId} onValueChange={(v) => set('assigneeId', v)}>
                <SelectTrigger id="task-assignee" className="w-full">
                  <SelectValue placeholder="Kişi seç" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.title ? ' · ' + u.title : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Öncelik</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger id="task-priority" className="w-full">
                  <SelectValue placeholder="Öncelik seç" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={cn('inline-flex items-center gap-1.5', p.color)}>
                        <Flag className="w-3 h-3" />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Müşteri */}
          <div className="space-y-1.5">
            <Label>İlgili Müşteri</Label>
            <CustomerCombobox value={form.customerId} onChange={(v) => set('customerId', v)} />
            {form.customerId && (
              <button
                type="button"
                onClick={() => set('customerId', null)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" /> Müşteri bağlantısını kaldır
              </button>
            )}
          </div>

          {/* Durum (sadece düzenlemede) */}
          {mode === 'edit' && (
            <div className="space-y-1.5">
              <Label htmlFor="task-status">Durum</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className={cn('inline-flex items-center gap-1.5', s.color)}>
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            {mode === 'edit' && initialTask && (
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mr-auto"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleteMutation.isPending ? 'Siliniyor…' : 'Sil'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Görevi sil?</AlertDialogTitle>
                    <AlertDialogDescription>
                      “{initialTask.title}” görevi kalıcı olarak silinecek. Bu işlem geri alınamaz.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>İptal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate(initialTask.id)}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Evet, sil
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline">İptal</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Kaydediliyor…' : mode === 'create' ? 'Oluştur' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Otomasyon kartı
// ---------------------------------------------------------------------------

function AutomationCard() {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: autoStatus } = useQuery({
    queryKey: ['automation-status'],
    queryFn: () => apiGet<{ staleCustomerCount: number; openAutoTaskCount: number; thresholdDays: number; enabled: boolean }>(`/api/automation`),
    refetchInterval: 30_000,
  })

  const enabled = autoStatus?.enabled ?? true
  const threshold = autoStatus?.thresholdDays ?? 30

  const updateSetting = async (key: string, value: string | boolean) => {
    setSaving(true)
    try {
      await apiPatch('/api/settings', { key, value: String(value) })
      qc.invalidateQueries({ queryKey: ['automation-status'] })
    } catch (e) {
      toast.error('Ayar kaydedilemedi', { description: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (newEnabled: boolean) => {
    updateSetting('automation.enabled', newEnabled)
    toast.success(`Otomasyon ${newEnabled ? 'aktif' : 'pasif'}`)
  }

  const handleThresholdSave = () => {
    updateSetting('automation.thresholdDays', threshold)
    toast.success(`Eşik güncellendi: ${threshold} gün`)
  }

  const runAutomation = async () => {
    setRunning(true)
    try {
      const result = await apiPost<{ scanned: number; created: number; skipped: number }>(`/api/automation/stale-customer-tasks?days=${threshold}`)
      toast.success('Otomasyon çalıştırıldı', {
        description: `${result.scanned} müşteri tarandı · ${result.created} yeni görev oluşturuldu · ${result.skipped} zaten görev mevcut`,
      })
      qc.invalidateQueries({ queryKey: ['automation-status'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (e) {
      toast.error('Otomasyon başarısız', { description: e instanceof Error ? e.message : '' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              Otomatik Görev Üretimi
              <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
                Otomasyon
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              İletişimsiz müşteriler için otomatik hatırlatma görevleri oluşturulur.
            </CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving} aria-label="Otomasyonu aç/kapat" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Belirlenen gün sayısından uzun süredir kendileriyle iletişim kurulmamış müşteriler
          için sistem otomatik olarak <strong className="text-foreground">“İletişimsiz müşteri”</strong>{' '}
          etiketli bir görev oluşturur. Görev ilgili satış temsilcisine atanır ve önceliği
          <span className="text-amber-600 font-medium"> Yüksek</span> olarak işaretlenir.
        </p>

        {/* Canlı durum */}
        {autoStatus && (
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg bg-background/60 border border-amber-200/70 dark:border-amber-900/40">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">İletişimsiz Müşteri</div>
              <div className="text-xl font-bold mt-0.5 text-amber-600 tabular-nums">{autoStatus.staleCustomerCount}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-background/60 border border-amber-200/70 dark:border-amber-900/40">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Açık Otomatik Görev</div>
              <div className="text-xl font-bold mt-0.5 text-emerald-600 tabular-nums">{autoStatus.openAutoTaskCount}</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200/70 dark:border-amber-900/40 bg-background/60">
          <div className="flex-1">
            <Label htmlFor="threshold" className="text-xs text-muted-foreground">
              Eşik (gün)
            </Label>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              Bu süreden uzun iletişimsizlik durumunda görev üretilir
            </p>
          </div>
          <Input
            id="threshold"
            type="number"
            min={1}
            max={365}
            value={threshold}
            onChange={(e) => {
              const v = Math.max(1, Math.min(365, Number(e.target.value) || 30))
              updateSetting('automation.thresholdDays', v)
            }}
            disabled={saving}
            className="w-24 text-center font-semibold"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="flex-1 bg-amber-600 hover:bg-amber-700"
            disabled={running || !enabled}
            onClick={runAutomation}
          >
            {running ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                Çalışıyor...
              </>
            ) : (
              <>
                <Bot className="w-3.5 h-3.5 mr-1.5" />
                Şimdi Çalıştır
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={handleThresholdSave}
          >
            {saving ? 'Kaydediliyor...' : 'Ayarı Kaydet'}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-md bg-background/60 border border-border/60">
            <div className="text-xs text-muted-foreground">Çalışma Sıklığı</div>
            <div className="text-sm font-semibold mt-0.5">Her gece 02:00</div>
          </div>
          <div className="p-2 rounded-md bg-background/60 border border-border/60">
            <div className="text-xs text-muted-foreground">Öncelik</div>
            <div className="text-sm font-semibold mt-0.5 text-amber-600">Yüksek</div>
          </div>
          <div className="p-2 rounded-md bg-background/60 border border-border/60">
            <div className="text-xs text-muted-foreground">Durum</div>
            <div className={cn('text-sm font-semibold mt-0.5', enabled ? 'text-emerald-600' : 'text-muted-foreground')}>
              {enabled ? 'Aktif' : 'Pasif'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// İstatistik kartları
// ---------------------------------------------------------------------------

function StatCard({
  label, value, icon: Icon, tone, sub,
}: {
  label: string
  value: number | string
  icon: typeof CheckSquare
  tone: 'default' | 'red' | 'amber' | 'emerald'
  sub?: string
}) {
  const tones: Record<string, string> = {
    default: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
    red: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  }
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', tones[tone])}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          {sub && <div className="text-[10px] text-muted-foreground/80 truncate">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Boş durum
// ---------------------------------------------------------------------------

function EmptyState({ title, description, action }: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center mb-4">
        <CheckSquare className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// İskelet yükleyici
// ---------------------------------------------------------------------------

function TaskListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 flex items-start gap-3">
            <Skeleton className="w-4 h-4 rounded mt-1" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-24 rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ana görünüm
// ---------------------------------------------------------------------------

export function TasksView() {
  const { user, openCustomer } = useAppStore()
  const qc = useQueryClient()

  const [tab, setTab] = useState<TabKey>('tumam')
  const [viewMode, setViewMode] = useState<ViewMode>('liste')
  const [priority, setPriority] = useState<string>('')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Kullanıcılar
  const { data: usersData } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<{ items: UserListItem[]; total: number }>('/api/users'),
    staleTime: 60_000,
  })
  const users = usersData?.items ?? []

  // İstatistikler için tüm açık + tüm tamamlanan görevler
  const { data: statsData } = useQuery({
    queryKey: ['tasks-stats'],
    queryFn: () => apiGet<TaskListResponse>('/api/tasks?limit=500'),
    staleTime: 30_000,
  })

  // Ana liste sorgusu
  const params = useMemo(() => {
    const p: Record<string, string> = { limit: '200' }
    if (tab === 'bugun') p.dueToday = 'true'
    if (tab === 'gecikmis') p.overdue = 'true'
    if (tab === 'tamamlanan') p.status = 'tamamlandi'
    if (tab === 'buhafta') p.status = 'acik'
    if (priority) p.priority = priority
    if (assigneeId) p.assigneeId = assigneeId
    return p
  }, [tab, priority, assigneeId])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: qk.tasks(params),
    queryFn: () => apiGet<TaskListResponse>('/api/tasks?' + new URLSearchParams(params).toString()),
    placeholderData: (prev) => prev,
  })

  const tasks = data?.items ?? []
  const allStatsTasks = statsData?.items ?? []

  // Sekmeli filtreleme (bu hafta için istemci tarafı)
  const visibleTasks = useMemo(() => {
    let list = tasks
    if (tab === 'buhafta') {
      list = list.filter(isDueThisWeek)
    }
    if (tab === 'tumam') {
      // tümü — filtre yok
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q)
        || (t.description ?? '').toLowerCase().includes(q)
        || (t.customer?.name ?? '').toLowerCase().includes(q),
      )
    }
    // sırala: önce gecikmiş (en eski), sonra dueDate asc; tamamlanan en sona
    return [...list].sort((a, b) => {
      if (a.status === 'tamamlandi' && b.status !== 'tamamlandi') return 1
      if (a.status !== 'tamamlandi' && b.status === 'tamamlandi') return -1
      const pa = priorityRank(a.priority), pb = priorityRank(b.priority)
      if (pa !== pb) return pa - pb
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [tasks, tab, search])

  // Gruplu görünüm
  const grouped = useMemo(() => {
    const g: Record<GroupKey, Task[]> = {
      gecikmis: [], bugun: [], yarin: [], buhafta: [], sonra: [], tamamlanan: [], iptal: [],
    }
    for (const t of visibleTasks) {
      g[getTaskGroup(t)].push(t)
    }
    return g
  }, [visibleTasks])

  // İstatistikler
  const stats = useMemo(() => {
    const open = allStatsTasks.filter((t) => t.status === 'acik').length
    const overdue = allStatsTasks.filter(isOverdue).length
    const dueToday = allStatsTasks.filter(isDueToday).length
    const completedThisWeek = allStatsTasks.filter(isCompletedThisWeek).length
    return { open, overdue, dueToday, completedThisWeek }
  }, [allStatsTasks])

  // Tamamlandı iptali (optimistic)
  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<Task>(`/api/tasks/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const nowIso = new Date().toISOString()
      qc.setQueriesData<TaskListResponse>(
        { queryKey: ['tasks'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            items: old.items.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status,
                    completedAt: status === 'tamamlandi' ? nowIso : null,
                  }
                : t,
            ),
          }
        },
      )
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.error('Görev güncellenemedi')
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.status === 'tamamlandi' ? 'Görev tamamlandı ✓' : 'Görev yeniden açıldı')
      qc.invalidateQueries({ queryKey: ['tasks-stats'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const handleToggle = useCallback((task: Task, next: string) => {
    if (next === task.status) return
    toggleMutation.mutate({ id: task.id, status: next })
  }, [toggleMutation])

  const handleOpenEdit = (t: Task) => {
    setEditTask(t)
    setEditOpen(true)
  }

  const handleExportCSV = () => {
    if (visibleTasks.length === 0) {
      toast.error('Dışa aktarılacak görev yok')
      return
    }
    const rows = visibleTasks.map((t) => ({
      Baslik: t.title,
      Aciklama: t.description ?? '',
      Durum: getLabel(TASK_STATUSES, t.status),
      Oncelik: getLabel(TASK_PRIORITIES, t.priority),
      BitisTarihi: formatDateTime(t.dueDate),
      Hatirlatma: t.reminderTime ?? '',
      Atanan: t.assignee?.name ?? '',
      Musteri: t.customer?.name ?? '',
      Otomatik: t.autoGenerated ? 'Evet' : 'Hayir',
      Olusturulma: formatDateTime(t.createdAt),
    }))
    downloadFile(toCSV(rows), `gorevler-${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success(`${rows.length} görev dışa aktarıldı`)
  }

  const priorityChips = TASK_PRIORITIES

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 animate-fade-in pb-6">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <CheckSquare className="w-6 h-6 text-emerald-600" />
                Görevler &amp; Hatırlatıcılar
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {user?.name && <span>Merhaba {user.name.split(' ')[0]}, </span>}
                {stats.open > 0
                  ? <span>{stats.open} açık görevin var{stats.overdue > 0 && <span className="text-red-600 font-medium"> · {stats.overdue} gecikmiş</span>}</span>
                  : <span>tüm görevlerini tamamlamışsın 🎉</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={visibleTasks.length === 0}>
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                Görev Ekle
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Açık Görevler" value={stats.open} icon={CheckSquare} tone="default" />
            <StatCard label="Gecikmiş" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue > 0 ? 'red' : 'default'} sub={stats.overdue > 0 ? 'Acilen ilgilen' : 'Zamanında'} />
            <StatCard label="Bugün Biten" value={stats.dueToday} icon={Clock} tone="amber" />
            <StatCard label="Bu Hafta Tamamlanan" value={stats.completedThisWeek} icon={CalendarDays} tone="emerald" />
          </div>
        </div>

        {/* Filtreler */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList className="h-9">
                <TabsTrigger value="tumam" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="bugun" className="text-xs">
                  Bugün
                  {stats.dueToday > 0 && tab !== 'bugun' && (
                    <span className="ml-1 inline-flex items-center justify-center text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 rounded-full px-1.5">{stats.dueToday}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="buhafta" className="text-xs">Bu Hafta</TabsTrigger>
                <TabsTrigger value="gecikmis" className="text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  Gecikmiş
                  {stats.overdue > 0 && tab !== 'gecikmis' && (
                    <span className="ml-1 inline-flex items-center justify-center text-[10px] bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-full px-1.5">{stats.overdue}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="tamamlanan" className="text-xs">Tamamlanan</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="ml-auto flex items-center gap-2">
              {/* Arama */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Görev ara…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 w-[180px] sm:w-[240px]"
                />
              </div>

              {/* Atanan filtresi */}
              <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v === '__all' ? '' : v)}>
                <SelectTrigger className="h-9 w-[160px] hidden sm:flex">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <SelectValue placeholder="Tüm kişiler" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Tüm kişiler</SelectItem>
                  <Separator className="my-1" />
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="inline-flex items-center gap-2">
                        <AvatarFor name={u.name} />
                        {u.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Görünüm modu */}
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => v && setViewMode(v as ViewMode)}
                variant="outline"
                className="h-9"
              >
                <ToggleGroupItem value="liste" aria-label="Liste görünümü" className="px-2.5">
                  <ListTodo className="w-4 h-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="gruplu" aria-label="Gruplu görünüm" className="px-2.5">
                  <LayoutGrid className="w-4 h-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Öncelik chip'leri */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Flag className="w-3 h-3" /> Öncelik:
            </span>
            <button
              type="button"
              onClick={() => setPriority('')}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                priority === ''
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted',
              )}
            >
              Tümü
            </button>
            {priorityChips.map((p) => {
              const active = priority === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(active ? '' : p.value)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1',
                    active ? cn(p.color, 'font-medium') : 'bg-background text-muted-foreground border-border hover:bg-muted',
                  )}
                >
                  <Flag className="w-3 h-3" />
                  {p.label}
                </button>
              )
            })}
            {(priority || assigneeId || search) && (
              <button
                type="button"
                onClick={() => { setPriority(''); setAssigneeId(''); setSearch('') }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-1"
              >
                <X className="w-3 h-3" /> Filtreleri temizle
              </button>
            )}
          </div>
        </div>

        {/* İçerik */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Liste / Gruplar */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <TaskListSkeleton />
            ) : visibleTasks.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    title={tab === 'tamamlanan' ? 'Tamamlanan görev yok' : 'Görev yok'}
                    description={
                      tab === 'tamamlanan'
                        ? 'Henüz tamamlanmış görev bulunmuyor. Görevlerini tamamladıkça burada görünecek.'
                        : tab === 'gecikmis'
                          ? 'Harika! Gecikmiş görevin yok.'
                          : 'Bu görünüme uygun görev bulunamadı. Yeni bir görev ekleyebilirsin.'
                    }
                    action={
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4" /> Yeni Görev
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            ) : viewMode === 'liste' ? (
              <div className="space-y-2.5">
                {isFetching && !isLoading && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Güncelleniyor…
                  </div>
                )}
                {visibleTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onToggle={handleToggle}
                    onClick={handleOpenEdit}
                    onOpenCustomer={openCustomer}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {GROUP_ORDER.map((g) => {
                  const items = grouped[g]
                  if (items.length === 0) return null
                  const totalGroup = items.length
                  const completedGroup = items.filter((t) => t.status === 'tamamlandi').length
                  const pct = totalGroup > 0 ? Math.round((completedGroup / totalGroup) * 100) : 0
                  return (
                    <div key={g} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-0 bg-background/80 backdrop-blur-sm py-1.5 z-10">
                        <h3 className={cn(
                          'text-sm font-semibold flex items-center gap-1.5',
                          g === 'gecikmis' && 'text-red-600',
                          g === 'bugun' && 'text-amber-600',
                          g === 'yarin' && 'text-sky-600',
                          g === 'buhafta' && 'text-violet-600',
                          g === 'tamamlanan' && 'text-emerald-600',
                        )}>
                          {g === 'gecikmis' && <AlertTriangle className="w-3.5 h-3.5" />}
                          {g === 'bugun' && <Clock className="w-3.5 h-3.5" />}
                          {g === 'yarin' && <Calendar className="w-3.5 h-3.5" />}
                          {g === 'buhafta' && <CalendarDays className="w-3.5 h-3.5" />}
                          {g === 'sonra' && <CalendarClock className="w-3.5 h-3.5" />}
                          {g === 'tamamlanan' && <Check className="w-3.5 h-3.5" />}
                          {GROUP_LABELS[g]}
                        </h3>
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{totalGroup}</Badge>
                        {completedGroup > 0 && (
                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[11px] text-muted-foreground">{completedGroup}/{totalGroup}</span>
                            <Progress value={pct} className="h-1.5 w-16" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2.5">
                        {items.map((t) => (
                          <TaskCard
                            key={t.id}
                            task={t}
                            onToggle={handleToggle}
                            onClick={handleOpenEdit}
                            onOpenCustomer={openCustomer}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Yan panel — Otomasyon */}
          <div className="space-y-4">
            <AutomationCard />

            {/* AI Destekli Potansiyel Analizi */}
            <AiPanel />

            {/* Hızlı bilgiler */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-muted-foreground" />
                  Yaklaşan Hatırlatmalar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-72 overflow-y-auto custom-scroll">
                {allStatsTasks
                  .filter((t) => t.status === 'acik' && t.reminderTime)
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .slice(0, 6)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleOpenEdit(t)}
                    >
                      <BellRing className={cn(
                        'w-3.5 h-3.5 mt-0.5 shrink-0',
                        isOverdue(t) ? 'text-red-500' : 'text-amber-500',
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{t.title}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(t.dueDate)} · {t.reminderTime}
                        </div>
                      </div>
                    </div>
                  ))}
                {allStatsTasks.filter((t) => t.status === 'acik' && t.reminderTime).length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Hatırlatmalı görev yok.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Son tamamlananlar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  Son Tamamlananlar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-72 overflow-y-auto custom-scroll">
                {allStatsTasks
                  .filter((t) => t.status === 'tamamlandi' && t.completedAt)
                  .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
                  .slice(0, 6)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleOpenEdit(t)}
                    >
                      <AvatarFor name={t.assignee?.name} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate line-through text-muted-foreground">{t.title}</div>
                        <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                          {t.assignee?.name ?? '—'} · {formatRelative(t.completedAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                {allStatsTasks.filter((t) => t.status === 'tamamlandi').length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Henüz tamamlanan görev yok.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Add dialog */}
        <TaskFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          defaultAssigneeId={user?.id ?? ''}
          users={users}
        />

        {/* Edit dialog */}
        <TaskFormDialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o)
            if (!o) setEditTask(null)
          }}
          mode="edit"
          initialTask={editTask ?? undefined}
          defaultAssigneeId={user?.id ?? ''}
          users={users}
        />
      </div>
    </TooltipProvider>
  )
}
