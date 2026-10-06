'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { hasPermission } from '@/lib/rbac'
import type { SessionUser } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  Plus, Users, Wallet, UserCheck, CalendarOff, Trash2, Pencil,
  Check, X, Search, Briefcase, CalendarDays, ChevronLeft, ChevronRight, Clock,
} from 'lucide-react'

interface HrEmployee {
  id: string
  name: string
  position: string
  department: string | null
  phone: string | null
  email: string | null
  hireDate: string | null
  monthlySalary: number | null
  status: string
  notes: string | null
  leaves?: { id: string; type: string; status: string; days: number }[]
  shifts?: { id: string; date: string; startTime: string; endTime: string }[]
}

interface HrLeave {
  id: string
  employee: { id: string; name: string; position: string }
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  status: string
  decisionNote: string | null
}

interface HrShift {
  id: string
  employeeId: string
  employee: { id: string; name: string; position: string }
  date: string
  startTime: string
  endTime: string
  note: string | null
}

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Pazartesi=0
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const LEAVE_TYPES: Record<string, string> = {
  yillik: 'Yıllık İzin',
  mazeret: 'Mazeret İzni',
  hastalik: 'Hastalık İzni',
  dogum: 'Doğum İzni',
  ucretsiz: 'Ücretsiz İzin',
}

const LEAVE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Beklemede', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  approved: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  rejected: { label: 'Reddedildi', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
}

const EMPTY_FORM = {
  name: '', position: '', department: '', phone: '', email: '',
  hireDate: '', monthlySalary: '', notes: '',
}

export function HrView() {
  const qc = useQueryClient()
  const { user } = useAppStore()
  const canManage = hasPermission(user as SessionUser | null, 'hr.manage')
  const [tab, setTab] = useState('employees')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [empOpen, setEmpOpen] = useState(false)
  const [editEmp, setEditEmp] = useState<HrEmployee | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const [leaveForm, setLeaveForm] = useState({ employeeId: '', type: 'yillik', startDate: '', endDate: '', reason: '' })

  // Vardiya planı
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [shiftOpen, setShiftOpen] = useState(false)
  const [shiftForm, setShiftForm] = useState({ employeeId: '', date: '', startTime: '09:00', endTime: '18:00', note: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['hr-employees', search, statusFilter],
    queryFn: () =>
      apiGet<{
        items: HrEmployee[]
        departments: string[]
        summary: { total: number; active: number; monthlyPayroll: number }
      }>(`/api/hr/employees?q=${encodeURIComponent(search)}&status=${statusFilter}`),
  })

  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ['hr-leaves'],
    queryFn: () => apiGet<{ items: HrLeave[]; pendingCount: number }>('/api/hr/leaves'),
  })

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const { data: shiftData, isLoading: shiftLoading } = useQuery({
    queryKey: ['hr-shifts', toISODate(weekStart)],
    queryFn: () =>
      apiGet<{ items: HrShift[] }>(
        `/api/hr/shifts?from=${toISODate(weekStart)}&to=${toISODate(weekEnd)}`,
      ),
  })

  const employees = data?.items ?? []
  const leaves = leaveData?.items ?? []
  const summary = data?.summary
  const shifts = shiftData?.items ?? []

  // Hafta içi günler + personel bazlı vardiya haritası
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const shiftMap = useMemo(() => {
    const map = new Map<string, HrShift[]>()
    for (const s of shifts) {
      const key = `${s.employeeId}|${toISODate(new Date(s.date))}`
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return map
  }, [shifts])
  const weeklyHours = useMemo(() => {
    let total = 0
    for (const s of shifts) {
      const [sh, sm] = s.startTime.split(':').map(Number)
      const [eh, em] = s.endTime.split(':').map(Number)
      total += (eh * 60 + em - (sh * 60 + sm)) / 60
    }
    return total
  }, [shifts])

  function openNew() {
    setEditEmp(null)
    setForm(EMPTY_FORM)
    setEmpOpen(true)
  }

  function openEdit(e: HrEmployee) {
    setEditEmp(e)
    setForm({
      name: e.name, position: e.position, department: e.department ?? '',
      phone: e.phone ?? '', email: e.email ?? '',
      hireDate: e.hireDate ? e.hireDate.slice(0, 10) : '',
      monthlySalary: e.monthlySalary != null ? String(e.monthlySalary) : '',
      notes: e.notes ?? '',
    })
    setEmpOpen(true)
  }

  async function saveEmployee() {
    if (!form.name.trim() || !form.position.trim()) return toast.error('Ad ve pozisyon zorunludur')
    setBusy('emp')
    try {
      if (editEmp) {
        await apiPatch(`/api/hr/employees/${editEmp.id}`, form)
        toast.success('Personel güncellendi')
      } else {
        await apiPost('/api/hr/employees', form)
        toast.success('Personel eklendi')
      }
      setEmpOpen(false)
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setBusy(null)
    }
  }

  async function deleteEmployee(e: HrEmployee) {
    if (!confirm(`"${e.name}" silinsin mi? İzin kayıtları da silinir.`)) return
    setBusy(e.id)
    try {
      await apiDelete(`/api/hr/employees/${e.id}`)
      toast.success('Personel silindi')
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setBusy(null)
    }
  }

  async function decideLeave(leave: HrLeave, action: 'approve' | 'reject') {
    setBusy(leave.id)
    try {
      await apiPatch(`/api/hr/leaves/${leave.id}`, { action })
      toast.success(action === 'approve' ? 'İzin onaylandı' : 'İzin reddedildi')
      qc.invalidateQueries({ queryKey: ['hr-leaves'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusy(null)
    }
  }

  async function saveShift() {
    if (!shiftForm.employeeId || !shiftForm.date) return toast.error('Personel ve tarih zorunludur')
    if (shiftForm.startTime >= shiftForm.endTime) return toast.error('Bitiş saati başlangıçtan sonra olmalıdır')
    setBusy('shift')
    try {
      await apiPost('/api/hr/shifts', shiftForm)
      toast.success('Vardiya eklendi')
      setShiftOpen(false)
      setShiftForm({ employeeId: '', date: '', startTime: '09:00', endTime: '18:00', note: '' })
      qc.invalidateQueries({ queryKey: ['hr-shifts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Vardiya eklenemedi')
    } finally {
      setBusy(null)
    }
  }

  async function deleteShift(s: HrShift) {
    setBusy(s.id)
    try {
      await apiDelete(`/api/hr/shifts/${s.id}`)
      toast.success('Vardiya silindi')
      qc.invalidateQueries({ queryKey: ['hr-shifts'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi')
    } finally {
      setBusy(null)
    }
  }

  async function saveLeave() {
    if (!leaveForm.employeeId || !leaveForm.startDate || !leaveForm.endDate) {
      return toast.error('Personel ve tarihler zorunludur')
    }
    setBusy('leave')
    try {
      await apiPost('/api/hr/leaves', leaveForm)
      toast.success('İzin talebi oluşturuldu')
      setLeaveOpen(false)
      setLeaveForm({ employeeId: '', type: 'yillik', startDate: '', endDate: '', reason: '' })
      qc.invalidateQueries({ queryKey: ['hr-leaves'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Talep oluşturulamadı')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" /> Toplam Personel
            </div>
            <div className="text-2xl font-bold">{summary?.total ?? '…'}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <UserCheck className="w-3.5 h-3.5" /> Aktif
            </div>
            <div className="text-2xl font-bold text-emerald-600">{summary?.active ?? '…'}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="w-3.5 h-3.5" /> Aylık Bordro
            </div>
            <div className="text-2xl font-bold">{summary ? formatCurrency(summary.monthlyPayroll) : '…'}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CalendarOff className="w-3.5 h-3.5" /> Bekleyen İzin Talebi
            </div>
            <div className={`text-2xl font-bold ${(leaveData?.pendingCount ?? 0) > 0 ? 'text-amber-600' : ''}`}>
              {leaveData?.pendingCount ?? '…'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="employees" className="text-xs">Personel</TabsTrigger>
            <TabsTrigger value="leaves" className="text-xs">
              İzin Talepleri
              {(leaveData?.pendingCount ?? 0) > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 inline-flex items-center justify-center">
                  {leaveData!.pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="shifts" className="text-xs">Vardiya Planı</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {tab === 'employees' && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={openNew}>
                <Plus className="w-4 h-4 mr-1" /> Personel Ekle
              </Button>
            )}
            {tab === 'leaves' && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setLeaveOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> İzin Talebi
              </Button>
            )}
            {tab === 'shifts' && canManage && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShiftOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Vardiya Ekle
              </Button>
            )}
          </div>
        </div>

        {/* VARDİYA PLANI — haftalık grid */}
        <TabsContent value="shifts" className="mt-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setWeekStart(addDays(weekStart, -7))} title="Önceki hafta">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setWeekStart(addDays(weekStart, 7))} title="Sonraki hafta">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                Bu Hafta
              </Button>
              <span className="text-sm font-medium ml-1">
                {formatDate(weekStart.toISOString())} — {formatDate(weekEnd.toISOString())}
              </span>
            </div>
            <Badge variant="outline" className="text-[11px] w-fit gap-1">
              <Clock className="w-3 h-3" /> {shifts.length} vardiya · {weeklyHours.toFixed(1)} saat
            </Badge>
          </div>

          <Card className="shadow-soft overflow-hidden">
            <CardContent className="p-0">
              {shiftLoading ? (
                <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : employees.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Vardiya planı için önce personel tanımlayın.
                </div>
              ) : (
                <div className="overflow-x-auto custom-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Personel</TableHead>
                        {weekDays.map((d, i) => {
                          const isToday = toISODate(d) === toISODate(new Date())
                          return (
                            <TableHead key={i} className={cn('text-center min-w-[96px]', isToday && 'bg-emerald-50/60 dark:bg-emerald-950/20')}>
                              <div className={cn('text-xs', isToday && 'text-emerald-700 dark:text-emerald-400 font-semibold')}>
                                {DAY_LABELS[i]}
                              </div>
                              <div className={cn('text-[10px] text-muted-foreground', isToday && 'text-emerald-600/70')}>
                                {d.getDate()}.{d.getMonth() + 1}
                              </div>
                            </TableHead>
                          )
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="sticky left-0 bg-background z-10">
                            <div className="font-medium text-sm truncate max-w-[140px]">{e.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{e.position}</div>
                          </TableCell>
                          {weekDays.map((d, di) => {
                            const cellShifts = shiftMap.get(`${e.id}|${toISODate(d)}`) ?? []
                            return (
                              <TableCell key={di} className={cn('p-1.5 align-top', toISODate(d) === toISODate(new Date()) && 'bg-emerald-50/40 dark:bg-emerald-950/10')}>
                                {cellShifts.length === 0 ? (
                                  <div className="h-8" />
                                ) : (
                                  <div className="space-y-1">
                                    {cellShifts.map((s) => (
                                      <div key={s.id} className="group relative rounded-md bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-1 text-center">
                                        <div className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
                                          {s.startTime}–{s.endTime}
                                        </div>
                                        {canManage && (
                                          <button
                                            className="absolute top-0.5 right-0.5 hidden group-hover:flex w-3.5 h-3.5 rounded-full bg-rose-500 text-white items-center justify-center shadow"
                                            disabled={busy === s.id}
                                            onClick={() => deleteShift(s)}
                                            title="Vardiyayı sil"
                                          >
                                            <X className="w-2 h-2" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          {canManage && employees.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Hücre üzerindeki vardiyaların üzerine gelip ✕ ile silebilir ya da &quot;Vardiya Ekle&quot; ile yeni kayıt oluşturabilirsiniz.
            </p>
          )}
        </TabsContent>

        {/* PERSONEL */}
        <TabsContent value="employees" className="mt-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Personel ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="passive">Pasif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="shadow-soft">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : employees.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Henüz personel kaydı yok. &quot;Personel Ekle&quot; ile ilk çalışanı tanımlayın.
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto custom-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Personel</TableHead>
                        <TableHead className="hidden md:table-cell">Departman</TableHead>
                        <TableHead className="hidden lg:table-cell">İşe Giriş</TableHead>
                        <TableHead className="hidden lg:table-cell text-right">Maaş</TableHead>
                        <TableHead>Durum</TableHead>
                        <TableHead className="text-right">İşlem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{e.name}</div>
                            <div className="text-[11px] text-muted-foreground">{e.position}{e.phone ? ` · ${e.phone}` : ''}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{e.department || '—'}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {e.hireDate ? formatDate(e.hireDate) : '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-right text-sm">
                            {e.monthlySalary != null ? formatCurrency(e.monthlySalary) : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] border-0 ${e.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-slate-200 text-slate-600'}`}>
                              {e.status === 'active' ? 'Aktif' : 'Pasif'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(e)} title="Düzenle">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600" disabled={busy === e.id} onClick={() => deleteEmployee(e)} title="Sil">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* İZİN TALEPLERİ */}
        <TabsContent value="leaves" className="mt-3">
          <Card className="shadow-soft">
            <CardContent className="p-0">
              {leaveLoading ? (
                <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : leaves.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  <CalendarOff className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Henüz izin talebi yok.
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto custom-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Personel</TableHead>
                        <TableHead>İzin</TableHead>
                        <TableHead className="hidden md:table-cell">Tarih</TableHead>
                        <TableHead>Durum</TableHead>
                        <TableHead className="text-right">İşlem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaves.map((l) => {
                        const meta = LEAVE_STATUS[l.status] ?? LEAVE_STATUS.pending
                        return (
                          <TableRow key={l.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{l.employee.name}</div>
                              <div className="text-[11px] text-muted-foreground">{l.employee.position}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{LEAVE_TYPES[l.type] ?? l.type}</div>
                              <div className="text-[11px] text-muted-foreground">{l.days} gün</div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              {formatDate(l.startDate)} → {formatDate(l.endDate)}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] border-0 ${meta.cls}`}>{meta.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {l.status === 'pending' ? (
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-emerald-600 border-emerald-200" disabled={busy === l.id} onClick={() => decideLeave(l, 'approve')}>
                                    <Check className="w-3 h-3 mr-0.5" /> Onayla
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-rose-600 border-rose-200" disabled={busy === l.id} onClick={() => decideLeave(l, 'reject')}>
                                    <X className="w-3 h-3 mr-0.5" /> Reddet
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">sonuçlandı</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* PERSONEL DİALOGU */}
      <Dialog open={empOpen} onOpenChange={setEmpOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEmp ? 'Personeli Düzenle' : 'Yeni Personel'}</DialogTitle>
            <DialogDescription>Personel dosyası bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Ad Soyad *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ad Soyad" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pozisyon *</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Örn: Satış Uzmanı" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Departman</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Örn: Satış" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefon</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-posta</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">İşe Giriş Tarihi</Label>
              <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Aylık Maaş (₺)</Label>
              <Input type="number" min="0" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Not</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmpOpen(false)}>Vazgeç</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveEmployee} disabled={busy === 'emp'}>
              {busy === 'emp' ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* İZİN TALEBİ DİALOGU */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni İzin Talebi</DialogTitle>
            <DialogDescription>Personel için izin kaydı oluştur.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Personel *</Label>
              <Select value={leaveForm.employeeId || undefined} onValueChange={(v) => setLeaveForm({ ...leaveForm, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Personel seçin" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.position}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">İzin Tipi</Label>
              <Select value={leaveForm.type} onValueChange={(v) => setLeaveForm({ ...leaveForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Başlangıç *</Label>
                <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bitiş *</Label>
                <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gerekçe</Label>
              <Input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Opsiyonel…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Vazgeç</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveLeave} disabled={busy === 'leave'}>
              {busy === 'leave' ? 'Oluşturuluyor…' : 'Talep Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* VARDİYA DİALOGU */}
      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Vardiya</DialogTitle>
            <DialogDescription>Personel için çalışma saati tanımlayın.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Personel *</Label>
              <Select value={shiftForm.employeeId || undefined} onValueChange={(v) => setShiftForm({ ...shiftForm, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Personel seçin" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.position}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tarih *</Label>
              <Input type="date" value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Başlangıç *</Label>
                <Input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bitiş *</Label>
                <Input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Not</Label>
              <Input value={shiftForm.note} onChange={(e) => setShiftForm({ ...shiftForm, note: e.target.value })} placeholder="Örn: Sabah vardiyası" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftOpen(false)}>Vazgeç</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveShift} disabled={busy === 'shift'}>
              {busy === 'shift' ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
