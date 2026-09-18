'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiPost, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ShieldCheck, Crown, Briefcase, Package, RefreshCw, Check,
  ChevronRight, Lock, UserCog, Coffee, Store,
} from 'lucide-react'
import { ROLE_PERMISSIONS, ROLE_LABELS, ALL_PERMISSIONS } from '@/lib/rbac'
import type { Role, PermissionKey, UserListItem } from '@/types'

// ─── Rol kategorileri (görsel ağaç grupları) ────────────────────────
interface RoleGroup {
  id: string
  label: string
  icon: typeof Crown
  color: string
  roles: Role[]
}

const ROLE_GROUPS: RoleGroup[] = [
  {
    id: 'yonetim',
    label: 'Yönetim',
    icon: Crown,
    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900/60',
    roles: ['superadmin', 'admin', 'manager'],
  },
  {
    id: 'satis',
    label: 'Satış',
    icon: Briefcase,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900/60',
    roles: ['rep', 'readonly'],
  },
  {
    id: 'operasyon',
    label: 'Operasyon',
    icon: Package,
    color: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950/40 dark:border-violet-900/60',
    roles: ['stock'],
  },
  {
    id: 'kafe',
    label: 'Kafe',
    icon: Coffee,
    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900/60',
    roles: ['kasa', 'barmen', 'komi'],
  },
  {
    id: 'market',
    label: 'Market',
    icon: Store,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900/60',
    roles: ['kasiyer', 'depo_sorumlusu'],
  },
]

// Rol için ikon emoji & renk (sol başlık)
const ROLE_VISUAL: Record<Role, { emoji: string; tone: string }> = {
  superadmin: { emoji: '👑', tone: 'text-amber-700 dark:text-amber-300' },
  admin: { emoji: '🛡️', tone: 'text-amber-700 dark:text-amber-300' },
  manager: { emoji: '📋', tone: 'text-amber-700 dark:text-amber-300' },
  rep: { emoji: '💼', tone: 'text-emerald-700 dark:text-emerald-300' },
  readonly: { emoji: '👀', tone: 'text-emerald-700 dark:text-emerald-300' },
  stock: { emoji: '📦', tone: 'text-violet-700 dark:text-violet-300' },
  kasa: { emoji: '☕', tone: 'text-amber-700 dark:text-amber-300' },
  barmen: { emoji: '🍹', tone: 'text-amber-700 dark:text-amber-300' },
  komi: { emoji: '🍽️', tone: 'text-amber-700 dark:text-amber-300' },
  kasiyer: { emoji: '🧾', tone: 'text-emerald-700 dark:text-emerald-300' },
  depo_sorumlusu: { emoji: '🏭', tone: 'text-emerald-700 dark:text-emerald-300' },
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  user: UserListItem | null
  actorRole: Role
  onUpdated?: (updated: UserListItem) => void
}

export function RoleAssignDialog({ open, onOpenChange, user, actorRole, onUpdated }: Props) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Role | null>(null)

  const currentRole = user?.role

  const canAssign = useMemo(
    () => (target: Role): boolean => {
      if (!user) return false
      // Süper admin rolünü yalnızca süper admin verebilir
      if (target === 'superadmin' && actorRole !== 'superadmin') return false
      // Mevcut süper adminlerin rolü yalnızca süper admin tarafından değiştirilebilir
      if (currentRole === 'superadmin' && actorRole !== 'superadmin') return false
      return true
    },
    [user, actorRole, currentRole],
  )

  const assignMut = useMutation({
    mutationFn: async (vars: { userId: string; role: Role }) =>
      apiPost<UserListItem>('/api/admin/assign-role', vars),
    onSuccess: (updated) => {
      toast.success('Rol atandı', {
        description: `${updated.name} → ${ROLE_LABELS[updated.role]}`,
      })
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      onUpdated?.(updated)
      onOpenChange(false)
    },
    onError: (e: ApiError) => toast.error('Hata', { description: e.message }),
  })

  const handleAssign = () => {
    if (!user || !selected) return
    assignMut.mutate({ userId: user.id, role: selected })
  }

  // Seçili rolün yetkileri (preview)
  const previewPerms = selected ? ROLE_PERMISSIONS[selected] : []
  const previewPermLabels = ALL_PERMISSIONS.filter((p) =>
    previewPerms.includes(p.key as PermissionKey),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Rol Ata
          </DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                <span className="font-medium text-foreground">{user.name}</span> kullanıcısına
                yeni bir rol atayın. Rol değişince yetkiler rolün varsayılan yetkileriyle
                sıfırlanır (sonradan ince ayar yapılabilir).
              </>
            ) : (
              'Kullanıcı seçilmedi.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Mevcut rol bilgisi */}
        {user && (
          <div className="rounded-lg border border-dashed bg-muted/30 p-2.5 text-xs flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Mevcut rol:</span>
            <Badge variant="outline" className="font-medium">
              {ROLE_VISUAL[user.role].emoji} {ROLE_LABELS[user.role]}
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {user.permissions.length} yetki tanımlı
            </span>
          </div>
        )}

        {/* Rol ağacı */}
        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-3 pr-1">
            {ROLE_GROUPS.map((group) => {
              const GroupIcon = group.icon
              return (
                <div key={group.id} className="rounded-lg border overflow-hidden">
                  {/* Grup başlığı */}
                  <div
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 border-b font-semibold text-sm',
                      group.color,
                    )}
                  >
                    <GroupIcon className="w-4 h-4" />
                    <span>{group.emoji ?? ''}{group.label}</span>
                  </div>

                  {/* Roller */}
                  <div className="bg-background">
                    {group.roles.map((role, idx) => {
                      const visual = ROLE_VISUAL[role]
                      const isSelected = selected === role
                      const isCurrent = currentRole === role
                      const assignable = canAssign(role)
                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={!assignable}
                          onClick={() => assignable && setSelected(role)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                            'border-b last:border-b-0',
                            isSelected
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/20'
                              : 'hover:bg-muted/40',
                            !assignable && 'opacity-50 cursor-not-allowed',
                          )}
                          style={{ paddingLeft: `${idx === 0 ? 12 : 28}px` }}
                        >
                          {/* Ağaç çizgisi */}
                          {idx > 0 && (
                            <span className="absolute" aria-hidden>
                              <ChevronRight className="w-3 h-3 text-muted-foreground/40 -ml-3" />
                            </span>
                          )}
                          <span className="text-base shrink-0">{visual.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn('font-medium text-sm', visual.tone)}>
                                {ROLE_LABELS[role]}
                              </span>
                              {isCurrent && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 px-1 bg-slate-50 text-slate-600 border-slate-200"
                                >
                                  mevcut
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {ROLE_PERMISSIONS[role].length} yetki
                              </span>
                              {!assignable && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                                  <Lock className="w-3 h-3" /> yetkisiz
                                </span>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {/* Yetki önizleme */}
        {selected && previewPermLabels.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <UserCog className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold">
                {ROLE_LABELS[selected]} rolünün yetkileri ({previewPermLabels.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {previewPermLabels.map((p) => (
                <Badge
                  key={p.key}
                  variant="outline"
                  className="text-[10px] px-1.5 h-5 font-normal bg-background"
                >
                  {p.label}
                </Badge>
              ))}
            </div>
            <Separator className="my-2" />
            <p className="text-[11px] text-muted-foreground">
              İpucu: Rol atandıktan sonra kullanıcılar ekranından yetkileri tek tek ince ayar
              yapabilirsiniz.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assignMut.isPending}>
            İptal
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selected || assignMut.isPending || selected === currentRole || !user}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {assignMut.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4 mr-1.5" />
            )}
            Rolü Ata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
