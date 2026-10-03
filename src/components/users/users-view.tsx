'use client'

import { useState, useMemo, useCallback, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  apiGet, apiPost, apiPatch, apiDelete, qk, ApiError,
} from '@/lib/api-client'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import {
  ROLE_PERMISSIONS, ROLE_LABELS, ALL_PERMISSIONS,
  getRolePermissions, hasPermission, canDelegatePermission, getVisibleUserIds,
} from '@/lib/rbac'
import type { Role, PermissionKey, UserListItem, SessionUser } from '@/types'

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  UserPlus, ShieldCheck, Search, Pencil, KeyRound, LockKeyhole,
  Ban, ChevronRight, ChevronDown, Users, UserCheck, Crown, GitBranch,
  Check, Minus, Info, AlertCircle, Shield, ListTree,
} from 'lucide-react'
import { PermissionTree } from './permission-tree'

// ─── Rol renkleri (indigo/blue yok) ───────────────────────────────
const ROLE_BADGE_CLASS: Record<Role, string> = {
  superadmin: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
  admin: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  manager: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50',
  rep: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50',
  readonly: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  stock: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50',
}

const ROLE_AVATAR_GRADIENT: Record<Role, string> = {
  superadmin: 'from-amber-500 to-orange-600',
  admin: 'from-emerald-500 to-teal-600',
  manager: 'from-violet-500 to-purple-600',
  rep: 'from-teal-500 to-cyan-600',
  readonly: 'from-slate-500 to-slate-600',
  stock: 'from-rose-500 to-pink-600',
}

// ─── Tipler ───────────────────────────────────────────────────────
interface UsersResponse {
  items: UserListItem[]
  total: number
}

type UserFormData = {
  name: string
  email: string
  role: Role
  title: string
  phone: string
  managerId: string
  status: string
}

const EMPTY_FORM: UserFormData = {
  name: '', email: '', role: 'rep', title: '', phone: '', managerId: '', status: 'active',
}

// Formda seçilebilen roller (superadmin hariç)
// Kafe rolleri (kasa/barmen/komi) + Market rolleri (kasiyer/depo_sorumlusu) dahil
const SELECTABLE_ROLES: Role[] = [
  'admin', 'manager', 'rep', 'readonly', 'stock',
  'kasa', 'barmen', 'komi',
  'kasiyer', 'depo_sorumlusu',
]

// ─── Yardımcılar ──────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" /> Aktif
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5" /> Pasif
    </Badge>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant="outline" className={cn('font-medium', ROLE_BADGE_CLASS[role])}>
      {ROLE_LABELS[role]}
    </Badge>
  )
}

function UserAvatar({ user, size = 'default' }: { user: { name: string; avatarUrl?: string | null }; size?: 'sm' | 'default' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-xs'
  // Role bilinmediği için gradyan yerine nötr
  return (
    <Avatar className={sz}>
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
      <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-semibold">
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  )
}

// ─── Kullanıcı listesi skeleton ───────────────────────────────────
function UsersTableSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-4 border-b">
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── İstatistik kartları ──────────────────────────────────────────
function StatsRow({ users }: { users: UserListItem[] }) {
  const total = users.length
  const active = users.filter((u) => u.status === 'active').length
  const managers = users.filter((u) => u.role === 'manager' || u.role === 'admin' || u.role === 'superadmin').length
  const reps = users.filter((u) => u.role === 'rep').length

  const stats = [
    { label: 'Toplam Kullanıcı', value: total, icon: Users, color: 'from-emerald-500 to-teal-600', sub: `${active} aktif` },
    { label: 'Aktif', value: active, icon: UserCheck, color: 'from-teal-500 to-cyan-600', sub: `${total - active} pasif` },
    { label: 'Yönetici', value: managers, icon: Crown, color: 'from-violet-500 to-purple-600', sub: 'müdür + admin' },
    { label: 'Temsilci', value: reps, icon: GitBranch, color: 'from-amber-500 to-orange-600', sub: 'satış temsilcisi' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label} className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm', s.color)}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{s.value}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{s.label}</div>
            <div className="text-xs text-muted-foreground/80 mt-1.5">{s.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Add/Edit Dialog ──────────────────────────────────────────────
function UserFormDialog({
  open, onOpenChange, editing, users, actor,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: UserListItem | null
  users: UserListItem[]
  actor: SessionUser
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<UserFormData>(() =>
    editing
      ? {
          name: editing.name,
          email: editing.email,
          role: editing.role,
          title: editing.title ?? '',
          phone: editing.phone ?? '',
          managerId: editing.managerId ?? '',
          status: editing.status,
        }
      : EMPTY_FORM,
  )
  const [submitting, setSubmitting] = useState(false)
  const [showRoleNotice, setShowRoleNotice] = useState(false)

  const createMut = useMutation({
    mutationFn: (body: UserFormData) => apiPost<UserListItem>('/api/users', body),
    onSuccess: () => {
      toast.success('Kullanıcı davet edildi', { description: `${form.name} sisteme eklendi.` })
      qc.invalidateQueries({ queryKey: qk.users })
      onOpenChange(false)
    },
    onError: (e: ApiError) => toast.error('Hata', { description: e.message }),
    onSettled: () => setSubmitting(false),
  })

  const updateMut = useMutation({
    mutationFn: (body: Partial<UserFormData>) => apiPatch<UserListItem>(`/api/users/${editing?.id}`, body),
    onSuccess: () => {
      toast.success('Kullanıcı güncellendi', { description: `${form.name} bilgileri kaydedildi.` })
      qc.invalidateQueries({ queryKey: qk.users })
      onOpenChange(false)
    },
    onError: (e: ApiError) => toast.error('Hata', { description: e.message }),
    onSettled: () => setSubmitting(false),
  })

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Eksik bilgi', { description: 'Ad ve e-posta zorunludur.' })
      return
    }
    setSubmitting(true)
    const payload: UserFormData = {
      ...form,
      managerId: form.managerId === 'none' ? '' : form.managerId,
    }
    if (editing) {
      updateMut.mutate(payload)
    } else {
      createMut.mutate(payload)
    }
  }

  // Manager select — editing kullanıcısını dışla, actor dahil tüm tenant kullanıcıları
  const managerOptions = users.filter((u) => u.id !== editing?.id)

  // Rol değişince bildirim
  const handleRoleChange = (role: Role) => {
    setForm((f) => ({ ...f, role }))
    setShowRoleNotice(true)
  }

  const roleDefaultPerms = getRolePermissions(form.role)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? <Pencil className="w-4 h-4 text-emerald-600" /> : <UserPlus className="w-4 h-4 text-emerald-600" />}
            {editing ? 'Kullanıcı Düzenle' : 'Kullanıcı Davet Et'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? `${editing.name} kullanıcısının bilgilerini ve rolünü güncelleyin.`
              : 'Yeni bir kullanıcı ekleyin. Rolüne göre varsayılan yetkiler otomatik atanır.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Ad Soyad *</Label>
            <Input id="u-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Örn. Ahmet Yılmaz" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">E-posta *</Label>
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="ahmet@sirket.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-role">Rol</Label>
            <Select value={form.role} onValueChange={(v) => handleRoleChange(v as Role)}>
              <SelectTrigger id="u-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-title">Ünvan</Label>
            <Input id="u-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Satış Müdürü" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-phone">Telefon</Label>
            <Input id="u-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+90 5xx xxx xx xx" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-manager">Yönetici</Label>
            <Select value={form.managerId || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, managerId: v === 'none' ? '' : v }))}>
              <SelectTrigger id="u-manager" className="w-full">
                <SelectValue placeholder="Yönetici seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Yönetici yok —</SelectItem>
                {managerOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {ROLE_LABELS[m.role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-status">Durum</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger id="u-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="passive">Pasif</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Rol değişimi bildirimi */}
        {showRoleNotice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3 flex gap-2.5">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <p className="font-medium">
                {ROLE_LABELS[form.role]} rolü için varsayılan yetkiler:
              </p>
              <div className="flex flex-wrap gap-1">
                {roleDefaultPerms.length > 0 ? roleDefaultPerms.slice(0, 6).map((p) => (
                  <span key={p} className="px-1.5 py-0.5 rounded bg-white dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 font-mono text-[10px]">
                    {p}
                  </span>
                )) : <span className="italic">Yetki yok</span>}
                {roleDefaultPerms.length > 6 && (
                  <span className="text-emerald-700 dark:text-emerald-400">+{roleDefaultPerms.length - 6} daha</span>
                )}
              </div>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 pt-0.5">
                Yetkileri özelleştirmek için &ldquo;Yetki Matrisi&rdquo; → kullanıcı seç → düzenle.
              </p>
            </div>
          </div>
        )}

        {/* Cycle önleme uyarısı */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900/40 p-2.5 flex gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            Yönetici ataması döngü oluşturamaz (kullanıcı, kendi astının astı olamaz). Sistem otomatik engeller.
          </p>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? 'Kaydediliyor…' : editing ? 'Değişiklikleri Kaydet' : 'Kullanıcı Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Yetki Matrisi (read-only) ────────────────────────────────────
function PermissionMatrixReadOnly() {
  const roles: Role[] = ['admin', 'manager', 'rep', 'readonly', 'stock']
  const groups = useMemo(() => {
    const map = new Map<string, typeof ALL_PERMISSIONS>()
    for (const p of ALL_PERMISSIONS) {
      if (!map.has(p.group)) map.set(p.group, [])
      map.get(p.group)!.push(p)
    }
    return Array.from(map.entries())
  }, [])

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b">
              <th className="text-left font-medium p-3 min-w-[260px]">Yetki</th>
              {roles.map((r) => (
                <th key={r} className="text-center font-medium p-2 min-w-[110px]">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs">{ROLE_LABELS[r]}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, perms]) => (
              <Fragment key={`g-${group}`}>
                <tr className="bg-muted/30">
                  <td colSpan={roles.length + 1} className="p-2.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                    {group}
                  </td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.key} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="p-2.5">
                      <div className="font-medium text-[13px]">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{p.key}</div>
                    </td>
                    {roles.map((r) => {
                      const has = ROLE_PERMISSIONS[r].includes(p.key)
                      return (
                        <td key={r} className="p-2 text-center">
                          {has ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Bu rol bu yetkiye sahip</TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-50 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600">
                              <Minus className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Kullanıcı bazlı yetki editörü ────────────────────────────────
function UserPermissionEditor({
  users, actor,
}: {
  users: UserListItem[]
  actor: SessionUser
}) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string>('')
  const [draftPerms, setDraftPerms] = useState<PermissionKey[]>([])
  const [saving, setSaving] = useState(false)

  const selected = users.find((u) => u.id === selectedId) ?? null

  // Actor'ın astları (getVisibleUserIds ile, self hariç)
  const subordinates = useMemo(() => {
    const visible = getVisibleUserIds(
      users.map((u) => ({ id: u.id, managerId: u.managerId })),
      actor.id,
    )
    return visible.filter((id) => id !== actor.id)
  }, [users, actor])

  // Seçim değişince draft'ı hazırla
  const handleSelect = (id: string) => {
    setSelectedId(id)
    const u = users.find((x) => x.id === id)
    setDraftPerms(u?.permissions ?? [])
  }

  // Belirli bir yetki değiştirilebilir mi? (canDelegatePermission)
  const canEdit = useCallback(
    (perm: PermissionKey): boolean => {
      if (!selected) return false
      return canDelegatePermission(actor, selected.id, perm, subordinates)
    },
    [actor, selected, subordinates],
  )

  const togglePerm = (perm: PermissionKey) => {
    if (!canEdit(perm)) return
    setDraftPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    )
  }

  const saveMut = useMutation({
    mutationFn: (perms: PermissionKey[]) =>
      apiPatch<UserListItem>(`/api/users/${selectedId}`, { permissions: perms }),
    onSuccess: () => {
      toast.success('Yetkiler güncellendi', {
        description: `${selected?.name} için yetkiler kaydedildi.`,
      })
      qc.invalidateQueries({ queryKey: qk.users })
    },
    onError: (e: ApiError) => toast.error('Hata', { description: e.message }),
    onSettled: () => setSaving(false),
  })

  const handleSave = () => {
    setSaving(true)
    saveMut.mutate(draftPerms)
  }

  const groups = useMemo(() => {
    const map = new Map<string, typeof ALL_PERMISSIONS>()
    for (const p of ALL_PERMISSIONS) {
      if (!map.has(p.group)) map.set(p.group, [])
      map.get(p.group)!.push(p)
    }
    return Array.from(map.entries())
  }, [])

  // Aktörün kendi yetkileri (delegate edebileceği)
  const actorPerms = actor.permissions

  return (
    <div className="space-y-4">
      {/* Açıklama */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-900/40 p-3 flex gap-2.5">
        <Shield className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
        <p className="text-xs text-violet-900 dark:text-violet-300">
          <span className="font-medium">Yetki devri:</span> Bir kullanıcı sadece kendisinde bulunan yetkileri ve sadece kendi astlarına verebilir.
          Astlar hiyerarşide sizin altınızdaki kullanıcılar olarak tanımlanır.
        </p>
      </div>

      <div className="grid sm:grid-cols-[260px_1fr] gap-4">
        {/* Kullanıcı seçimi */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Kullanıcı Seç</Label>
          <Select value={selectedId || 'none'} onValueChange={handleSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Kullanıcı seçin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Seçiniz —</SelectItem>
              {users
                .filter((u) => subordinates.includes(u.id))
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {selectedId && selectedId !== 'none' && (
            <p className="text-[11px] text-muted-foreground">
              Aktör yetkileri: <span className="font-mono">{actorPerms.length}</span> ·
              Astlar: <span className="font-mono">{subordinates.length}</span>
            </p>
          )}
          {!selectedId || selectedId === 'none' ? (
            <p className="text-[11px] text-muted-foreground/80 italic mt-2">
              Devredilebilir kullanıcı (ast) seçin.
            </p>
          ) : null}
        </div>

        {/* Yetki listesi */}
        <div className="rounded-lg border">
          {!selected ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Düzenlemek için bir ast kullanıcı seçin.
            </div>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="p-3 space-y-3">
                {groups.map(([group, perms]) => (
                  <div key={group}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
                      {group}
                    </div>
                    <div className="space-y-0.5">
                      {perms.map((p) => {
                        const checked = draftPerms.includes(p.key)
                        const actorHas = actorPerms.includes(p.key)
                        const editable = canEdit(p.key)
                        return (
                          <Tooltip key={p.key}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors',
                                  editable ? 'hover:bg-muted cursor-pointer' : 'opacity-60 cursor-not-allowed',
                                )}
                                onClick={() => togglePerm(p.key)}
                              >
                                <Checkbox checked={checked} disabled={!editable} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] font-medium">{p.label}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{p.key}</div>
                                </div>
                                {!actorHas && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 bg-slate-50 text-slate-500 border-slate-200">
                                    yetkiniz yok
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            {!editable && (
                              <TooltipContent>
                                {actorHas
                                  ? 'Bu kullanıcı astınız değil — yetki veremezsiniz.'
                                  : 'Bu yetki sizde yok — devredemezsiniz.'}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {selected && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-xs text-muted-foreground">
            Toplam <span className="font-semibold text-foreground">{draftPerms.length}</span> yetki seçili.
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? 'Kaydediliyor…' : 'Yetkileri Kaydet'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Kullanıcı bazlı yetki ağacı editörü (tree view) ─────────────
function UserPermissionTreeEditor({
  users, actor,
}: {
  users: UserListItem[]
  actor: SessionUser
}) {
  const [selectedId, setSelectedId] = useState<string>('')

  const selected = users.find((u) => u.id === selectedId) ?? null

  // Actor'ın astları (getVisibleUserIds ile, self hariç)
  const subordinates = useMemo(() => {
    const visible = getVisibleUserIds(
      users.map((u) => ({ id: u.id, managerId: u.managerId })),
      actor.id,
    )
    return visible.filter((id) => id !== actor.id)
  }, [users, actor])

  return (
    <div className="space-y-4">
      {/* Açıklama */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3 flex gap-2.5">
        <ListTree className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-900 dark:text-emerald-300">
          <span className="font-medium">Ağaç görünümü:</span> Yetkileri gruplar halinde görsel olarak düzenle.
          Grupları genişlet/küçült, tek tek veya toplu olarak yetki ver. Daha kolay kullanım için tasarlanmıştır.
        </p>
      </div>

      <div className="grid sm:grid-cols-[260px_1fr] gap-4">
        {/* Kullanıcı seçimi */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Kullanıcı Seç</Label>
          <Select value={selectedId || 'none'} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Kullanıcı seçin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Seçiniz —</SelectItem>
              {users
                .filter((u) => subordinates.includes(u.id))
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {selectedId && selectedId !== 'none' && selected && (
            <div className="p-2.5 rounded-lg bg-muted/40 border text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Kullanıcı</span>
                <span className="font-medium">{selected.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rol</span>
                <span className="font-medium">{ROLE_LABELS[selected.role]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mevcut yetki</span>
                <span className="font-mono font-medium">{selected.permissions.length}</span>
              </div>
            </div>
          )}
          {!selectedId || selectedId === 'none' ? (
            <p className="text-[11px] text-muted-foreground/80 italic mt-2">
              Yetki ağacını düzenlemek için bir ast kullanıcı seçin.
            </p>
          ) : null}
        </div>

        {/* Ağaç */}
        <div className="rounded-lg border">
          {!selected ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <ListTree className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Ağaç görünümü için bir ast kullanıcı seçin.
            </div>
          ) : (
            <div className="p-4">
              <PermissionTree
                targetUser={selected}
                actor={actor}
                subordinates={subordinates}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Yetki Matrisi Dialog ─────────────────────────────────────────
function PermissionMatrixDialog({
  open, onOpenChange, users, actor,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  users: UserListItem[]
  actor: SessionUser
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-600" />
            Yetki Matrisi
          </DialogTitle>
          <DialogDescription>
            Rol bazlı yetki dağılımı, kullanıcı bazlı yetki devri ve görsel ağaç görünümü.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="matrix" className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="matrix">
              <Shield className="w-3.5 h-3.5" /> Rol Matrisi
            </TabsTrigger>
            <TabsTrigger value="delegate">
              <KeyRound className="w-3.5 h-3.5" /> Yetki Devri
            </TabsTrigger>
            <TabsTrigger value="tree">
              <ListTree className="w-3.5 h-3.5" /> Ağaç Görünümü
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matrix" className="mt-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5" />
                <span>Her rolün varsayılan yetkileri. Yeşil ✓ = sahip, gri — = yok. (Salt okunur)</span>
              </div>
              <PermissionMatrixReadOnly />
            </div>
          </TabsContent>

          <TabsContent value="delegate" className="mt-4">
            <UserPermissionEditor users={users} actor={actor} />
          </TabsContent>

          <TabsContent value="tree" className="mt-4">
            <UserPermissionTreeEditor users={users} actor={actor} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pasifleştirme onay diyaloğı ──────────────────────────────────
function DeactivateDialog({
  user, open, onOpenChange,
}: {
  user: UserListItem | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const deleteMut = useMutation({
    mutationFn: () => apiDelete<{ success: boolean }>(`/api/users/${user?.id}`),
    onSuccess: () => {
      toast.success('Kullanıcı pasifleştirildi', {
        description: `${user?.name} artık aktif değil.`,
      })
      qc.invalidateQueries({ queryKey: qk.users })
      onOpenChange(false)
    },
    onError: (e: ApiError) => toast.error('Hata', { description: e.message }),
  })

  if (!user) return null
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kullanıcıyı pasifleştir?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{user.name}</span> ({user.email}) pasifleştirilecek.
            Kullanıcı giriş yapamaz ancak geçmiş verileri korunacak. Bu işlem geri alınabilir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>İptal</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {deleteMut.isPending ? 'Pasifleştiriliyor…' : 'Pasifleştir'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Kullanıcı tablosu ────────────────────────────────────────────
function UsersTable({
  users, onEdit, onPermissions, onDeactivate, onResetPassword, actor,
}: {
  users: UserListItem[]
  onEdit: (u: UserListItem) => void
  onResetPassword?: (u: UserListItem) => void
  onPermissions: (u: UserListItem) => void
  onDeactivate: (u: UserListItem) => void
  actor: SessionUser
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[220px]">Kullanıcı</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Ünvan</TableHead>
              <TableHead>Yönetici</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-center">Müşteri</TableHead>
              <TableHead className="text-center">Fırsat</TableHead>
              <TableHead className="text-center">Ast</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Kullanıcı bulunamadı.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer"
                  onClick={() => onEdit(u)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9">
                        {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
                        <AvatarFallback className={cn('bg-gradient-to-br text-white font-semibold text-xs', ROLE_AVATAR_GRADIENT[u.role])}>
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate flex items-center gap-1.5">
                          {u.name}
                          {u.id === actor.id && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                              siz
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><RoleBadge role={u.role} /></TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{u.title ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {u.manager?.name ?? <span className="italic">—</span>}
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium tabular-nums">{u._count?.ownedCustomers ?? 0}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium tabular-nums">{u._count?.ownedDeals ?? 0}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium tabular-nums">{u._count?.subordinates ?? 0}</span>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(u)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Düzenle</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPermissions(u)}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Yetkiler</TooltipContent>
                      </Tooltip>
                      {onResetPassword && u.id !== actor.id && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-violet-50 hover:text-violet-600"
                              onClick={() => onResetPassword(u)}
                            >
                              <LockKeyhole className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Şifre Sıfırla</TooltipContent>
                        </Tooltip>
                      )}
                      {u.status === 'active' && u.id !== actor.id && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-amber-50 hover:text-amber-600"
                              onClick={() => onDeactivate(u)}
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Pasifleştir</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Hiyerarşi ağacı ──────────────────────────────────────────────
interface TreeNode extends UserListItem {
  children: TreeNode[]
}

function buildTree(users: UserListItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  users.forEach((u) => map.set(u.id, { ...u, children: [] }))
  const roots: TreeNode[] = []
  users.forEach((u) => {
    const node = map.get(u.id)!
    if (u.managerId && map.has(u.managerId)) {
      map.get(u.managerId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function HierarchyNode({
  node, depth, actor,
}: {
  node: TreeNode
  depth: number
  actor: SessionUser
}) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors group"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-5 h-5 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
          </span>
        )}

        <Avatar className="w-8 h-8">
          {node.avatarUrl ? <AvatarImage src={node.avatarUrl} alt={node.name} /> : null}
          <AvatarFallback className={cn('bg-gradient-to-br text-white font-semibold text-xs', ROLE_AVATAR_GRADIENT[node.role])}>
            {initials(node.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {node.name}
            {node.id === actor.id && (
              <span className="ml-1.5 text-[10px] text-emerald-600 font-normal">(siz)</span>
            )}
          </span>
          <RoleBadge role={node.role} />
          {node.title && (
            <span className="text-xs text-muted-foreground hidden sm:inline">· {node.title}</span>
          )}
          {node._count?.subordinates ? (
            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-muted/40">
              {node._count.subordinates} ast
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Connector line */}
      {hasChildren && open && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: `${depth * 24 + 18}px` }}
          />
          <div>
            {node.children.map((child) => (
              <HierarchyNode key={child.id} node={child} depth={depth + 1} actor={actor} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HierarchyTree({ users, actor }: { users: UserListItem[]; actor: SessionUser }) {
  const tree = useMemo(() => buildTree(users), [users])

  if (tree.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Hiyerarşi verisi yok.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-violet-600" />
              Organizasyon Hiyerarşisi
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Yönetici → ast ilişkileri. {users.length} kullanıcı, {tree.length} kök düğüm.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[560px] pr-3">
          <div className="space-y-0.5">
            {tree.map((node) => (
              <HierarchyNode key={node.id} node={node} depth={0} actor={actor} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// ─── Ana görünüm ──────────────────────────────────────────────────
export function UsersView() {
  const { user } = useAppStore()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tab, setTab] = useState<string>('list')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserListItem | null>(null)
  const [formSession, setFormSession] = useState(0)
  const [matrixOpen, setMatrixOpen] = useState(false)
  const [deactivateUser, setDeactivateUser] = useState<UserListItem | null>(null)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [resetUser, setResetUser] = useState<UserListItem | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.users,
    queryFn: () => apiGet<UsersResponse>('/api/users'),
    enabled: !!user,
  })

  const users = useMemo(() => data?.items ?? [], [data])

  const filtered = useMemo(() => {
    let list = users
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
    }
    if (roleFilter !== 'all') list = list.filter((u) => u.role === roleFilter)
    if (statusFilter !== 'all') list = list.filter((u) => u.status === statusFilter)
    return list
  }, [users, search, roleFilter, statusFilter])

  const openCreate = () => {
    setEditing(null)
    setFormSession((s) => s + 1)
    setFormOpen(true)
  }
  const openEdit = (u: UserListItem) => {
    setEditing(u)
    setFormSession((s) => s + 1)
    setFormOpen(true)
  }
  const openPermissions = (_u: UserListItem) => {
    // Yetkiler matrisine yönlendir (matris içinde kullanıcı seçilebilir)
    setMatrixOpen(true)
  }
  const openDeactivate = (u: UserListItem) => {
    setDeactivateUser(u)
    setDeactivateOpen(true)
  }
  const openResetPassword = (u: UserListItem) => {
    setResetUser(u)
    setResetOpen(true)
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Oturum açmanız gerekir.
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-500" />
        <p className="text-sm font-medium">Kullanıcılar yüklenemedi</p>
        <p className="text-xs text-muted-foreground mt-1">
          {(error as ApiError)?.message ?? 'Bilinmeyen hata'}
        </p>
      </div>
    )
  }

  const canManage = hasPermission(user, 'users.manage')

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
              Kullanıcı &amp; Rol Yönetimi
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Kullanıcıları, rolleri ve yetkileri yönetin. Organizasyon hiyerarşisini görüntüleyin.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setMatrixOpen(true)}>
              <KeyRound className="w-4 h-4 mr-1.5" /> Yetki Matrisi
            </Button>
            {canManage && (
              <Button
                size="sm"
                onClick={openCreate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <UserPlus className="w-4 h-4 mr-1.5" /> Kullanıcı Davet Et
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!isLoading && <StatsRow users={users} />}

        {/* Tabs: List / Hierarchy */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="list">
              <Users className="w-3.5 h-3.5" /> Kullanıcılar
            </TabsTrigger>
            <TabsTrigger value="hierarchy">
              <GitBranch className="w-3.5 h-3.5" /> Hiyerarşi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4 space-y-4">
            {/* Filtreler */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="İsim veya e-posta ara…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm roller</SelectItem>
                  {(['admin', 'manager', 'rep', 'readonly', 'stock'] as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Durum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm durumlar</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="passive">Pasif</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground ml-auto hidden sm:block">
                {filtered.length} / {users.length} kullanıcı
              </div>
            </div>

            {isLoading ? (
              <UsersTableSkeleton />
            ) : (
              <UsersTable
                users={filtered}
                onEdit={openEdit}
                onPermissions={openPermissions}
                onDeactivate={openDeactivate}
                onResetPassword={canManage ? openResetPassword : undefined}
                actor={user}
              />
            )}
          </TabsContent>

          <TabsContent value="hierarchy" className="mt-4">
            {isLoading ? (
              <Card>
                <CardContent className="p-6 space-y-3">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <HierarchyTree users={users} actor={user} />
            )}
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        {canManage && (
          <UserFormDialog
            key={`${formSession}-${editing ? `edit-${editing.id}` : 'create'}`}
            open={formOpen}
            onOpenChange={setFormOpen}
            editing={editing}
            users={users}
            actor={user}
          />
        )}
        <PermissionMatrixDialog
          open={matrixOpen}
          onOpenChange={setMatrixOpen}
          users={users}
          actor={user}
        />
        <DeactivateDialog
          user={deactivateUser}
          open={deactivateOpen}
          onOpenChange={setDeactivateOpen}
        />
        <PasswordResetDialog
          target={resetUser}
          open={resetOpen}
          onOpenChange={setResetOpen}
        />
      </div>
    </TooltipProvider>
  )
}

// ─── Şifre Sıfırlama Diyaloğu (admin/manager) ────────────────────
function PasswordResetDialog({
  target, open, onOpenChange,
}: {
  target: UserListItem | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setNewPassword('')
    setConfirm('')
    setShow(false)
  }

  const handleSubmit = async () => {
    if (!target) return
    if (newPassword.length < 4) {
      toast.error('Şifre en az 4 karakter olmalı')
      return
    }
    if (newPassword !== confirm) {
      toast.error('Şifreler eşleşmiyor')
      return
    }
    try {
      setSaving(true)
      const res = await apiPost<{ message: string }>('/api/users/password-reset', {
        userId: target.id,
        newPassword,
      })
      toast.success(res.message ?? 'Şifre sıfırlandı')
      qc.invalidateQueries({ queryKey: qk.users })
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şifre sıfırlanamadı')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="w-5 h-5 text-violet-600" />
            Şifre Sıfırla
          </DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <span className="font-medium text-foreground">{target.name}</span> için yeni bir şifre belirleyin.
                Kişinin tüm aktif oturumları kapatılacak ve yeni şifreyle giriş yapması istenecek.
              </>
            ) : 'Kullanıcı seçilmedi.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="rp-new" className="text-xs">Yeni Şifre</Label>
            <div className="relative">
              <Input
                id="rp-new"
                type={show ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {show ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-confirm" className="text-xs">Yeni Şifre (Tekrar)</Label>
            <Input
              id="rp-confirm"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {newPassword && confirm && newPassword !== confirm && (
            <div className="text-xs text-red-600">Şifreler eşleşmiyor</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={saving}>
            İptal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !target || !newPassword || newPassword !== confirm}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1.5" />}
            Şifreyi Sıfırla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
