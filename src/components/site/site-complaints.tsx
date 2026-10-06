'use client'

// ============================================================
// SITE — ARIZA / ŞİKAYET TALEP YÖNETİMİ (gelişmiş)
// — Öncelik + durum akışı (açık→inceleniyor→çözüldü/reddedildi)
// — Site personeline atama (otomatik durum ilerlemesi)
// — Tahmini/gerçek maliyet takibi + hedef tarih + gecikme vurgusu
// — Kategori rozetleri + öncelik sıralı liste + filtreler
// ============================================================

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, whatsappLink } from '@/lib/format'
import {
  Wrench, Plus, Filter, Phone, MessageCircle, CalendarClock, Wallet,
  UserCheck, CheckCircle2, XCircle, Droplets, Zap, ArrowDownUp, Shield, Sparkles,
  Volume2, SquareParking, MoreHorizontal, AlertOctagon, Clock,
} from 'lucide-react'

// ============================================================
// Tipler
// ============================================================

export interface ComplaintRow {
  id: string
  title: string
  description: string
  category: string
  status: 'acik' | 'inceleniyor' | 'cozuldu' | 'reddedildi'
  priority: 'dusuk' | 'normal' | 'yuksek' | 'acil'
  assignedStaffId: string | null
  assignedStaff?: { id: string; name: string; role: string; phone: string | null } | null
  estimatedCost: number | null
  actualCost: number | null
  dueDate: string | null
  resolvedAt: string | null
  response: string | null
  respondedAt: string | null
  createdAt: string
  resident?: { name: string; phone: string | null } | null
}

interface StaffRow {
  id: string
  name: string
  role: string
  phone: string | null
  isActive: boolean
}

const STATUS_META: Record<ComplaintRow['status'], { label: string; cls: string }> = {
  acik: { label: 'Açık', cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  inceleniyor: { label: 'İnceleniyor', cls: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
  cozuldu: { label: 'Çözüldü', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  reddedildi: { label: 'Reddedildi', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-900/60 dark:text-slate-400 dark:border-slate-700' },
}

const PRIORITY_META: Record<ComplaintRow['priority'], { label: string; cls: string; dot: string }> = {
  dusuk: { label: 'Düşük', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-900/60 dark:text-slate-400', dot: 'bg-slate-400' },
  normal: { label: 'Normal', cls: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300', dot: 'bg-sky-500' },
  yuksek: { label: 'Yüksek', cls: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300', dot: 'bg-orange-500' },
  acil: { label: 'Acil', cls: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300', dot: 'bg-red-500 animate-pulse' },
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Wrench }> = {
  su: { label: 'Su Tesisatı', icon: Droplets },
  elektrik: { label: 'Elektrik', icon: Zap },
  asansor: { label: 'Asansör', icon: ArrowDownUp },
  guvenlik: { label: 'Güvenlik', icon: Shield },
  temizlik: { label: 'Temizlik', icon: Sparkles },
  gurultu: { label: 'Gürültü', icon: Volume2 },
  park: { label: 'Otopark', icon: SquareParking },
  diger: { label: 'Diğer', icon: MoreHorizontal },
}

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============================================================
// Ana bileşen
// ============================================================

export function SiteComplaints({ siteId }: { siteId: string }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [detail, setDetail] = useState<ComplaintRow | null>(null)

  const { data: complaints = [], isLoading } = useQuery<ComplaintRow[]>({
    queryKey: ['complaints', siteId],
    queryFn: () => apiGet<ComplaintRow[]>(`/api/site/${siteId}/complaints`),
  })

  const { data: staffList = [] } = useQuery<StaffRow[]>({
    queryKey: ['site-staff', siteId],
    queryFn: () => apiGet(`/api/site/${siteId}/staff`),
    staleTime: 60_000,
  })
  const staff = staffList.filter((s) => s.isActive)

  const filtered = useMemo(() => {
    return complaints.filter((c) =>
      (statusFilter === 'all' || c.status === statusFilter) &&
      (priorityFilter === 'all' || c.priority === priorityFilter),
    )
  }, [complaints, statusFilter, priorityFilter])

  const counts = useMemo(() => ({
    acik: complaints.filter((c) => c.status === 'acik').length,
    inceleniyor: complaints.filter((c) => c.status === 'inceleniyor').length,
    acil: complaints.filter((c) => c.priority === 'acil' && c.status !== 'cozuldu' && c.status !== 'reddedildi').length,
    cozuldu: complaints.filter((c) => c.status === 'cozuldu').length,
  }), [complaints])

  // Personel iş yükü: atanmış + çözülmemiş talepler
  const workload = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of complaints) {
      if (c.assignedStaffId && c.status !== 'cozuldu' && c.status !== 'reddedildi') {
        map.set(c.assignedStaffId, (map.get(c.assignedStaffId) ?? 0) + 1)
      }
    }
    return map
  }, [complaints])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['complaints', siteId] })
  }

  return (
    <div className="space-y-4">
      {/* Mini istatistikler */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="border-0 shadow-sm"><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Wrench className="w-3 h-3 text-amber-600" /> Açık</div>
          <div className="text-xl font-bold">{counts.acik}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3 text-sky-600" /> İnceleniyor</div>
          <div className="text-xl font-bold">{counts.inceleniyor}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><AlertOctagon className="w-3 h-3 text-red-600" /> Acil</div>
          <div className="text-xl font-bold">{counts.acil}</div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> Çözüldü</div>
          <div className="text-xl font-bold">{counts.cozuldu}</div>
        </CardContent></Card>
      </div>

      {/* Filtre barı */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Durum filtresi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Durumlar</SelectItem>
            <SelectItem value="acik">Açık</SelectItem>
            <SelectItem value="inceleniyor">İnceleniyor</SelectItem>
            <SelectItem value="cozuldu">Çözüldü</SelectItem>
            <SelectItem value="reddedildi">Reddedildi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Öncelik filtresi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Öncelikler</SelectItem>
            <SelectItem value="acil">Acil</SelectItem>
            <SelectItem value="yuksek">Yüksek</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="dusuk">Düşük</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {staff.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-0.5">İş yükü:</span>
            {staff.slice(0, 4).map((s) => (
              <Badge key={s.id} variant="outline" className="text-[10px] gap-1">
                {s.name.split(' ')[0]}
                <span className={cn('font-bold tabular-nums', (workload.get(s.id) ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                  {workload.get(s.id) ?? 0}
                </span>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-muted-foreground/25" />
            <p className="font-medium text-sm">{complaints.length === 0 ? 'Henüz talep yok' : 'Filtreye uygun talep yok'}</p>
            <p className="text-xs text-muted-foreground mt-1">Sakinler portal üzerinden talep oluşturabilir; yönetim buradan takip eder</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const st = STATUS_META[c.status] ?? STATUS_META.acik
            const pr = PRIORITY_META[c.priority] ?? PRIORITY_META.normal
            const cat = CATEGORY_META[c.category] ?? CATEGORY_META.diger
            const CatIcon = cat.icon
            const isOverdue = c.dueDate && c.status !== 'cozuldu' && c.status !== 'reddedildi' && new Date(c.dueDate).getTime() < Date.now()
            return (
              <Card
                key={c.id}
                className={cn(
                  'border shadow-sm hover:shadow-md transition-all cursor-pointer',
                  c.status === 'acik' && c.priority === 'acil' && 'border-red-300 dark:border-red-800',
                  isOverdue && 'border-orange-400 dark:border-orange-700',
                )}
                onClick={() => setDetail(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setDetail(c) }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start gap-2.5">
                    <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0 bg-muted', c.status === 'cozuldu' && 'bg-emerald-50 dark:bg-emerald-950/40')}>
                      <CatIcon className={cn('w-4.5 h-4.5 w-[18px] h-[18px]', c.status === 'cozuldu' ? 'text-emerald-600' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('font-medium text-sm', (c.status === 'cozuldu' || c.status === 'reddedildi') && 'line-through decoration-muted-foreground/40')}>{c.title}</span>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', pr.cls)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full mr-1 inline-block', pr.dot)} />
                          {pr.label}
                        </Badge>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5', st.cls)}>{st.label}</Badge>
                        {isOverdue && (
                          <Badge variant="outline" className="text-[10px] px-1.5 bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300">
                            <CalendarClock className="w-3 h-3 mr-1" /> gecikti
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
                        <span>{cat.label}</span>
                        <span>{c.resident?.name ?? 'Anonim'} · {formatDate(c.createdAt)}</span>
                        {c.assignedStaff ? (
                          <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                            <UserCheck className="w-3 h-3" /> {c.assignedStaff.name}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">atanmadı</span>
                        )}
                        {(c.estimatedCost != null || c.actualCost != null) && (
                          <span className="inline-flex items-center gap-1">
                            <Wallet className="w-3 h-3" />
                            {c.actualCost != null ? formatCurrency(c.actualCost) : `~${formatCurrency(c.estimatedCost ?? 0)}`}
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
      )}

      {/* Detay/yönetim dialogu */}
      {detail && (
        <ComplaintDetailDialog
          siteId={siteId}
          complaint={detail}
          staff={staff}
          onClose={() => setDetail(null)}
          onSaved={() => { setDetail(null); invalidate() }}
        />
      )}
    </div>
  )
}

// ============================================================
// Detay dialogu — atama + maliyet + durum yönetimi
// ============================================================

function ComplaintDetailDialog({ siteId, complaint, staff, onClose, onSaved }: {
  siteId: string
  complaint: ComplaintRow
  staff: StaffRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState(complaint.status)
  const [priority, setPriority] = useState(complaint.priority)
  const [assignedStaffId, setAssignedStaffId] = useState(complaint.assignedStaffId ?? 'none')
  const [estimatedCost, setEstimatedCost] = useState(complaint.estimatedCost?.toString() ?? '')
  const [actualCost, setActualCost] = useState(complaint.actualCost?.toString() ?? '')
  const [dueDate, setDueDate] = useState(complaint.dueDate ? toInputDate(new Date(complaint.dueDate)) : '')
  const [response, setResponse] = useState(complaint.response ?? '')
  const [saving, setSaving] = useState(false)

  const cat = CATEGORY_META[complaint.category] ?? CATEGORY_META.diger
  const CatIcon = cat.icon

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPatch(`/api/site/${siteId}/complaints/${complaint.id}`, {
        status,
        priority,
        assignedStaffId: assignedStaffId === 'none' ? null : assignedStaffId,
        estimatedCost: estimatedCost === '' ? null : Number(estimatedCost),
        actualCost: actualCost === '' ? null : Number(actualCost),
        dueDate: dueDate || null,
        response: response.trim() || undefined,
      })
      toast.success('Talep güncellendi')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    } finally {
      setSaving(false)
    }
  }

  const quickStatus = async (s: ComplaintRow['status']) => {
    setStatus(s)
    try {
      await apiPatch(`/api/site/${siteId}/complaints/${complaint.id}`, { status: s })
      toast.success(s === 'cozuldu' ? 'Talep çözüldü olarak işaretlendi' : `Durum güncellendi`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi')
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CatIcon className="w-5 h-5 text-amber-600" /> {complaint.title}
          </DialogTitle>
          <DialogDescription>
            {cat.label} · {complaint.resident?.name ?? 'Anonim'} · {formatDate(complaint.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm rounded-lg bg-muted/40 p-3">{complaint.description}</p>

          {/* Hızlı durum butonları */}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={status === 'inceleniyor' ? 'default' : 'outline'}
              className={cn('h-8 text-xs', status === 'inceleniyor' && 'bg-sky-600 hover:bg-sky-700 text-white')}
              onClick={() => void quickStatus('inceleniyor')}>
              <Clock className="w-3.5 h-3.5 mr-1" /> İnceleniyor
            </Button>
            <Button size="sm" variant={status === 'cozuldu' ? 'default' : 'outline'}
              className={cn('h-8 text-xs', status === 'cozuldu' && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
              onClick={() => void quickStatus('cozuldu')}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Çözüldü
            </Button>
            <Button size="sm" variant={status === 'reddedildi' ? 'default' : 'outline'}
              className={cn('h-8 text-xs', status === 'reddedildi' && 'bg-slate-600 hover:bg-slate-700 text-white')}
              onClick={() => void quickStatus('reddedildi')}>
              <XCircle className="w-3.5 h-3.5 mr-1" /> Reddet
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Öncelik</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as ComplaintRow['priority'])}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dusuk">Düşük</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="yuksek">Yüksek</SelectItem>
                  <SelectItem value="acil">Acil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Personel Ata</Label>
              <Select value={assignedStaffId} onValueChange={setAssignedStaffId}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Atanmadı</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.role === 'kapici' ? 'Kapıcı' : s.role === 'guvenlik' ? 'Güvenlik' : s.role === 'temizlik' ? 'Temizlik' : s.role === 'bahcivan' ? 'Bahçıvan' : 'Teknik'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Tahmini Maliyet (₺)</Label>
              <Input type="number" min={0} value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className="mt-1 h-9" placeholder="—" />
            </div>
            <div>
              <Label className="text-xs">Gerçek Maliyet (₺)</Label>
              <Input type="number" min={0} value={actualCost} onChange={(e) => setActualCost(e.target.value)} className="mt-1 h-9" placeholder="—" />
            </div>
            <div>
              <Label className="text-xs">Hedef Tarih</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Sakine Cevap / Not</Label>
            <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} className="mt-1" placeholder="Örn: Teknik ekip perşembe günü bakım yapacak" />
          </div>

          {/* Maliyet özeti */}
          {(estimatedCost !== '' || actualCost !== '') && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
              <Wallet className="w-4 h-4 text-amber-600" />
              <span>Tahmini: <strong className="tabular-nums">{estimatedCost ? formatCurrency(Number(estimatedCost)) : '—'}</strong></span>
              <span className="text-muted-foreground">·</span>
              <span>Gerçek: <strong className="tabular-nums">{actualCost ? formatCurrency(Number(actualCost)) : '—'}</strong></span>
              {estimatedCost && actualCost && Number(actualCost) > Number(estimatedCost) && (
                <span className="text-red-600 font-medium">(+{formatCurrency(Number(actualCost) - Number(estimatedCost))} fazla)</span>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div>
            {complaint.resident?.phone && (
              <Button size="sm" variant="outline" className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300" asChild>
                <a href={whatsappLink(complaint.resident.phone, `Merhaba ${complaint.resident.name}, "${complaint.title}" talebiniz hakkında: ${response || 'inceleniyor'}`)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp <Phone className="sr-only" /> Cevap Gönder
                </a>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Vazgeç</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Yeni talep oluşturma (yönetim tarafı) — sakin adına hızlı giriş
export function ComplaintCreateButton({ siteId, onCreated }: { siteId: string; onCreated?: () => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'diger', priority: 'normal', estimatedCost: '', dueDate: '' })

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim()) { toast.error('Başlık ve açıklama gerekli'); return }
    setSaving(true)
    try {
      await apiPost(`/api/site/${siteId}/complaints`, {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
        dueDate: form.dueDate || undefined,
      })
      toast.success('Talep kaydedildi')
      void qc.invalidateQueries({ queryKey: ['complaints', siteId] })
      onCreated?.()
      setOpen(false)
      setForm({ title: '', description: '', category: 'diger', priority: 'normal', estimatedCost: '', dueDate: '' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="sm" className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Talep Ekle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Bakım/Arıza Talebi</DialogTitle>
            <DialogDescription>Yönetim tarafından manuel talep girişi</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Başlık *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn: B Blok asansör arızası" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Açıklama *</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Kategori</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_META).map(([key, m]) => (
                      <SelectItem key={key} value={key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Öncelik</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dusuk">Düşük</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="yuksek">Yüksek</SelectItem>
                    <SelectItem value="acil">Acil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tahmini Maliyet (₺)</Label>
                <Input type="number" min={0} value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} className="mt-1" placeholder="—" />
              </div>
              <div>
                <Label className="text-xs">Hedef Tarih</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
