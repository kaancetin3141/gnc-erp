'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete, qk } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import type { Customer, Contact, Activity, Note, Deal, Task, SessionUser, UserListItem } from '@/types'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { PhotoUpload } from '@/components/ui/photo-upload'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  ArrowLeft, Phone, Mail, MessageCircle, StickyNote, Plus, Pencil,
  MapPin, Star, Crown, ShieldCheck, ShieldAlert, Calendar, Clock,
  TrendingUp, Users, CheckSquare, FileText, MoreVertical, Trash2,
  Pin, PinOff, ExternalLink, Globe, Building2, User, RefreshCw,
  CheckCircle2, XCircle, PauseCircle, PhoneCall,
  MapPinned, Receipt, Printer, HandCoins, AlertTriangle,
} from 'lucide-react'
import {
  SECTORS, CITIES, SEGMENTS, CUSTOMER_STATUS, CUSTOMER_SOURCES,
  ACTIVITY_TYPES, ACTIVITY_OUTCOMES, DEAL_STAGES, TASK_PRIORITIES,
  TASK_STATUSES, CURRENCIES, TAG_COLOR_CLASSES, getLabel, getColor,
} from '@/lib/constants'
import {
  formatPhone, whatsappLink, telLink, formatCurrency, formatRelative,
  formatDate, formatDateTime, daysSince, initials, getActivityStatusColor,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { toTry, overdueDays, useFxRates } from '@/components/erp/parts/invoice-utils'
import { TemplatePickerDialog } from '@/components/settings/template-picker-dialog'
import { WhatsAppQuickComposer } from '@/components/whatsapp/quick-composer-dialog'
import { AiActivitySummaryCard } from '@/components/ai/ai-insights-cards'
import {
  CUSTOMER_TYPES, CustomerTypeBadge, type CustomerTypeKey,
} from '@/components/admin/customer-type-badge'

// ---- Tipler ----
interface Customer360Data extends Customer {
  contacts: Contact[]
  activities: Activity[]
  notes: Note[]
  deals: Deal[]
  tasks: Task[]
}
interface UsersResponse {
  items: UserListItem[]
  total: number
}

// ---- Aktivite ikon eşlemesi ----
const ACTIVITY_ICON_MAP: Record<string, typeof Phone> = {
  arama: PhoneCall, toplanti: Users, email: Mail, whatsapp: MessageCircle,
  not: StickyNote, ziyaret: MapPin, gorev: CheckSquare,
}
const ACTIVITY_ICON_COLORS: Record<string, string> = {
  arama: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
  toplanti: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40',
  email: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40',
  whatsapp: 'text-green-600 bg-green-50 dark:bg-green-950/40',
  not: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  ziyaret: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40',
  gorev: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
}
const OUTCOME_BADGE: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  basarili: { color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40', icon: CheckCircle2, label: 'Başarılı' },
  basarisiz: { color: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950/40', icon: XCircle, label: 'Başarısız' },
  ertelendi: { color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40', icon: PauseCircle, label: 'Ertelendi' },
  callback: { color: 'text-sky-600 bg-sky-50 border-sky-200 dark:bg-sky-950/40', icon: PhoneCall, label: 'Geri Aranacak' },
}

// =========================================================
//   AKTİVİTE EKLEME DIALOG
// =========================================================
function ActivityDialog({
  open, onOpenChange, customerId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  customerId: string
}) {
  const qc = useQueryClient()
  const [type, setType] = useState('arama')
  const [subject, setSubject] = useState('')
  const [detail, setDetail] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [duration, setDuration] = useState('15')
  const [outcome, setOutcome] = useState('basarili')
  const [submitting, setSubmitting] = useState(false)

  // Reset when opening
  useEffect(() => {
    if (open) {
      setType('arama'); setSubject(''); setDetail('')
      setDate(new Date().toISOString().slice(0, 16))
      setDuration('15'); setOutcome('basarili')
    }
  }, [open])

  const submit = async () => {
    if (!subject.trim()) {
      toast.error('Konu gerekli')
      return
    }
    setSubmitting(true)
    try {
      await apiPost(`/api/customers/${customerId}/activities`, {
        type, subject: subject.trim(), detail: detail.trim() || null,
        date: new Date(date).toISOString(),
        durationMin: parseInt(duration) || 0, outcome,
      })
      toast.success('Aktivite eklendi')
      qc.invalidateQueries({ queryKey: qk.customer(customerId) })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aktivite Ekle</DialogTitle>
          <DialogDescription>Bu müşteri için yeni bir aktivite kaydı oluşturun</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tip</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sonuç</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Konu *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Örn. Fiyat teklifi görüşmesi" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Detay</Label>
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder="Aktivite detayları..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tarih & Saat</Label>
              <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Süre (dk)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={0} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>İptal</Button>
          <Button onClick={submit} disabled={submitting || !subject.trim()}>
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =========================================================
//   FIRSAT EKLEME DIALOG
// =========================================================
function DealDialog({
  open, onOpenChange, customerId, defaultOwnerId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  customerId: string
  defaultOwnerId?: string
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('TRY')
  const [stage, setStage] = useState('yeni')
  const [probability, setProbability] = useState('10')
  const [expectedCloseDate, setExpectedCloseDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(''); setValue(''); setCurrency('TRY'); setStage('yeni')
      setProbability('10'); setExpectedCloseDate('')
    }
  }, [open])

  // Sahne → olasılık senkronizasyonu
  useEffect(() => {
    const s = DEAL_STAGES.find((x) => x.value === stage)
    if (s) setProbability(String(s.probability))
  }, [stage])

  const submit = async () => {
    if (!title.trim()) { toast.error('Fırsat başlığı gerekli'); return }
    setSubmitting(true)
    try {
      await apiPost('/api/deals', {
        title: title.trim(),
        customerId,
        value: parseFloat(value) || 0,
        currency,
        stage,
        probability: parseInt(probability) || 0,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate).toISOString() : null,
        ownerId: defaultOwnerId || null,
      })
      toast.success('Fırsat oluşturuldu')
      qc.invalidateQueries({ queryKey: qk.customer(customerId) })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni Fırsat</DialogTitle>
          <DialogDescription>Bu müşteri için yeni bir satış fırsatı açın</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Başlık *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Yıllık bakım sözleşmesi" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Değer</Label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Para Birimi</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Aşama</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Olasılık (%)</Label>
              <Input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tahmini Kapanış</Label>
            <Input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>İptal</Button>
          <Button onClick={submit} disabled={submitting || !title.trim()}>
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            Fırsat Aç
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =========================================================
//   GÖREV EKLEME DIALOG
// =========================================================
function TaskDialog({
  open, onOpenChange, customerId, users, defaultAssigneeId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  customerId: string
  users: UserListItem[]
  defaultAssigneeId?: string
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [priority, setPriority] = useState('orta')
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId || '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(''); setPriority('orta')
      const d = new Date(); d.setDate(d.getDate() + 1)
      setDueDate(d.toISOString().slice(0, 10))
      setAssigneeId(defaultAssigneeId || '')
    }
  }, [open, defaultAssigneeId])

  const submit = async () => {
    if (!title.trim()) { toast.error('Görev başlığı gerekli'); return }
    if (!dueDate) { toast.error('Bitiş tarihi gerekli'); return }
    setSubmitting(true)
    try {
      await apiPost('/api/tasks', {
        title: title.trim(),
        dueDate: new Date(dueDate).toISOString(),
        assigneeId: assigneeId || null,
        customerId,
        priority,
      })
      toast.success('Görev oluşturuldu')
      qc.invalidateQueries({ queryKey: qk.customer(customerId) })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Görev Oluştur</DialogTitle>
          <DialogDescription>Bu müşteri için yeni bir görev tanımlayın</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Başlık *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Teklif takip et" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Bitiş Tarihi *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Öncelik</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Atanan</Label>
            <Select value={assigneeId || '__me__'} onValueChange={(v) => setAssigneeId(v === '__me__' ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__me__">Bana ata</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>İptal</Button>
          <Button onClick={submit} disabled={submitting || !title.trim()}>
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =========================================================
//   KİŞİ EKLEME DIALOG
// =========================================================
function ContactDialog({
  open, onOpenChange, customerId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  customerId: string
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [isPrimary, setIsPrimary] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(''); setPosition(''); setEmail(''); setPhone(''); setPhoto(null); setIsPrimary(false)
    }
  }, [open])

  const submit = async () => {
    if (!name.trim()) { toast.error('Kişi adı gerekli'); return }
    setSubmitting(true)
    try {
      await apiPost(`/api/customers/${customerId}/contacts`, {
        name: name.trim(),
        position: position.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        photo,
        isPrimary,
      })
      toast.success('Kişi eklendi')
      qc.invalidateQueries({ queryKey: qk.customer(customerId) })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni Kişi</DialogTitle>
          <DialogDescription>Bu müşteri için yeni iletişim kişisi ekleyin</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex justify-center py-1">
            <PhotoUpload
              value={photo}
              onChange={setPhoto}
              label="Kişi Fotoğrafı"
              size="md"
              variant="avatar"
              placeholderIcon="user"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ad Soyad *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmet Yılmaz" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pozisyon</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Genel Müdür" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">E-posta</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ahmet@firma.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+90 532..." />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <Checkbox id="primary" checked={isPrimary} onCheckedChange={(v) => setIsPrimary(!!v)} />
            <Label htmlFor="primary" className="cursor-pointer text-sm">Birincil kişi olarak işaretle</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>İptal</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =========================================================
//   MÜŞTERİ DÜZENLEME DIALOG
// =========================================================
function EditCustomerDialog({
  open, onOpenChange, customer,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  customer: Customer360Data
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', sector: 'Diğer', segment: 'standart', city: '',
    phone: '', email: '', web: '', taxNumber: '',
    source: 'manuel', status: 'aktif', kvkkConsent: false, tags: '',
    address: '', logo: null as string | null,
    customerType: 'musteri' as CustomerTypeKey,
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && customer) {
      const tType = CUSTOMER_TYPES.find((t) => t.value === customer.customerType)?.value ?? 'musteri'
      setForm({
        name: customer.name || '',
        sector: customer.sector || 'Diğer',
        segment: customer.segment || 'standart',
        city: customer.city || '',
        phone: customer.phone || '',
        email: customer.email || '',
        web: customer.web || '',
        taxNumber: customer.taxNumber || '',
        source: customer.source || 'manuel',
        status: customer.status || 'aktif',
        kvkkConsent: customer.kvkkConsent || false,
        tags: Array.isArray(customer.tags) ? customer.tags.join(', ') : '',
        address: customer.address || '',
        logo: customer.logo ?? null,
        customerType: tType,
      })
    }
  }, [open, customer])

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Müşteri adı gerekli'); return }
    setSubmitting(true)
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      await apiPatch(`/api/customers/${customer.id}`, {
        name: form.name.trim(),
        sector: form.sector,
        segment: form.segment,
        city: form.city || null,
        phone: form.phone || null,
        email: form.email || null,
        web: form.web || null,
        taxNumber: form.taxNumber || null,
        source: form.source,
        status: form.status,
        kvkkConsent: form.kvkkConsent,
        tags,
        address: form.address || null,
        logo: form.logo,
        customerType: form.customerType,
      })
      toast.success('Müşteri güncellendi')
      qc.invalidateQueries({ queryKey: qk.customer(customer.id) })
      qc.invalidateQueries({ queryKey: ['customers'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle>Müşteri Düzenle</DialogTitle>
          <DialogDescription>{customer.name} bilgilerini güncelleyin</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="sm:col-span-2 flex justify-center py-1">
            <PhotoUpload
              value={form.logo}
              onChange={(v) => setForm((f) => ({ ...f, logo: v }))}
              label="Firma Logosu"
              size="md"
              variant="logo"
              placeholderIcon="building"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Müşteri Adı *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Sektör</Label>
            <Select value={form.sector} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Segment</Label>
            <Select value={form.segment} onValueChange={(v) => setForm((f) => ({ ...f, segment: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Müşteri Türü</Label>
            <Select
              value={form.customerType}
              onValueChange={(v) => setForm((f) => ({ ...f, customerType: v as CustomerTypeKey }))}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Tür seçin" /></SelectTrigger>
              <SelectContent>
                {CUSTOMER_TYPES.map((t) => {
                  const Icon = t.icon
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        {t.emoji} {t.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Şehir</Label>
            <Select value={form.city || '__none__'} onValueChange={(v) => setForm((f) => ({ ...f, city: v === '__none__' ? '' : v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Seçilmedi —</SelectItem>
                {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kaynak</Label>
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CUSTOMER_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>E-posta</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Web</Label>
            <Input value={form.web} onChange={(e) => setForm((f) => ({ ...f, web: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Vergi / TC No</Label>
            <Input value={form.taxNumber} onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Durum</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CUSTOMER_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Adres</Label>
            <Textarea rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Etiketler</Label>
            <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="virgülle ayırın" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <Checkbox id="kvkk2" checked={form.kvkkConsent} onCheckedChange={(v) => setForm((f) => ({ ...f, kvkkConsent: !!v }))} />
            <Label htmlFor="kvkk2" className="cursor-pointer font-medium">KVKK Aydınlatma Onayı</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>İptal</Button>
          <Button onClick={submit} disabled={submitting || !form.name.trim()}>
            {submitting && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            Güncelle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =========================================================
//   TIMELINE (Zaman Çizelgesi)
// =========================================================
function TimelineTab({
  customer, onAdd,
}: {
  customer: Customer360Data
  onAdd: () => void
}) {
  const activities = customer.activities ?? []
  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
          <Clock className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground">Henüz aktivite kaydı yok</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> İlk Aktivite
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Aktivite Ekle
        </Button>
      </div>
      <div className="relative pl-8">
        {/* Dikey çizgi */}
        <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-emerald-200 via-slate-200 to-transparent dark:from-emerald-900 dark:via-slate-800" />
        {activities.map((act, idx) => {
          const Icon = ACTIVITY_ICON_MAP[act.type] ?? Phone
          const iconColor = ACTIVITY_ICON_COLORS[act.type] ?? 'text-slate-600 bg-slate-50'
          const out = act.outcome ? OUTCOME_BADGE[act.outcome] : null
          return (
            <div key={act.id} className="relative pb-5 last:pb-0">
              {/* Nokta/ikon */}
              <div className={cn(
                'absolute -left-7 top-1 w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-background',
                iconColor,
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <Card className={cn('hover:shadow-sm transition-shadow', idx === 0 && 'border-emerald-200 dark:border-emerald-900')}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{act.subject}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {getLabel(ACTIVITY_TYPES, act.type)}
                        </Badge>
                        {out && (
                          <Badge variant="outline" className={cn('text-[10px] px-1.5', out.color)}>
                            <out.icon className="w-3 h-3 mr-1" />
                            {out.label}
                          </Badge>
                        )}
                      </div>
                      {act.detail && (
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{act.detail}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(act.date)}
                        </span>
                        {act.durationMin > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {act.durationMin} dk
                          </span>
                        )}
                        {act.user?.name && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {act.user.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =========================================================
//   DEALS (Fırsatlar)
// =========================================================
function DealsTab({
  customer, onAdd,
}: {
  customer: Customer360Data
  onAdd: () => void
}) {
  const deals = customer.deals ?? []
  if (deals.length === 0) {
    return (
      <div className="text-center py-10">
        <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">Bu müşteri için açık fırsat yok</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Fırsat Aç
        </Button>
      </div>
    )
  }
  const totalValue = deals
    .filter((d) => d.stage !== 'kaybedildi')
    .reduce((sum, d) => sum + d.value, 0)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Toplam potansiyel:</span>
          <span className="font-bold text-emerald-600">{formatCurrency(totalValue, 'TRY')}</span>
          <span className="text-muted-foreground text-xs">({deals.length} fırsat)</span>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Fırsat Aç
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {deals.map((d) => {
          const stageColor = getColor(DEAL_STAGES, d.stage)
          return (
            <Card key={d.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{d.title}</div>
                    <div className="text-lg font-bold mt-1">{formatCurrency(d.value, d.currency)}</div>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 shrink-0', stageColor)}>
                    {getLabel(DEAL_STAGES, d.stage)}
                  </Badge>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Olasılık</span>
                    <span className="font-medium">{d.probability}%</span>
                  </div>
                  <Progress value={d.probability} className="h-1.5" />
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
                  {d.expectedCloseDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(d.expectedCloseDate)}
                    </span>
                  )}
                  {d.owner?.name && (
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {d.owner.name}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// =========================================================
//   CONTACTS (Kişiler)
// =========================================================
function ContactsTab({
  customer, onAdd,
}: {
  customer: Customer360Data
  onAdd: () => void
}) {
  const qc = useQueryClient()
  const contacts = customer.contacts ?? []

  const deleteContact = async (contactId: string) => {
    try {
      await apiDelete(`/api/customers/${customer.id}/contacts?contactId=${contactId}`)
      toast.success('Kişi silindi')
      qc.invalidateQueries({ queryKey: qk.customer(customer.id) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Kişi Ekle
        </Button>
      </div>
      {contacts.length === 0 ? (
        <div className="text-center py-10">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Kayıtlı kişi yok</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Kişi</TableHead>
                <TableHead className="hidden sm:table-cell">Pozisyon</TableHead>
                <TableHead className="hidden md:table-cell">E-posta</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead className="text-right pr-4">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        {c.photo && <AvatarImage src={c.photo} alt={c.name} />}
                        <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {initials(c.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          {c.name}
                          {c.isPrimary && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>Birincil kişi</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground sm:hidden">{c.position || '—'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{c.position || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-sky-600 hover:underline inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span className="truncate max-w-[160px]">{c.email}</span>
                      </a>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.phone ? (
                      <a href={telLink(c.phone)} className="text-emerald-600 hover:underline inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {formatPhone(c.phone)}
                      </a>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.phone && (
                          <DropdownMenuItem asChild>
                            <a href={telLink(c.phone)}><Phone className="w-3.5 h-3.5 mr-2" /> Ara</a>
                          </DropdownMenuItem>
                        )}
                        {c.phone && (
                          <DropdownMenuItem asChild>
                            <a href={whatsappLink(c.phone)} target="_blank" rel="noreferrer">
                              <MessageCircle className="w-3.5 h-3.5 mr-2" /> WhatsApp
                            </a>
                          </DropdownMenuItem>
                        )}
                        {c.email && (
                          <DropdownMenuItem asChild>
                            <a href={`mailto:${c.email}`}><Mail className="w-3.5 h-3.5 mr-2" /> E-posta</a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => deleteContact(c.id)}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// =========================================================
//   TASKS (Görevler)
// =========================================================
function TasksTab({
  customer, onAdd,
}: {
  customer: Customer360Data
  onAdd: () => void
}) {
  const tasks = customer.tasks ?? []
  if (tasks.length === 0) {
    return (
      <div className="text-center py-10">
        <CheckSquare className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">Bu müşteri için görev yok</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Görev Oluştur
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1.5" /> Görev Oluştur
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {tasks.map((t) => {
          const prioColor = getColor(TASK_PRIORITIES, t.priority)
          const stColor = getColor(TASK_STATUSES, t.status)
          const dueDate = new Date(t.dueDate)
          const overdue = t.status === 'acik' && dueDate.getTime() < Date.now()
          return (
            <Card key={t.id} className={cn('hover:shadow-sm transition-shadow', overdue && 'border-red-300 dark:border-red-900')}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className={cn('w-1 self-stretch rounded-full',
                    t.priority === 'acil' ? 'bg-red-500' :
                    t.priority === 'yuksek' ? 'bg-amber-500' :
                    t.priority === 'orta' ? 'bg-sky-500' : 'bg-gray-400')}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-medium truncate', t.status === 'tamamlandi' && 'line-through text-muted-foreground')}>
                        {t.title}
                      </span>
                      {t.status === 'tamamlandi' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline" className={cn('text-[10px] px-1.5', prioColor)}>
                        {getLabel(TASK_PRIORITIES, t.priority)}
                      </Badge>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5', stColor)}>
                        {getLabel(TASK_STATUSES, t.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className={cn('inline-flex items-center gap-1', overdue && 'text-red-600 font-medium')}>
                        <Calendar className="w-3 h-3" />
                        {formatDate(t.dueDate)}
                        {overdue && ' (Gecikmiş)'}
                      </span>
                      {t.assignee?.name && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {t.assignee.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// =========================================================
//   FILES (Dosyalar) — Functional attachment upload/list/delete
// =========================================================
interface Attachment {
  id: string
  customerId: string
  fileName: string
  fileType: string
  fileSize: number
  url: string
  uploadedBy: string | null
  createdAt: string
}

const FILE_ICONS: Record<string, string> = {
  'image/': '🖼️',
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument': '📝',
  'application/vnd.ms-excel': '📊',
  'application/zip': '🗜️',
  'text/': '📃',
}

function getFileIcon(fileType: string): string {
  for (const [prefix, icon] of Object.entries(FILE_ICONS)) {
    if (fileType.startsWith(prefix)) return icon
  }
  return '📎'
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 10) / 10} ${sizes[i]}`
}

function FilesTab({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const { data: attachments = [], isLoading } = useQuery<Attachment[]>({
    queryKey: ['attachments', customerId],
    queryFn: () => apiGet(`/api/customers/${customerId}/attachments`),
  })

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    // 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya çok büyük', { description: 'Maksimum 5MB yükleyebilirsiniz' })
      return
    }
    setUploading(true)
    try {
      // Convert to base64 data URL
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        try {
          await apiPost(`/api/customers/${customerId}/attachments`, {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            url: dataUrl,
          })
          toast.success('Dosya yüklendi', { description: file.name })
          queryClient.invalidateQueries({ queryKey: ['attachments', customerId] })
        } catch (e) {
          toast.error('Yükleme başarısız', { description: e instanceof Error ? e.message : '' })
        } finally {
          setUploading(false)
        }
      }
      reader.onerror = () => {
        toast.error('Dosya okunamadı')
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (e) {
      toast.error('Yükleme başarısız')
      setUploading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      await apiDelete(`/api/attachments/${id}`)
      toast.success('Dosya silindi', { description: name })
      queryClient.invalidateQueries({ queryKey: ['attachments', customerId] })
    } catch (e) {
      toast.error('Silme başarısız')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <Card
        className={`border-2 border-dashed transition-all cursor-pointer ${
          dragOver ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-border hover:border-emerald-300'
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <CardContent className="p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          />
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
            {uploading ? (
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileText className="w-6 h-6 text-emerald-600" />
            )}
          </div>
          <h3 className="font-medium text-sm">
            {uploading ? 'Yükleniyor...' : 'Dosya yüklemek için tıkla veya sürükle'}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, Görsel, Word, Excel · Maks 5MB
          </p>
        </CardContent>
      </Card>

      {/* Attachments list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : attachments.length === 0 ? (
        <div className="py-8 text-center">
          <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Henüz dosya yok</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Sözleşme, teklif, fatura ve belgeleri buraya yükleyin
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <Card key={att.id} className="hover:shadow-sm transition-shadow group">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl shrink-0">
                  {getFileIcon(att.fileType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{att.fileName}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{formatFileSize(att.fileSize)}</span>
                    <span>·</span>
                    <span>{new Date(att.createdAt).toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); setPreviewUrl(att.url) }}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Önizle</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); handleDelete(att.id, att.fileName) }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sil</TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      {previewUrl && (
        <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null) }}>
          <DialogContent className="sm:max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Dosya Önizleme</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center max-h-[60vh] overflow-auto">
              {previewUrl.startsWith('data:image/') ? (
                <img src={previewUrl} alt="Önizleme" className="max-w-full max-h-[60vh] object-contain" />
              ) : previewUrl.startsWith('data:application/pdf') ? (
                <iframe src={previewUrl} className="w-full h-[60vh]" title="PDF Önizleme" />
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Bu dosya türü tarayıcıda önizlenemez</p>
                  <Button asChild className="mt-3" size="sm">
                    <a href={previewUrl} download>İndir</a>
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// =========================================================
//   MAP (Harita) — SVG tabanlı görsel placeholder
// =========================================================
function MapTab({ customer }: { customer: Customer360Data }) {
  const hasCoords = customer.lat !== null && customer.lng !== null
  // Türkiye merkezi yaklaşık: 39.0 N, 35.0 E
  // Lat/Lng → SVG koordinat (basit lineer transform)
  const projectLat = (lat: number) => {
    // Türkiye lat aralığı ~36-42
    const minLat = 35.5, maxLat = 42.5
    return 100 - ((lat - minLat) / (maxLat - minLat)) * 100
  }
  const projectLng = (lng: number) => {
    // Türkiye lng aralığı ~26-45
    const minLng = 25, maxLng = 45
    return ((lng - minLng) / (maxLng - minLng)) * 100
  }

  if (!hasCoords) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
            <MapPin className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <h3 className="font-semibold">Konum bilgisi yok</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Bu müşteri için enlem/boylam bilgisi tanımlı değil. Müşteriyi düzenleyerek
            konum ekleyebilirsiniz.
          </p>
        </CardContent>
      </Card>
    )
  }

  const x = projectLng(customer.lng as number)
  const y = projectLat(customer.lat as number)
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPinned className="w-4 h-4 text-emerald-600" />
            Müşteri Konumu
          </CardTitle>
          {customer.city && (
            <Badge variant="outline" className="text-xs">
              <MapPin className="w-3 h-3 mr-1" />
              {customer.city}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border bg-gradient-to-br from-emerald-50 via-sky-50 to-slate-100 dark:from-emerald-950/30 dark:via-sky-950/30 dark:to-slate-900">
          {/* SVG: Türkiye silüeti (basitleştirilmiş) */}
          <svg
            viewBox="0 0 100 75"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Grid */}
            <defs>
              <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M 5 0 L 0 0 0 5" fill="none" stroke="currentColor" strokeWidth="0.1" className="text-slate-300 dark:text-slate-700" />
              </pattern>
            </defs>
            <rect width="100" height="75" fill="url(#grid)" />
            {/* Türkiye silüeti (basit) */}
            <path
              d="M 15 30 Q 20 25 28 26 L 38 24 Q 45 22 55 24 L 70 25 Q 80 27 88 32 L 92 38 Q 90 42 85 43 L 75 42 L 65 44 Q 55 46 45 45 L 35 47 Q 25 48 18 45 Q 12 40 15 30 Z"
              fill="currentColor"
              className="text-emerald-100 dark:text-emerald-900/30"
              stroke="currentColor"
              strokeWidth="0.3"
            />
            {/* Pin */}
            <g transform={`translate(${x}, ${y * 0.75})`}>
              <circle r="2" className="fill-emerald-500/30 animate-ping" />
              <circle r="1.2" className="fill-emerald-600" />
              <circle r="0.5" className="fill-white" />
            </g>
            {/* Pin label */}
            <g transform={`translate(${x}, ${y * 0.75})`}>
              <text
                x="2.5" y="1"
                className="fill-emerald-700 dark:fill-emerald-300 font-semibold"
                fontSize="2"
              >
                {customer.city || customer.name}
              </text>
            </g>
          </svg>
          {/* Koordinat etiketi */}
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm border text-[10px] font-mono">
            {customer.lat?.toFixed(4)}, {customer.lng?.toFixed(4)}
          </div>
          {/* Ölçek */}
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-background/80 backdrop-blur-sm border text-[10px] text-muted-foreground">
            Türkiye · Yaklaşık
          </div>
        </div>
        {customer.address && (
          <div className="mt-3 flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-muted-foreground">{customer.address}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// =========================================================
//   ANA BİLEŞEN — Customer360
// =========================================================
export function Customer360() {
  // Canlı döviz kuru — toTry hesapları bu veriyle güncellenir
  useFxRates()
  const { user, setView, selectedCustomerId } = useAppStore()
  const [tab, setTab] = useState('timeline')
  const [activityOpen, setActivityOpen] = useState(false)
  const [dealOpen, setDealOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // PRIVACY-TEMPLATES (#4): şablon seçici dialog durumları
  const [waTemplateOpen, setWaTemplateOpen] = useState(false)
  const [waComposerOpen, setWaComposerOpen] = useState(false)
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  const { data: customer, isLoading } = useQuery({
    queryKey: qk.customer(selectedCustomerId || ''),
    queryFn: () => apiGet<Customer360Data>(`/api/customers/${selectedCustomerId}`),
    enabled: !!selectedCustomerId,
  })

  const { data: usersData } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<UsersResponse>('/api/users'),
  })

  // "Not Ekle" hızlı eylem → notes sekmesi + focus
  const focusNotes = () => {
    setTab('notes')
    setTimeout(() => {
      noteInputRef.current?.focus()
      noteInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  if (!selectedCustomerId) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Müşteri seçilmedi</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setView('customers')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Müşteri Listesine Dön
        </Button>
      </div>
    )
  }

  if (isLoading || !customer) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-9 w-full" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </div>
    )
  }

  const canEdit = hasPermission(user as SessionUser | null, 'customers.edit')
  const daysSinceActivity = daysSince(customer.lastActivityAt)
  const activityStatus = getActivityStatusColor(daysSinceActivity)
  const segColor = getColor(SEGMENTS, customer.segment)
  const stColor = getColor(CUSTOMER_STATUS, customer.status)

  const waText = `Merhaba ${customer.name},`
  const tagColorList = ['emerald', 'amber', 'violet', 'sky', 'rose', 'teal']

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Geri butonu */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setView('customers')}
        className="text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Müşteri Listesi
      </Button>

      {/* Üst header kartı */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            {/* Sol: Kimlik + rozetler */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
              {customer.logo ? (
                 
                <img
                  src={customer.logo}
                  alt={customer.name}
                  className="w-12 h-12 rounded-xl object-cover border border-border shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
              )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl lg:text-2xl font-bold tracking-tight break-words">{customer.name}</h1>
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditOpen(true)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5', stColor)}>
                      {getLabel(CUSTOMER_STATUS, customer.status)}
                    </Badge>
                    <Badge variant="outline" className={cn('text-[10px] px-1.5', segColor)}>
                      {customer.segment === 'vip' && <Crown className="w-3 h-3 mr-1" />}
                      {getLabel(SEGMENTS, customer.segment)}
                    </Badge>
                    <CustomerTypeBadge type={customer.customerType} />
                    <Badge variant="outline" className="text-[10px] px-1.5 text-slate-600 bg-slate-50 border-slate-200">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {getLabel(CUSTOMER_SOURCES, customer.source)}
                    </Badge>
                    {customer.kvkkConsent ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[10px] px-1.5 text-emerald-600 bg-emerald-50 border-emerald-200">
                            <ShieldCheck className="w-3 h-3 mr-1" /> KVKK
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>KVKK onayı alınmış{customer.kvkkConsentAt ? ` · ${formatDate(customer.kvkkConsentAt)}` : ''}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[10px] px-1.5 text-amber-600 bg-amber-50 border-amber-200">
                            <ShieldAlert className="w-3 h-3 mr-1" /> KVKK Yok
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>KVKK onayı alınmamış</TooltipContent>
                      </Tooltip>
                    )}
                    {customer.sector && (
                      <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">
                        {customer.sector}
                      </Badge>
                    )}
                  </div>
                  {/* Etiketler */}
                  {Array.isArray(customer.tags) && customer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {customer.tags.map((t, i) => (
                        <span
                          key={t + i}
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border',
                            TAG_COLOR_CLASSES[tagColorList[i % tagColorList.length]] || TAG_COLOR_CLASSES.gray,
                          )}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sorumlu + iletişim durumu */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {initials(customer.owner?.name || user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">Sorumlu</div>
                    <div className="text-xs font-medium truncate">{customer.owner?.name || 'Atanmamış'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Son İletişim</div>
                  <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-1.5 py-0.5 rounded', activityStatus.bg, activityStatus.color)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', activityStatus.color.replace('text-', 'bg-'))} />
                    {customer.lastActivityAt ? `${daysSinceActivity} gün önce` : 'Yok'}
                  </div>
                </div>
                {customer.phone && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">Telefon</div>
                    <a href={telLink(customer.phone)} className="text-xs font-medium text-emerald-600 hover:underline truncate block">
                      {formatPhone(customer.phone)}
                    </a>
                  </div>
                )}
                {customer.email && (
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">E-posta</div>
                    <a href={`mailto:${customer.email}`} className="text-xs font-medium text-sky-600 hover:underline truncate block">
                      {customer.email}
                    </a>
                  </div>
                )}
              </div>

              {/* Alt detaylar */}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                {customer.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {customer.city}
                  </span>
                )}
                {customer.web && (
                  <a href={customer.web.startsWith('http') ? customer.web : `https://${customer.web}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    <Globe className="w-3 h-3" /> {customer.web}
                  </a>
                )}
                {customer.taxNumber && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {customer.taxNumber}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Kayıt: {formatDate(customer.createdAt)}
                </span>
              </div>
            </div>

            {/* Sağ: Hızlı aksiyonlar */}
            <div className="flex flex-wrap gap-2 lg:flex-col lg:w-auto">
              {customer.phone && (
                <>
                  <Button size="sm" asChild>
                    <a href={telLink(customer.phone)}>
                      <Phone className="w-4 h-4 mr-1.5" /> Ara
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setWaComposerOpen(true)}>
                    <MessageCircle className="w-4 h-4 mr-1.5 text-green-600" /> WhatsApp
                  </Button>
                  {/* PRIVACY-TEMPLATES (#4): şablon seçerek WhatsApp gönder */}
                  <Button size="sm" variant="outline" onClick={() => setWaTemplateOpen(true)}>
                    <FileText className="w-4 h-4 mr-1.5 text-emerald-600" /> Şablonlu WhatsApp
                  </Button>
                </>
              )}
              {customer.email && (
                <>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`mailto:${customer.email}`}>
                      <Mail className="w-4 h-4 mr-1.5 text-sky-600" /> E-posta
                    </a>
                  </Button>
                  {/* PRIVACY-TEMPLATES (#4): şablon seçerek e-posta gönder */}
                  <Button size="sm" variant="outline" onClick={() => setEmailTemplateOpen(true)}>
                    <FileText className="w-4 h-4 mr-1.5 text-sky-600" /> Şablonlu E-posta
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={focusNotes}>
                <StickyNote className="w-4 h-4 mr-1.5 text-amber-600" /> Not Ekle
              </Button>
              {hasPermission(user as SessionUser | null, 'tasks.manage') && (
                <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                  <CheckSquare className="w-4 h-4 mr-1.5 text-indigo-600" /> Görev Oluştur
                </Button>
              )}
              {hasPermission(user as SessionUser | null, 'deals.manage') && (
                <Button size="sm" variant="outline" onClick={() => setDealOpen(true)}>
                  <TrendingUp className="w-4 h-4 mr-1.5 text-emerald-600" /> Fırsat Aç
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-fit">
            <TabsTrigger value="timeline" className="text-xs sm:text-sm">
              <Clock className="w-3.5 h-3.5 mr-1" /> Zaman Çizelgesi
              {customer.activities?.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({customer.activities.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs sm:text-sm">
              <StickyNote className="w-3.5 h-3.5 mr-1" /> Notlar
              {customer.notes?.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({customer.notes.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="deals" className="text-xs sm:text-sm">
              <TrendingUp className="w-3.5 h-3.5 mr-1" /> Fırsatlar
              {customer.deals?.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({customer.deals.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="contacts" className="text-xs sm:text-sm">
              <Users className="w-3.5 h-3.5 mr-1" /> Kişiler
              {customer.contacts?.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({customer.contacts.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs sm:text-sm">
              <CheckSquare className="w-3.5 h-3.5 mr-1" /> Görevler
              {customer.tasks?.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({customer.tasks.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="files" className="text-xs sm:text-sm">
              <FileText className="w-3.5 h-3.5 mr-1" /> Dosyalar
            </TabsTrigger>
            <TabsTrigger value="quotes" className="text-xs sm:text-sm">
              <Receipt className="w-3.5 h-3.5 mr-1" /> Teklifler
            </TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs sm:text-sm">
              <FileText className="w-3.5 h-3.5 mr-1" /> Faturalar
            </TabsTrigger>
            <TabsTrigger value="map" className="text-xs sm:text-sm">
              <MapPin className="w-3.5 h-3.5 mr-1" /> Harita
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="timeline" className="mt-3">
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-4">
                  <TimelineTab customer={customer} onAdd={() => setActivityOpen(true)} />
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <AiActivitySummaryCard customerId={customer.id} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="notes" className="mt-3">
          <Card>
            <CardContent className="p-4">
              {/* Burada not input'unun referansı için bir wrapper */}
              <NotesTabWithRef customer={customer} noteInputRef={noteInputRef} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="deals" className="mt-3">
          <Card>
            <CardContent className="p-4">
              <DealsTab customer={customer} onAdd={() => setDealOpen(true)} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="contacts" className="mt-3">
          <Card>
            <CardContent className="p-4">
              <ContactsTab customer={customer} onAdd={() => setContactOpen(true)} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tasks" className="mt-3">
          <Card>
            <CardContent className="p-4">
              <TasksTab customer={customer} onAdd={() => setTaskOpen(true)} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="files" className="mt-3">
          <FilesTab customerId={selectedCustomerId} />
        </TabsContent>
        <TabsContent value="quotes" className="mt-3">
          <QuotesTab customerId={selectedCustomerId} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-3">
          <InvoicesTab customerId={selectedCustomerId} />
        </TabsContent>
        <TabsContent value="map" className="mt-3">
          <MapTab customer={customer} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ActivityDialog open={activityOpen} onOpenChange={setActivityOpen} customerId={customer.id} />
      <DealDialog open={dealOpen} onOpenChange={setDealOpen} customerId={customer.id} defaultOwnerId={customer.ownerId || user?.id} />
      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        customerId={customer.id}
        users={usersData?.items ?? []}
        defaultAssigneeId={user?.id}
      />
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} customerId={customer.id} />
      <EditCustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />

      {/* PRIVACY-TEMPLATES (#4): Şablon seçici dialoglar */}
      {waTemplateOpen && (
        <TemplatePickerDialog
          open
          onClose={() => setWaTemplateOpen(false)}
          type="whatsapp"
          customerName={customer.name}
          customerPhone={customer.phone}
          customerId={customer.id}
        />
      )}
      <WhatsAppQuickComposer
        open={waComposerOpen}
        onOpenChange={setWaComposerOpen}
        phone={customer.phone}
        defaultMessage={waText}
        customerId={customer.id}
        customerName={customer.name}
      />
      {emailTemplateOpen && (
        <TemplatePickerDialog
          open
          onClose={() => setEmailTemplateOpen(false)}
          type="email"
          customerName={customer.name}
          customerEmail={customer.email}
        />
      )}
    </div>
  )
}

// =========================================================
//   NotesTab + ref wrapper (dışarıdan focus için)
// =========================================================
function NotesTabWithRef({
  customer, noteInputRef,
}: {
  customer: Customer360Data
  noteInputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  // NotesTab içeride kendi textarea'ını kullanıyor; ref'i prop olarak iletelim
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const notes = customer.notes ?? []

  const addNote = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await apiPost(`/api/customers/${customer.id}/notes`, { content: content.trim() })
      toast.success('Not eklendi')
      setContent('')
      qc.invalidateQueries({ queryKey: qk.customer(customer.id) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePin = async (note: Note) => {
    try {
      await apiPatch(`/api/customers/${customer.id}/notes`, {
        noteId: note.id, isPinned: !note.isPinned, content: note.content,
      })
      toast.success(note.isPinned ? 'Not sabitlenmesi kaldırıldı' : 'Not sabitlendi')
      qc.invalidateQueries({ queryKey: qk.customer(customer.id) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    }
  }

  const deleteNote = async (noteId: string) => {
    try {
      await apiDelete(`/api/customers/${customer.id}/notes?noteId=${noteId}`)
      toast.success('Not silindi')
      qc.invalidateQueries({ queryKey: qk.customer(customer.id) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    }
  }

  return (
    <div className="space-y-3">
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-3">
          <Textarea
            ref={noteInputRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Yeni notunuzu buraya yazın... (Ctrl+Enter ile kaydet)"
            rows={3}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addNote()
            }}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted-foreground">
              {content.length > 0 && `${content.length} karakter`}
            </span>
            <Button size="sm" onClick={addNote} disabled={submitting || !content.trim()}>
              {submitting ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <StickyNote className="w-3.5 h-3.5 mr-1" />}
              Not Ekle
            </Button>
          </div>
        </CardContent>
      </Card>

      {notes.length === 0 ? (
        <div className="text-center py-10">
          <StickyNote className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Henüz not eklenmemiş</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <Card
              key={note.id}
              className={cn(
                'hover:shadow-sm transition-shadow',
                note.isPinned && 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900/50',
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Avatar className="w-5 h-5">
                        <AvatarFallback className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {initials(note.user?.name || '?')}
                        </AvatarFallback>
                      </Avatar>
                      <span>{note.user?.name || 'Bilinmiyor'}</span>
                      <span>·</span>
                      <span>{formatRelative(note.createdAt)}</span>
                      {note.isPinned && (
                        <Badge variant="outline" className="text-[9px] px-1 h-4 text-amber-600 border-amber-200">
                          <Pin className="w-2.5 h-2.5 mr-0.5" />Sabit
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => togglePin(note)}>
                          {note.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{note.isPinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-red-600" onClick={() => deleteNote(note.id)}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// =========================================================
//   QUOTES (Teklifler) — Customer's quotes tab
// =========================================================
interface QuoteItem {
  id: string
  number: string
  status: string
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  issueDate: string
  validUntil: string | null
  invoice: { id: string; number: string; status: string } | null
}

const QUOTE_STATUS_BADGES: Record<string, string> = {
  taslak: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300',
  gonderildi: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300',
  onaylandi: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  reddedildi: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300',
  faturalandi: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300',
}
const QUOTE_STATUS_LABELS: Record<string, string> = {
  taslak: 'Taslak', gonderildi: 'Gönderildi', onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi', faturalandi: 'Faturalandı',
}

function QuotesTab({ customerId }: { customerId: string }) {
  const { data: quotes = [], isLoading } = useQuery<QuoteItem[]>({
    queryKey: ['customer-quotes', customerId],
    queryFn: () => apiGet(`/api/quotes?customerId=${customerId}&limit=50`),
    select: (data: unknown) => (Array.isArray(data) ? data : (data as { items?: QuoteItem[] }).items ?? []),
  })

  const [printQuote, setPrintQuote] = useState<QuoteItem | null>(null)

  if (isLoading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
  }

  if (quotes.length === 0) {
    return (
      <div className="py-8 text-center">
        <Receipt className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Bu müşteri için teklif yok</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Teklifler modülünden yeni teklif oluşturun</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {quotes.map((q) => (
          <div key={q.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-mono">{q.number}</span>
                <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4.5', QUOTE_STATUS_BADGES[q.status] ?? '')}>
                  {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatDate(q.issueDate)}
                {q.validUntil ? ` · Geçerlilik: ${formatDate(q.validUntil)}` : ''}
                {q.invoice ? ` · ${q.invoice.number}` : ''}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold tabular-nums">{formatCurrency(q.total, q.currency)}</div>
              <div className="text-[10px] text-muted-foreground">KDV: {formatCurrency(q.taxTotal, q.currency)}</div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPrintQuote(q)}>
                  <Printer className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Önizle / Yazdır</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
      {printQuote && <PrintDocument type="quote" doc={printQuote} onClose={() => setPrintQuote(null)} />}
    </>
  )
}

// =========================================================
//   INVOICES (Faturalar) — Customer's invoices tab
// =========================================================
interface InvoiceItem {
  id: string
  number: string
  status: string
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  issueDate: string
  dueDate: string | null
  paidDate: string | null
  lines?: { id: string; description: string; qty: number; unitPrice: number; taxRate: number; lineTotal: number }[]
}

const INVOICE_STATUS_BADGES: Record<string, string> = {
  odeme_bekliyor: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  odendi: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  gecikti: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300',
  iptal: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300',
}
const INVOICE_STATUS_LABELS: Record<string, string> = {
  odeme_bekliyor: 'Ödeme Bekliyor', odendi: 'Ödendi', gecikti: 'Gecikti', iptal: 'İptal',
}

// =========================================================
//   COLLECTION SUMMARY — Müşteri bazlı tahsilat özeti kartı
// Faturalanan / tahsil edilen / bekleyen / geciken TRY bazlı
// toplamlar + tahsilat oranı çubuğu + en eski gecikme uyarısı
// =========================================================
function CollectionSummary({ invoices }: { invoices: InvoiceItem[] }) {
  const summary = useMemo(() => {
    const active = invoices.filter((i) => i.status !== 'iptal')
    const invoiced = active.reduce((s, i) => s + toTry(i.total, i.currency), 0)
    const collected = active
      .filter((i) => i.status === 'odendi')
      .reduce((s, i) => s + toTry(i.total, i.currency), 0)
    const pendingList = active.filter((i) => i.status === 'odeme_bekliyor' || i.status === 'gecikti')
    const pending = pendingList.reduce((s, i) => s + toTry(i.total, i.currency), 0)
    const overdueList = pendingList.filter((i) => overdueDays(i.dueDate) > 0)
    const overdue = overdueList.reduce((s, i) => s + toTry(i.total, i.currency), 0)
    // En eski gecikmiş fatura
    let oldest: { number: string; days: number } | null = null
    for (const i of overdueList) {
      const d = overdueDays(i.dueDate)
      if (!oldest || d > oldest.days) oldest = { number: i.number, days: d }
    }
    const rate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0
    return { count: active.length, invoiced, collected, pendingCount: pendingList.length, pending, overdueCount: overdueList.length, overdue, oldest, rate }
  }, [invoices])

  const fmt = (v: number) =>
    v >= 1000000
      ? `${(v / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} M ₺`
      : `${Math.round(v).toLocaleString('tr-TR')} ₺`

  const cells = [
    { label: 'Faturalanan', value: fmt(summary.invoiced), sub: `${summary.count} fatura`, cls: 'text-foreground' },
    { label: 'Tahsil Edilen', value: fmt(summary.collected), sub: `oran %${summary.rate}`, cls: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Bekleyen', value: fmt(summary.pending), sub: `${summary.pendingCount} fatura`, cls: 'text-amber-600 dark:text-amber-400' },
    { label: 'Geciken', value: fmt(summary.overdue), sub: `${summary.overdueCount} fatura`, cls: summary.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground' },
  ]

  return (
    <div className="rounded-lg border bg-gradient-to-r from-slate-50 to-emerald-50/40 dark:from-slate-900/40 dark:to-emerald-950/20 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
          <HandCoins className="w-4 h-4 text-white" />
        </div>
        <h4 className="text-sm font-semibold">Tahsilat Özeti</h4>
        <span className="text-[10px] text-muted-foreground ml-auto">TRY bazlı</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-background/80 dark:bg-background/40 border px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className={cn('text-sm font-bold tabular-nums truncate', c.cls)}>{c.value}</div>
            <div className="text-[10px] text-muted-foreground">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tahsilat oranı çubuğu */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>Tahsilat oranı</span>
          <span className="tabular-nums font-medium text-foreground">%{summary.rate}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', summary.rate >= 80 ? 'bg-emerald-500' : summary.rate >= 50 ? 'bg-amber-500' : 'bg-red-400')}
            style={{ width: `${Math.min(Math.max(summary.rate, 2), 100)}%` }}
            role="progressbar"
            aria-valuenow={summary.rate}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* En eski gecikme uyarısı */}
      {summary.oldest && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-md px-2 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          En eski gecikme: <span className="font-semibold font-mono">{summary.oldest.number}</span>
          <span className="tabular-nums font-semibold">{summary.oldest.days} gündür</span>
          <span className="text-muted-foreground">— Faturalar modülünden hatırlatma gönderebilirsiniz</span>
        </div>
      )}
    </div>
  )
}

function InvoicesTab({ customerId }: { customerId: string }) {
  const { data: invoices = [], isLoading } = useQuery<InvoiceItem[]>({
    queryKey: ['customer-invoices', customerId],
    queryFn: () => apiGet(`/api/invoices?customerId=${customerId}&limit=50`),
    select: (data: unknown) => (Array.isArray(data) ? data : (data as { items?: InvoiceItem[] }).items ?? []),
  })

  const [printInvoice, setPrintInvoice] = useState<InvoiceItem | null>(null)

  if (isLoading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
  }

  if (invoices.length === 0) {
    return (
      <div className="py-8 text-center">
        <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Bu müşteri için fatura yok</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Tekliften dönüştür veya Faturalar modülünden oluştur</p>
      </div>
    )
  }

  return (
    <>
      <CollectionSummary invoices={invoices} />
      <div className="space-y-2">
        {invoices.map((inv) => {
          const isOverdue = inv.status === 'odeme_bekliyor' && inv.dueDate && new Date(inv.dueDate) < new Date()
          return (
            <div key={inv.id} className={cn(
              'flex items-center gap-3 p-3 rounded-lg border transition-colors',
              isOverdue ? 'border-red-200 bg-red-50/30 dark:bg-red-950/10' : 'border-border hover:bg-muted/30',
            )}>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium font-mono">{inv.number}</span>
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4.5', INVOICE_STATUS_BADGES[inv.status] ?? '')}>
                    {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                  </Badge>
                  {isOverdue && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 bg-red-100 text-red-700 border-red-200">
                      Gecikmiş
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Düzenleme: {formatDate(inv.issueDate)}
                  {inv.dueDate ? ` · Vade: ${formatDate(inv.dueDate)}` : ''}
                  {inv.paidDate ? ` · Ödendi: ${formatDate(inv.paidDate)}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{formatCurrency(inv.total, inv.currency)}</div>
                <div className="text-[10px] text-muted-foreground">KDV: {formatCurrency(inv.taxTotal, inv.currency)}</div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPrintInvoice(inv)}>
                    <Printer className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Önizle / Yazdır</TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </div>
      {printInvoice && <PrintDocument type="invoice" doc={printInvoice} onClose={() => setPrintInvoice(null)} />}
    </>
  )
}

// =========================================================
//   PRINT DOCUMENT — Quote/Invoice preview & print
// =========================================================
function PrintDocument({ type, doc, onClose }: {
  type: 'quote' | 'invoice'
  doc: QuoteItem | InvoiceItem
  onClose: () => void
}) {
  const handlePrint = () => {
    window.print()
  }

  const title = type === 'quote' ? 'TEKLİF' : 'FATURA'
  const number = doc.number
  const date = formatDate(doc.issueDate)
  const customer = useAppStore.getState().user?.tenant.name ?? ''
  const lines = (doc as InvoiceItem).lines ?? []

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] print:max-w-none print:max-h-none print:p-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle>{type === 'quote' ? 'Teklif Önizleme' : 'Fatura Önizleme'}</DialogTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-1.5" /> Yazdır
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh] print:overflow-visible print:max-h-none">
          <div className="a4-page print-content">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 pb-4 border-b">
              <div>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-white text-lg mb-2">
                  G
                </div>
                <div className="font-bold text-lg">{customer}</div>
                <div className="text-xs text-gray-500">GNC CRM</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-emerald-700">{title}</div>
                <div className="text-sm font-mono mt-1">{number}</div>
                <div className="text-xs text-gray-500 mt-1">Tarih: {date}</div>
                {type === 'quote' && (doc as QuoteItem).validUntil && (
                  <div className="text-xs text-gray-500">Geçerlilik: {formatDate((doc as QuoteItem).validUntil!)}</div>
                )}
                {type === 'invoice' && (doc as InvoiceItem).dueDate && (
                  <div className="text-xs text-gray-500">Vade: {formatDate((doc as InvoiceItem).dueDate!)}</div>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="mb-6 flex items-center gap-2">
              <span className="text-xs text-gray-500">Durum:</span>
              <span className="text-sm font-medium">
                {type === 'quote'
                  ? (QUOTE_STATUS_LABELS[(doc as QuoteItem).status] ?? (doc as QuoteItem).status)
                  : (INVOICE_STATUS_LABELS[(doc as InvoiceItem).status] ?? (doc as InvoiceItem).status)}
              </span>
            </div>

            {/* Line items table */}
            {lines.length > 0 ? (
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 text-xs uppercase tracking-wider text-gray-500">Açıklama</th>
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Miktar</th>
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Birim Fiyat</th>
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">KDV</th>
                    <th className="text-right py-2 text-xs uppercase tracking-wider text-gray-500">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-gray-100">
                      <td className="py-2">{line.description}</td>
                      <td className="text-right py-2 tabular-nums">{line.qty}</td>
                      <td className="text-right py-2 tabular-nums">{formatCurrency(line.unitPrice, doc.currency)}</td>
                      <td className="text-right py-2 tabular-nums">%{line.taxRate}</td>
                      <td className="text-right py-2 tabular-nums font-medium">{formatCurrency(line.lineTotal, doc.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mb-6 p-4 bg-gray-50 rounded text-sm text-gray-500 text-center">
                Bu {type === 'quote' ? 'teklif' : 'fatura'} için satır detayı saklanmıyor.
              </div>
            )}

            {/* Totals */}
            <div className="ml-auto w-full max-w-xs space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Ara Toplam:</span>
                <span className="tabular-nums">{formatCurrency(doc.subtotal, doc.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">KDV Toplam:</span>
                <span className="tabular-nums">{formatCurrency(doc.taxTotal, doc.currency)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-gray-300">
                <span>Genel Toplam:</span>
                <span className="tabular-nums text-emerald-700">{formatCurrency(doc.total, doc.currency)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t text-xs text-gray-400 text-center">
              <p>Bu belge GNC CRM tarafından oluşturulmuştur · {formatDate(new Date())}</p>
              <p className="mt-1">© 2025 {customer}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
