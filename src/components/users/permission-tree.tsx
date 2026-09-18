'use client'

import { useState, useMemo, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiPatch, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { canDelegatePermission } from '@/lib/rbac'
import type { PermissionKey, SessionUser, UserListItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ChevronRight, ChevronDown, Check, ShieldCheck, Lock, ListTree,
} from 'lucide-react'

// ─── Ağaç yapısı tanımı ──────────────────────────────────────────
interface TreeNode {
  id: string
  label: string
  permission?: PermissionKey // leaf ise yetki anahtarı
  children?: TreeNode[]
}

// Tüm yetki ağacı (görsel gruplama)
const PERMISSION_TREE: TreeNode = {
  id: 'root',
  label: 'Tüm Yetkiler',
  children: [
    {
      id: 'customers',
      label: 'Müşteriler',
      children: [
        {
          id: 'customers-view',
          label: 'Görüntüle',
          children: [
            { id: 'cvo', label: 'Kendi müşterileri', permission: 'customers.view.own' },
            { id: 'cvt', label: 'Ekip müşterileri', permission: 'customers.view.team' },
            { id: 'cva', label: 'Tüm müşteriler', permission: 'customers.view.all' },
          ],
        },
        { id: 'customers-edit', label: 'Düzenle', permission: 'customers.edit' },
        { id: 'customers-delete', label: 'Sil', permission: 'customers.delete' },
      ],
    },
    {
      id: 'leads',
      label: 'Potansiyel Müşteri',
      children: [
        { id: 'leads-import', label: 'Lead içe aktar', permission: 'leads.import' },
        { id: 'leads-view', label: 'Leadleri görüntüle', permission: 'leads.view' },
        { id: 'leads-edit', label: 'Lead düzenle', permission: 'leads.edit' },
        { id: 'maps-search', label: 'Harita araması yap', permission: 'maps.search' },
      ],
    },
    {
      id: 'sales',
      label: 'Satış',
      children: [
        { id: 'deals-manage', label: 'Fırsat yönet', permission: 'deals.manage' },
        { id: 'tasks-manage', label: 'Görev yönet', permission: 'tasks.manage' },
        { id: 'tasks-view', label: 'Görevleri görüntüle', permission: 'tasks.view' },
      ],
    },
    {
      id: 'reports',
      label: 'Raporlar',
      children: [
        { id: 'reports-view', label: 'Raporları görüntüle', permission: 'reports.view' },
        { id: 'export-data', label: 'Veri dışa aktar', permission: 'export.data' },
      ],
    },
    {
      id: 'admin',
      label: 'Yönetim',
      children: [
        { id: 'users-manage', label: 'Kullanıcı yönet', permission: 'users.manage' },
        { id: 'roles-manage', label: 'Rol/yetki yönet', permission: 'roles.manage' },
        { id: 'settings-manage', label: 'Ayarları yönet', permission: 'settings.manage' },
        { id: 'audit-view', label: 'Denetim kayıtlarını gör', permission: 'audit.view' },
        { id: 'erp-manage', label: 'ERP modülünü yönet', permission: 'erp.manage' },
      ],
    },
  ],
}

// Bir alt ağaçtaki tüm yetkileri topla
function collectPermissions(node: TreeNode): PermissionKey[] {
  if (node.permission) return [node.permission]
  if (!node.children) return []
  return node.children.flatMap(collectPermissions)
}

// Tüm yetkileri topla (root hariç)
const ALL_FLAT_PERMS = collectPermissions(PERMISSION_TREE)

// ─── Yaprak düğüm ────────────────────────────────────────────────
function LeafNode({
  node,
  checked,
  editable,
  actorHas,
  onToggle,
}: {
  node: TreeNode
  checked: boolean
  editable: boolean
  actorHas: boolean
  onToggle: (perm: PermissionKey) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors',
            editable ? 'hover:bg-muted cursor-pointer' : 'opacity-60 cursor-not-allowed',
          )}
          onClick={() => editable && onToggle(node.permission!)}
        >
          <Checkbox
            checked={checked}
            disabled={!editable}
            className={cn(
              'pointer-events-none',
              checked && 'border-emerald-600 data-[state=checked]:bg-emerald-600',
            )}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium">{node.label}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{node.permission}</div>
          </div>
          {!actorHas && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1 bg-slate-50 text-slate-500 border-slate-200 shrink-0"
            >
              yetkiniz yok
            </Badge>
          )}
          {!editable && actorHas && (
            <Lock className="w-3 h-3 text-muted-foreground/60 shrink-0" />
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
}

// ─── İç düğüm (grup) ─────────────────────────────────────────────
function GroupNode({
  node,
  depth,
  draftPerms,
  canEdit,
  actorHasPerm,
  onToggle,
}: {
  node: TreeNode
  depth: number
  draftPerms: PermissionKey[]
  canEdit: (perm: PermissionKey) => boolean
  actorHasPerm: (perm: PermissionKey) => boolean
  onToggle: (perm: PermissionKey) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const childPerms = collectPermissions(node)
  const allChecked = childPerms.length > 0 && childPerms.every((p) => draftPerms.includes(p))
  const someChecked = childPerms.some((p) => draftPerms.includes(p))
  const editableCount = childPerms.filter((p) => canEdit(p)).length

  const handleGroupToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (editableCount === 0) return
    if (allChecked) {
      childPerms.forEach((p) => {
        if (canEdit(p) && draftPerms.includes(p)) onToggle(p)
      })
    } else {
      childPerms.forEach((p) => {
        if (canEdit(p) && !draftPerms.includes(p)) onToggle(p)
      })
    }
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.children && node.children.length > 0 ? (
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

        <div onClick={handleGroupToggle} className="flex items-center gap-2 flex-1 cursor-pointer">
          <Checkbox
            checked={allChecked ? true : someChecked ? 'indeterminate' : false}
            disabled={editableCount === 0}
            className={cn(
              'pointer-events-none',
              (allChecked || someChecked) && 'border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=indeterminate]:bg-emerald-600',
            )}
          />
          <span className="font-semibold text-sm">{node.label}</span>
        </div>

        {someChecked && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {childPerms.filter((p) => draftPerms.includes(p)).length}/{childPerms.length}
          </span>
        )}
      </div>

      {open && node.children && (
        <div>
          {node.children.map((child) =>
            child.permission ? (
              <div key={child.id} style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
                <LeafNode
                  node={child}
                  checked={draftPerms.includes(child.permission!)}
                  editable={canEdit(child.permission!)}
                  actorHas={actorHasPerm(child.permission!)}
                  onToggle={onToggle}
                />
              </div>
            ) : (
              <GroupNode
                key={child.id}
                node={child}
                depth={depth + 1}
                draftPerms={draftPerms}
                canEdit={canEdit}
                actorHasPerm={actorHasPerm}
                onToggle={onToggle}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ─── Ana PermissionTree bileşeni ─────────────────────────────────
interface Props {
  targetUser: UserListItem
  actor: SessionUser
  subordinates: string[]
}

export function PermissionTree({ targetUser, actor, subordinates }: Props) {
  const [draftPerms, setDraftPerms] = useState<PermissionKey[]>(targetUser.permissions)
  const [saving, setSaving] = useState(false)

  // canDelegatePermission sarmalayıcı
  const canEdit = useCallback(
    (perm: PermissionKey): boolean => {
      return canDelegatePermission(actor, targetUser.id, perm, subordinates)
    },
    [actor, targetUser, subordinates],
  )

  const actorHasPerm = useCallback(
    (perm: PermissionKey): boolean => actor.permissions.includes(perm),
    [actor.permissions],
  )

  const togglePerm = useCallback(
    (perm: PermissionKey) => {
      if (!canEdit(perm)) return
      setDraftPerms((prev) =>
        prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
      )
    },
    [canEdit],
  )

  const saveMut = useMutation({
    mutationFn: (perms: PermissionKey[]) =>
      apiPatch<UserListItem>(`/api/users/${targetUser.id}`, { permissions: perms }),
    onSuccess: () => {
      toast.success('Yetkiler kaydedildi', {
        description: `${targetUser.name} için yetki ağacı güncellendi.`,
      })
    },
    onError: (e: ApiError) => toast.error('Hata', { description: e.message }),
    onSettled: () => setSaving(false),
  })

  const handleSave = () => {
    setSaving(true)
    saveMut.mutate(draftPerms)
  }

  const handleSelectAll = () => {
    const next = new Set(draftPerms)
    ALL_FLAT_PERMS.forEach((p) => {
      if (canEdit(p)) next.add(p)
    })
    setDraftPerms(Array.from(next))
  }

  const handleClearAll = () => {
    const next = draftPerms.filter((p) => !canEdit(p))
    setDraftPerms(next)
  }

  const editablePerms = useMemo(
    () => ALL_FLAT_PERMS.filter((p) => canEdit(p)),
    [canEdit],
  )
  const editableCheckedCount = draftPerms.filter((p) => canEdit(p)).length

  return (
    <div className="space-y-4">
      {/* Açıklama */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3 flex gap-2.5">
        <ListTree className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 dark:text-emerald-300 space-y-1">
          <p>
            <span className="font-medium">{targetUser.name}</span> kullanıcısının yetkileri ağaç görünümünde.
            Grupları genişlet/küçült, tek tek veya grup bazında yetki ver.
          </p>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
            Düzenleyebileceğiniz yetki sayısı: <span className="font-mono">{editablePerms.length}</span> / {ALL_FLAT_PERMS.length}
          </p>
        </div>
      </div>

      {/* Üst aksiyon barı */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          Toplam <span className="font-semibold text-foreground">{draftPerms.length}</span> yetki seçili
          <span className="text-emerald-700 dark:text-emerald-400 ml-2">
            (düzenlenebilir: {editableCheckedCount})
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll} className="h-7 text-xs">
            <Check className="w-3 h-3 mr-1" /> Tümünü Seç
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="h-7 text-xs hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          >
            Tümünü Kaldır
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ShieldCheck className="w-3 h-3 mr-1" />
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>

      {/* Ağaç */}
      <div className="rounded-lg border">
        <ScrollArea className="h-[380px]">
          <div className="p-2">
            <GroupNode
              node={PERMISSION_TREE}
              depth={0}
              draftPerms={draftPerms}
              canEdit={canEdit}
              actorHasPerm={actorHasPerm}
              onToggle={togglePerm}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-emerald-600 bg-emerald-600 flex items-center justify-center">
            <Check className="w-2 h-2 text-white" />
          </span>
          <span>Aktif yetki</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Lock className="w-3 h-3" />
          <span>Düzenlenemez (astınız değil veya yetkiniz yok)</span>
        </div>
      </div>
    </div>
  )
}
