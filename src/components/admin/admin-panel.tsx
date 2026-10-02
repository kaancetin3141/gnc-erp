'use client'

import { useState, useMemo } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { ROLE_LABELS, ALL_PERMISSIONS, isSuperAdmin } from '@/lib/rbac'
import { getTenantSector, getVisiblePermissionGroups } from '@/lib/tenant-sector'
import type { Role, PermissionKey, UserListItem, Customer, SessionUser } from '@/types'

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  ShieldCheck, Users, Crown, Briefcase, Package, ChevronRight, ChevronDown,
  Search, RefreshCw, Building2, MapPin, Mail, Phone,
  Eye, Edit3, BarChart3, ListTree, Activity, Clock, Hash,
  CircleUser, Layers, Coffee, Store,
  History, Filter, ScrollText, ChevronLeft, Loader2, LayoutGrid,
} from 'lucide-react'
import { initials, formatRelative, formatDateTime, formatDate } from '@/lib/format'
import {
  CUSTOMER_TYPES, CustomerTypeBadge, getCustomerTypeMeta,
  type CustomerTypeKey,
} from './customer-type-badge'
import { CustomerTypeDialog } from './customer-type-dialog'
import { RoleAssignDialog } from './role-assign-dialog'
import { PortfolioManager } from './portfolio-manager'

// ─── API tipleri ────────────────────────────────────────────────
interface OverviewResponse {
  customerByType: Record<string, number>
  userByRole: Record<string, number>
  systemStats: {
    totalCustomers: number
    totalUsers: number
    totalDeals: number
    totalOrders: number
    totalInvoices: number
    totalTasks: number
    totalLeads: number
    totalProducts: number
    openTasks: number
    openDealsCount: number
    openDealsValue: number
    pendingInvoices: number
  }
  recentActivity: {
    id: string
    actorId: string | null
    actor?: { id: string; name: string } | null
    action: string
    entity: string
    entityId: string | null
    createdAt: string
  }[]
  generatedAt: string
}

interface CustomerListResponse {
  items: Customer[]
  total: number
  limit: number
  offset: number
}
interface UsersResponse {
  items: UserListItem[]
  total: number
}

// ─── Rol görsel eşlemesi ────────────────────────────────────────
const ROLE_TREE_GROUPS: {
  id: string
  label: string
  icon: typeof Crown
  color: string
  roles: { role: Role; emoji: string }[]
}[] = [
  {
    id: 'yonetim',
    label: 'Yönetim',
    icon: Crown,
    color: 'text-amber-600',
    roles: [
      { role: 'superadmin', emoji: '👑' },
      { role: 'admin', emoji: '🛡️' },
      { role: 'manager', emoji: '📋' },
    ],
  },
  {
    id: 'satis',
    label: 'Satış',
    icon: Briefcase,
    color: 'text-emerald-600',
    roles: [
      { role: 'rep', emoji: '💼' },
      { role: 'readonly', emoji: '👀' },
    ],
  },
  {
    id: 'operasyon',
    label: 'Operasyon',
    icon: Package,
    color: 'text-violet-600',
    roles: [
      { role: 'stock', emoji: '📦' },
    ],
  },
  {
    id: 'kafe',
    label: 'Kafe',
    icon: Coffee,
    color: 'text-amber-600',
    roles: [
      { role: 'kasa', emoji: '☕' },
      { role: 'barmen', emoji: '🍹' },
      { role: 'komi', emoji: '🍽️' },
    ],
  },
  {
    id: 'market',
    label: 'Market',
    icon: Store,
    color: 'text-emerald-600',
    roles: [
      { role: 'kasiyer', emoji: '🧾' },
      { role: 'depo_sorumlusu', emoji: '🏭' },
    ],
  },
]

// ─── Sol panel: ağaç ─────────────────────────────────────────────
type TreeSelection =
  | { kind: 'all' }
  | { kind: 'customerType'; value: CustomerTypeKey }
  | { kind: 'userRole'; value: Role }

function TreePanel({
  overview,
  selection,
  onSelect,
}: {
  overview: OverviewResponse | undefined
  selection: TreeSelection
  onSelect: (s: TreeSelection) => void
}) {
  const [customersOpen, setCustomersOpen] = useState(true)
  const [usersOpen, setUsersOpen] = useState(true)

  const totalCustomers = overview
    ? Object.values(overview.customerByType).reduce((s, n) => s + n, 0)
    : 0
  const totalUsers = overview
    ? Object.values(overview.userByRole).reduce((s, n) => s + n, 0)
    : 0

  return (
    <div className="space-y-1">
      {/* Tüm müşteriler */}
      <Collapsible open={customersOpen} onOpenChange={setCustomersOpen}>
        <div className="px-2 py-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          <Users className="w-3.5 h-3.5" />
          <span className="flex-1">Müşteriler</span>
          <span className="tabular-nums">{totalCustomers}</span>
        </div>
        <CollapsibleContent>
          <div className="space-y-0.5 mb-2">
            <TreeRow
              active={selection.kind === 'all'}
              onClick={() => onSelect({ kind: 'all' })}
              icon={<BarChart3 className="w-4 h-4" />}
              label="Tüm Müşteriler"
              count={totalCustomers}
              tone="text-slate-600 dark:text-slate-300"
              dotClass="bg-slate-400"
            />
            {CUSTOMER_TYPES.map((t) => {
              const Icon = t.icon
              const count = overview?.customerByType[t.value] ?? 0
              return (
                <TreeRow
                  key={t.value}
                  active={selection.kind === 'customerType' && selection.value === t.value}
                  onClick={() => onSelect({ kind: 'customerType', value: t.value })}
                  icon={<Icon className="w-4 h-4" />}
                  label={t.label}
                  count={count}
                  tone={t.color.split(' ')[0]}
                  dotClass={t.dot}
                />
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator className="my-2" />

      {/* Kullanıcılar */}
      <Collapsible open={usersOpen} onOpenChange={setUsersOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full px-2 py-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground transition-colors">
            {usersOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <CircleUser className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Kullanıcılar</span>
            <span className="tabular-nums">{totalUsers}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1.5">
            {ROLE_TREE_GROUPS.map((group) => {
              const GroupIcon = group.icon
              const groupTotal = group.roles.reduce(
                (s, r) => s + (overview?.userByRole[r.role] ?? 0),
                0,
              )
              return (
                <div key={group.id}>
                  <div className={cn('px-2 py-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide', group.color)}>
                    <GroupIcon className="w-3 h-3" />
                    <span className="flex-1">{group.label}</span>
                    <span className="tabular-nums text-muted-foreground">{groupTotal}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.roles.map((r) => (
                      <TreeRow
                        key={r.role}
                        active={selection.kind === 'userRole' && selection.value === r.role}
                        onClick={() => onSelect({ kind: 'userRole', value: r.role })}
                        icon={<span className="text-sm leading-none">{r.emoji}</span>}
                        label={ROLE_LABELS[r.role]}
                        count={overview?.userByRole[r.role] ?? 0}
                        tone="text-foreground"
                        dotClass="bg-muted-foreground/50"
                        indent
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function TreeRow({
  active, onClick, icon, label, count, tone, dotClass, indent,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
  tone: string
  dotClass: string
  indent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className={cn(
        'w-full relative flex items-center gap-2 pr-2 py-1.5 rounded-md text-sm transition-colors group',
        indent ? 'pl-7' : 'pl-2',
        active
          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-medium'
          : 'hover:bg-muted/60 text-foreground/80',
      )}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-emerald-600 rounded-r-full" />}
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotClass)} />
      <span className={cn('shrink-0', tone)}>{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground group-hover:text-foreground">
        {count}
      </span>
    </button>
  )
}

// ─── Orta panel: müşteri tablosu ─────────────────────────────────
function CustomerTable({
  customers, isLoading, onSelectCustomer, selectedId, onChangeType,
}: {
  customers: Customer[]
  isLoading: boolean
  onSelectCustomer: (c: Customer) => void
  selectedId: string | null
  onChangeType: (c: Customer) => void
}) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  if (customers.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
        Bu filtrede müşteri yok.
      </div>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead className="pl-3 min-w-[200px] text-xs uppercase tracking-wider text-muted-foreground">Müşteri</TableHead>
          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Tür</TableHead>
          <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider text-muted-foreground">Sektör</TableHead>
          <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider text-muted-foreground">Şehir</TableHead>
          <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider text-muted-foreground">Sorumlu</TableHead>
          <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
          <TableHead className="text-right pr-3 text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((c) => {
          const meta = getCustomerTypeMeta(c.customerType)
          return (
            <TableRow
              key={c.id}
              onClick={() => onSelectCustomer(c)}
              className={cn(
                'cursor-pointer group',
                selectedId === c.id && 'bg-emerald-50/60 dark:bg-emerald-950/20',
              )}
            >
              <TableCell className="pl-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {c.logo ? (
                     
                    <img src={c.logo} alt={c.name} className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate max-w-[200px]">{c.name}</div>
                    {c._count && (
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <Layers className="w-2.5 h-2.5" />
                        {c._count.deals} fırsat · {c._count.activities} aktivite
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <CustomerTypeBadge type={c.customerType} />
              </TableCell>
              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{c.sector}</TableCell>
              <TableCell className="hidden lg:table-cell text-xs">
                {c.city ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MapPin className="w-3 h-3" />{c.city}
                  </span>
                ) : '—'}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-xs">
                {c.owner ? (
                  <span className="truncate inline-block max-w-[120px] text-muted-foreground">{c.owner.name}</span>
                ) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] px-1.5',
                    c.status === 'aktif'
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40'
                      : 'text-slate-600 bg-slate-50 border-slate-200',
                  )}
                >
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right pr-3">
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onSelectCustomer(c)}>
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
                        className="h-8 px-2 text-xs"
                        onClick={() => onChangeType(c)}
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1" />
                        <span className="hidden sm:inline">Tür</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Tür Değiştir</TooltipContent>
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Orta panel: kullanıcı tablosu ───────────────────────────────
function UserTable({
  users, isLoading, onSelectUser, selectedId, onChangeRole, currentActorId,
}: {
  users: UserListItem[]
  isLoading: boolean
  onSelectUser: (u: UserListItem) => void
  selectedId: string | null
  onChangeRole: (u: UserListItem) => void
  currentActorId: string
}) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  if (users.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <CircleUser className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
        Bu rolde kullanıcı yok.
      </div>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead className="pl-3 min-w-[200px] text-xs uppercase tracking-wider text-muted-foreground">Kullanıcı</TableHead>
          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Rol</TableHead>
          <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider text-muted-foreground">Yönetici</TableHead>
          <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider text-muted-foreground">Yetki</TableHead>
          <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider text-muted-foreground">Durum</TableHead>
          <TableHead className="text-right pr-3 text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow
            key={u.id}
            onClick={() => onSelectUser(u)}
            className={cn(
              'cursor-pointer group',
              selectedId === u.id && 'bg-emerald-50/60 dark:bg-emerald-950/20',
            )}
          >
            <TableCell className="pl-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={u.avatarUrl ?? undefined} alt={u.name} />
                  <AvatarFallback className="text-[11px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {initials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate max-w-[180px]">
                    {u.name}
                    {u.id === currentActorId && (
                      <span className="ml-1.5 text-[10px] text-emerald-600 font-normal">(siz)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{u.email}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60"
              >
                {ROLE_LABELS[u.role]}
              </Badge>
            </TableCell>
            <TableCell className="hidden md:table-cell text-xs">
              {u.manager ? (
                <span className="truncate inline-block max-w-[120px] text-muted-foreground">{u.manager.name}</span>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground tabular-nums">
              {u.permissions.length} yetki
              {u._count?.subordinates ? ` · ${u._count.subordinates} ast` : ''}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5',
                  u.status === 'active'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40'
                    : 'text-slate-600 bg-slate-50 border-slate-200',
                )}
              >
                {u.status === 'active' ? 'Aktif' : u.status === 'passive' ? 'Pasif' : u.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right pr-3">
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onSelectUser(u)}>
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
                      className="h-8 px-2 text-xs"
                      onClick={() => onChangeRole(u)}
                      disabled={u.id === currentActorId}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                      <span className="hidden sm:inline">Rol</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Rol Değiştir</TooltipContent>
                </Tooltip>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ─── Sağ panel: müşteri detayı ───────────────────────────────────
function CustomerDetail({ customer, onOpen360, onChangeType }: {
  customer: Customer
  onOpen360: () => void
  onChangeType: () => void
}) {
  const meta = getCustomerTypeMeta(customer.customerType)
  const Icon = meta.icon
  return (
    <div className="space-y-4">
      {/* Üst kart */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          {customer.logo ? (
             
            <img src={customer.logo} alt={customer.name} className="w-14 h-14 rounded-xl object-cover border border-border" />
          ) : (
            <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center', meta.color)}>
              <Icon className="w-6 h-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{customer.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <CustomerTypeBadge type={customer.customerType} size="md" />
              <Badge variant="outline" className="text-[10px] px-1.5">
                {customer.sector}
              </Badge>
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
              {customer.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{customer.city}
                </span>
              )}
              {customer.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />{customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
                  <Mail className="w-3 h-3" />{customer.email}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onOpen360}>
            <Eye className="w-3.5 h-3.5 mr-1" /> 360° Görünüm
          </Button>
          <Button size="sm" className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onChangeType}>
            <Edit3 className="w-3.5 h-3.5 mr-1" /> Tür Değiştir
          </Button>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Fırsat" value={customer._count?.deals ?? 0} icon={Briefcase} tone="text-emerald-600" />
        <StatBox label="Aktivite" value={customer._count?.activities ?? 0} icon={Activity} tone="text-amber-600" />
        <StatBox label="Görev" value={customer._count?.tasks ?? 0} icon={ListTree} tone="text-violet-600" />
        <StatBox label="İletişim" value={customer._count?.contacts ?? 0} icon={Users} tone="text-slate-600" />
      </div>

      {/* Açıklama */}
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Tür Bilgisi
        </div>
        <p className="text-xs text-foreground/80">
          <span className="font-medium">{meta.emoji} {meta.label}:</span> {meta.description}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Müşteri {formatRelative(customer.createdAt)} tarihinde eklendi.
          {customer.lastActivityAt && (
            <> Son aktivite: {formatRelative(customer.lastActivityAt)}.</>
          )}
        </p>
      </div>
    </div>
  )
}

// ─── Sağ panel: kullanıcı detayı ─────────────────────────────────
function UserDetail({ user, currentUser, onChangeRole }: {
  user: UserListItem
  currentUser: SessionUser | null
  onChangeRole: () => void
}) {
  // Yetki grupları — YALNIZCA giriş yapmış kullanıcının sektörüne göre
  // görünür gruplar filtrelenir. Superadmin tüm grupları görür.
  const permByGroup = useMemo(() => {
    const map: Record<string, { key: PermissionKey; label: string }[]> = {}

    // Görünür grup seti — superadmin null (filtre yok), admin kendi sektörü
    const visibleGroups: Set<string> | null = (() => {
      if (!currentUser) return new Set<string>()
      if (isSuperAdmin(currentUser.role)) return null // tüm gruplar
      // admin rolü → tenant sektörüne göre filtre
      // GNC Platform tenant'ı için getTenantSector 'crm' döner ama
      // superadmin olduğu için zaten null döner (yukarıdaki kontrol).
      // Sadece normal admin rolündeki kullanıcılar buraya düşer.
      const sector = getTenantSector(currentUser.tenant.name)
      const groups = getVisiblePermissionGroups(sector)
      return groups ? new Set<string>(groups) : null
    })()

    for (const p of ALL_PERMISSIONS) {
      if (!user.permissions.includes(p.key)) continue
      if (visibleGroups && !visibleGroups.has(p.group)) continue
      if (!map[p.group]) map[p.group] = []
      map[p.group].push({ key: p.key, label: p.label })
    }
    return map
  }, [user.permissions, currentUser])

  // Görünür yetki sayısı (filtre sonrası)
  const visiblePermCount = useMemo(
    () => Object.values(permByGroup).reduce((s, g) => s + g.length, 0),
    [permByGroup],
  )

  // Toplam yetki sayısı (filtre öncesi — bilgi amaçlı)
  const totalPermCount = user.permissions.length

  // Filtre aktif mi? (admin rolü ve süperadmin değilse)
  const isFiltered = !!currentUser && !isSuperAdmin(currentUser.role)

  return (
    <div className="space-y-4">
      {/* Üst kart */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <Avatar className="w-14 h-14 shrink-0">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
            <AvatarFallback className="text-base bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{user.name}</h3>
            {user.title && (
              <div className="text-xs text-muted-foreground truncate">{user.title}</div>
            )}
            <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <Mail className="w-3 h-3" />{user.email}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] px-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60">
                {ROLE_LABELS[user.role]}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5',
                  user.status === 'active'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40'
                    : 'text-slate-600 bg-slate-50 border-slate-200',
                )}
              >
                {user.status === 'active' ? 'Aktif' : user.status}
              </Badge>
            </div>
          </div>
        </div>
        {user.manager && (
          <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            Yönetici: <span className="font-medium text-foreground">{user.manager.name}</span>
          </div>
        )}
        <Button size="sm" className="mt-3 w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onChangeRole}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Rol / Yetki Düzenle
        </Button>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Müşteri" value={user._count?.ownedCustomers ?? 0} icon={Building2} tone="text-emerald-600" />
        <StatBox label="Fırsat" value={user._count?.ownedDeals ?? 0} icon={Briefcase} tone="text-amber-600" />
        <StatBox label="Ast" value={user._count?.subordinates ?? 0} icon={Users} tone="text-violet-600" />
        <StatBox label="Görev" value={user._count?.assignedTasks ?? 0} icon={ListTree} tone="text-slate-600" />
      </div>

      {/* Yetkiler */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tanımlı Yetkiler
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {isFiltered ? `${visiblePermCount} / ${totalPermCount}` : visiblePermCount}
          </span>
        </div>
        {isFiltered && (
          <div className="mb-2 text-[10px] px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60">
            Yetki matrisi kendi sektörünüze göre filtrelenmiştir.
            Diğer sektör yetkileri gizlenmiştir.
          </div>
        )}
        <ScrollArea className="max-h-72">
          <div className="space-y-2 pr-1">
            {Object.entries(permByGroup).map(([group, perms]) => (
              <div key={group}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">
                  {group}
                </div>
                <div className="flex flex-wrap gap-1">
                  {perms.map((p) => (
                    <Badge
                      key={p.key}
                      variant="outline"
                      className="text-[10px] px-1.5 h-5 font-normal bg-background"
                    >
                      {p.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
            {visiblePermCount === 0 && (
              <div className="text-xs text-muted-foreground italic">
                {isFiltered
                  ? 'Görünür yetki yok. Sektörünüze ait yetki yok veya atanmamış.'
                  : 'Yetki tanımlı değil.'}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Ast kullanıcılar */}
      {user.subordinates && user.subordinates.length > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Ast Kullanıcılar ({user.subordinates.length})
          </div>
          <div className="space-y-1">
            {user.subordinates.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <Avatar className="w-5 h-5">
                  <AvatarFallback className="text-[9px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {initials(s.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">{s.name}</span>
                <Badge variant="outline" className="text-[9px] px-1 h-4">
                  {ROLE_LABELS[s.role]}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({
  label, value, icon: Icon, tone,
}: {
  label: string
  value: number
  icon: typeof Users
  tone: string
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={cn('w-3.5 h-3.5', tone)} />
      </div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

// ─── Denetim Kayıtları (audit log) API tipleri ─────────────────────
interface AuditLogItem {
  id: string
  action: string
  entity: string
  entityId: string | null
  before: unknown
  after: unknown
  createdAt: string
  actor: { id: string; name: string; email: string } | null
}
interface AuditLogsResponse {
  items: AuditLogItem[]
  nextCursor: string | null
}

// Audit log: varlık etiketleri (Türkçe)
const AUDIT_ENTITY_LABELS: Record<string, string> = {
  customer: 'Müşteri',
  deal: 'Fırsat',
  invoice: 'Fatura',
  quote: 'Teklif',
  order: 'Sipariş',
  task: 'Görev',
  user: 'Kullanıcı',
  lead: 'Lead',
  product: 'Ürün',
  session: 'Oturum',
  activity: 'Aktivite',
  note: 'Not',
  site: 'Site',
  cafe: 'Kafe',
  market: 'Market',
  expense: 'Gider',
  message: 'Mesaj',
  automation: 'Otomasyon',
}

// Audit log: işlem renkleri
const AUDIT_ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  update: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  delete: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
  login: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300',
  logout: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300',
  import: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300',
  export: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300',
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Oluştur',
  update: 'Güncelle',
  delete: 'Sil',
  login: 'Giriş',
  logout: 'Çıkış',
  import: 'İçe Aktar',
  export: 'Dışa Aktar',
}

const AUDIT_ENTITY_OPTIONS = [
  { value: 'customer', label: 'Müşteri' },
  { value: 'deal', label: 'Fırsat' },
  { value: 'invoice', label: 'Fatura' },
  { value: 'quote', label: 'Teklif' },
  { value: 'order', label: 'Sipariş' },
  { value: 'task', label: 'Görev' },
  { value: 'lead', label: 'Lead' },
  { value: 'user', label: 'Kullanıcı' },
  { value: 'product', label: 'Ürün' },
  { value: 'session', label: 'Oturum' },
  { value: 'activity', label: 'Aktivite' },
  { value: 'note', label: 'Not' },
  { value: 'site', label: 'Site' },
  { value: 'cafe', label: 'Kafe' },
  { value: 'market', label: 'Market' },
  { value: 'expense', label: 'Gider' },
  { value: 'message', label: 'Mesaj' },
  { value: 'automation', label: 'Otomasyon' },
]

const AUDIT_ACTION_OPTIONS = [
  { value: 'create', label: 'Oluştur' },
  { value: 'update', label: 'Güncelle' },
  { value: 'delete', label: 'Sil' },
  { value: 'login', label: 'Giriş' },
  { value: 'logout', label: 'Çıkış' },
  { value: 'import', label: 'İçe Aktar' },
  { value: 'export', label: 'Dışa Aktar' },
]

// ─── JSON formatlama yardımcısı ──────────────────────────────────
function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// ─── Denetim Kayıtları Tab ─────────────────────────────────────────
function AuditLogsTab() {
  const { user } = useAppStore()
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [actorFilter, setActorFilter] = useState<string>('all')
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null)

  // Aynı tenant'taki kullanıcıları çek (actor filtresi için)
  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users', { forAudit: true }],
    queryFn: () => apiGet<UsersResponse>('/api/admin/users?limit=500'),
    enabled: !!user,
  })
  const users = usersData?.items ?? []

  // useInfiniteQuery ile cursor-based pagination
  const filtersKey = useMemo(() => ({
    entity: entityFilter,
    action: actionFilter,
    actorId: actorFilter,
  }), [entityFilter, actionFilter, actorFilter])

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage,
    isLoading, isFetching, refetch,
  } = useInfiniteQuery({
    queryKey: ['audit-logs', filtersKey],
    queryFn: ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams({ limit: '100' })
      if (filtersKey.entity !== 'all') params.set('entity', filtersKey.entity)
      if (filtersKey.action !== 'all') params.set('action', filtersKey.action)
      if (filtersKey.actorId !== 'all') params.set('actorId', filtersKey.actorId)
      if (pageParam) params.set('cursor', pageParam)
      return apiGet<AuditLogsResponse>(`/api/audit?${params.toString()}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: AuditLogsResponse) => lastPage.nextCursor,
    enabled: !!user,
  })

  const allItems: AuditLogItem[] = useMemo(() => {
    if (!data) return []
    return data.pages.flatMap((p) => p.items)
  }, [data])

  const handleResetFilters = () => {
    setEntityFilter('all')
    setActionFilter('all')
    setActorFilter('all')
  }

  const hasActiveFilters = entityFilter !== 'all' || actionFilter !== 'all' || actorFilter !== 'all'

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-600" />
              Denetim Kayıtları
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Sistemde yapılan tüm değişiklikler — müşteri, fırsat, fatura, oturum ve daha fazlası.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching && !isFetchingNextPage}>
            <RefreshCw className={cn('w-4 h-4 mr-1.5', isFetching && !isFetchingNextPage && 'animate-spin')} />
            Yenile
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filtreler */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtrele:</span>
          </div>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Varlık" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm varlıklar</SelectItem>
              {AUDIT_ENTITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="İşlem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm işlemler</SelectItem>
              {AUDIT_ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actorFilter} onValueChange={setActorFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Aktör" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kullanıcılar</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABELS[u.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleResetFilters}>
              Filtreleri Temizle
            </Button>
          )}
          <Badge variant="outline" className="ml-auto text-[11px]">
            {allItems.length} kayıt{hasNextPage ? '+' : ''}
          </Badge>
        </div>

        {/* Tablo */}
        <div className="rounded-lg border overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : allItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <ScrollText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              Bu filtrede denetim kaydı bulunamadı.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-muted/60 hover:bg-muted/60 border-b">
                    <TableHead className="pl-3 min-w-[150px] text-xs uppercase tracking-wider text-muted-foreground">Tarih</TableHead>
                    <TableHead className="min-w-[160px] text-xs uppercase tracking-wider text-muted-foreground">Aktör</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">İşlem</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Varlık</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider text-muted-foreground">ID</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Özet</TableHead>
                    <TableHead className="text-right pr-3 text-xs uppercase tracking-wider text-muted-foreground">Detay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allItems.map((log) => {
                    const actionColor = AUDIT_ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300'
                    const entityLabel = AUDIT_ENTITY_LABELS[log.entity] ?? log.entity
                    const actionLabel = AUDIT_ACTION_LABELS[log.action] ?? log.action
                    return (
                      <TableRow
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="cursor-pointer group hover:bg-muted/40"
                      >
                        <TableCell className="pl-3 text-xs">
                          <div className="font-medium text-foreground tabular-nums">
                            {formatDateTime(log.createdAt)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatRelative(log.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="w-7 h-7 shrink-0">
                              <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                {log.actor ? initials(log.actor.name) : '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate max-w-[140px]">
                                {log.actor?.name ?? 'Sistem'}
                              </div>
                              {log.actor?.email && (
                                <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                  {log.actor.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 h-5', actionColor)}>
                            {actionLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {entityLabel}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-[11px]">
                          {log.entityId ? (
                            <code className="text-muted-foreground font-mono">
                              {log.entityId.length > 12 ? `${log.entityId.slice(0, 6)}…${log.entityId.slice(-4)}` : log.entityId}
                            </code>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="text-muted-foreground">
                            {actionLabel} · {entityLabel}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedLog(log)
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>before/after farkı</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Daha fazla yükle */}
        {hasNextPage && (
          <div className="flex justify-center pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Yükleniyor…</>
              ) : (
                <>Daha fazla yükle</>
              )}
            </Button>
          </div>
        )}

        {/* Bilgi notu */}
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40">
          <ScrollText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            Denetim kayıtları, tüm create/update/delete/login işlemlerinde otomatik olarak yazılır.
            before/after alanlarını görmek için bir satıra tıklayın. KVKK kapsamında 5 yıl saklanır.
          </p>
        </div>
      </CardContent>

      {/* before/after diff diyalogu */}
      <Dialog open={!!selectedLog} onOpenChange={(v) => !v && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {selectedLog && (() => {
                const actionColor = AUDIT_ACTION_COLORS[selectedLog.action] ?? ''
                return (
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 h-5', actionColor)}>
                    {AUDIT_ACTION_LABELS[selectedLog.action] ?? selectedLog.action}
                  </Badge>
                )
              })()}
              <span className="text-muted-foreground">·</span>
              <span>{selectedLog ? (AUDIT_ENTITY_LABELS[selectedLog.entity] ?? selectedLog.entity) : ''}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedLog?.actor && (
                <>
                  Aktör: <span className="font-medium text-foreground">{selectedLog.actor.name}</span>
                  {' · '}
                </>
              )}
              {selectedLog && formatDateTime(selectedLog.createdAt)}
              {selectedLog?.entityId && (
                <>
                  {' · ID: '}<code className="font-mono text-muted-foreground">{selectedLog.entityId}</code>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 overflow-hidden">
            <div className="rounded-lg border bg-rose-50/30 dark:bg-rose-950/10 p-3 flex flex-col min-h-0">
              <div className="flex items-center gap-1.5 mb-2 shrink-0">
                <ChevronLeft className="w-3.5 h-3.5 text-rose-600" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">Before (Önceki)</span>
              </div>
              <pre className="text-[11px] leading-relaxed font-mono overflow-auto flex-1 bg-card border rounded-md p-2.5" style={{ scrollbarWidth: 'thin' }}>
                {selectedLog ? prettyJson(selectedLog.before) : '—'}
              </pre>
            </div>
            <div className="rounded-lg border bg-emerald-50/30 dark:bg-emerald-950/10 p-3 flex flex-col min-h-0">
              <div className="flex items-center gap-1.5 mb-2 shrink-0">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">After (Yeni)</span>
              </div>
              <pre className="text-[11px] leading-relaxed font-mono overflow-auto flex-1 bg-card border rounded-md p-2.5" style={{ scrollbarWidth: 'thin' }}>
                {selectedLog ? prettyJson(selectedLog.after) : '—'}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ─── Son aktivite zaman çizelgesi (center alt) ───────────────────
function RecentActivity({ activities }: { activities: OverviewResponse['recentActivity'] }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        Son aktivite yok.
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {activities.slice(0, 8).map((a) => (
        <div key={a.id} className="flex items-start gap-2 text-xs p-2 rounded-md hover:bg-muted/40">
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center justify-center shrink-0 text-[10px] font-semibold">
            {a.actor?.name ? initials(a.actor.name) : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground truncate max-w-[120px]">
                {a.actor?.name ?? 'Sistem'}
              </span>
              <Badge variant="outline" className="text-[9px] px-1 h-4 font-normal">
                {a.action}
              </Badge>
              <span className="text-muted-foreground text-[10px]">{a.entity}</span>
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="w-2.5 h-2.5" />
              {formatRelative(a.createdAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Ana AdminPanel ──────────────────────────────────────────────
export function AdminPanel() {
  const { user, openCustomer } = useAppStore()
  const [selection, setSelection] = useState<TreeSelection>({ kind: 'all' })
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null)
  const [typeDialogCustomer, setTypeDialogCustomer] = useState<Customer | null>(null)
  const [roleDialogUser, setRoleDialogUser] = useState<UserListItem | null>(null)

  // Overview verisi
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview, isFetching: overviewFetching } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiGet<OverviewResponse>('/api/admin/overview'),
    refetchInterval: 30_000,
  })

  // Müşteri listesi (customerType seçilince veya 'all')
  const customerQueryParams = useMemo(() => {
    const p: Record<string, string> = { limit: '200' }
    if (selection.kind === 'customerType') p.customerType = selection.value
    if (search) p.search = search
    return p
  }, [selection, search])

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['admin', 'customers', customerQueryParams],
    queryFn: () => {
      const qs = new URLSearchParams(customerQueryParams).toString()
      return apiGet<CustomerListResponse>(`/api/customers?${qs}`)
    },
    enabled: selection.kind === 'all' || selection.kind === 'customerType',
  })

  // Kullanıcı listesi (userRole seçilince)
  const userQueryParams = useMemo(() => {
    const p: Record<string, string> = {}
    if (selection.kind === 'userRole') p.role = selection.value
    if (search) p.search = search
    return p
  }, [selection, search])

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users', userQueryParams],
    queryFn: () => {
      const qs = new URLSearchParams(userQueryParams).toString()
      return apiGet<UsersResponse>(`/api/admin/users?${qs}`)
    },
    enabled: selection.kind === 'userRole',
  })

  const customers = customersData?.items ?? []
  const users = usersData?.items ?? []

  const isCustomerMode = selection.kind === 'all' || selection.kind === 'customerType'

  const handleSelect = (s: TreeSelection) => {
    setSelection(s)
    setSelectedCustomer(null)
    setSelectedUser(null)
    setSearch('')
  }

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setSelectedUser(null)
  }
  const handleSelectUser = (u: UserListItem) => {
    setSelectedUser(u)
    setSelectedCustomer(null)
  }

  const handleOpenCustomer360 = () => {
    if (selectedCustomer) {
      openCustomer(selectedCustomer.id)
    }
  }

  const handleUpdatedCustomer = (updated: Customer) => {
    setSelectedCustomer(updated)
    setTypeDialogCustomer(null)
    refetchOverview()
  }
  const handleUpdatedUser = (updated: UserListItem) => {
    setSelectedUser(updated)
    setRoleDialogUser(null)
    refetchOverview()
  }

  // Toplam sayaçlar header için
  const totalCustomers = overview
    ? Object.values(overview.customerByType).reduce((s, n) => s + n, 0)
    : 0
  const totalUsers = overview
    ? Object.values(overview.userByRole).reduce((s, n) => s + n, 0)
    : 0

  // Center başlığı
  const centerTitle = useMemo(() => {
    if (selection.kind === 'all') return 'Tüm Müşteriler'
    if (selection.kind === 'customerType') {
      return getCustomerTypeMeta(selection.value).label
    }
    if (selection.kind === 'userRole') return ROLE_LABELS[selection.value]
    return 'Liste'
  }, [selection])

  const centerCount = isCustomerMode ? customers.length : users.length

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Admin Paneli
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Müşteri türleri ve kullanıcı rolleri tek ekrandan yönetilir ·{' '}
            <span className="font-medium text-foreground">{totalCustomers}</span> müşteri ·{' '}
            <span className="font-medium text-foreground">{totalUsers}</span> kullanıcı
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchOverview()} disabled={overviewFetching}>
          <RefreshCw className={cn('w-4 h-4 mr-1.5', overviewFetching && 'animate-spin')} />
          Yenile
        </Button>
      </div>

      {/* Sistem istatistik mini kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <SystemStat
          label="Müşteri" value={overview?.systemStats.totalCustomers}
          icon={Building2} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        />
        <SystemStat
          label="Fırsat" value={overview?.systemStats.totalDeals}
          icon={Briefcase} color="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        />
        <SystemStat
          label="Sipariş" value={overview?.systemStats.totalOrders}
          icon={Package} color="bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
        />
        <SystemStat
          label="Fatura" value={overview?.systemStats.totalInvoices}
          icon={Hash} color="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
        />
        <SystemStat
          label="Açık Görev" value={overview?.systemStats.openTasks}
          icon={ListTree} color="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
        />
        <SystemStat
          label="Lead" value={overview?.systemStats.totalLeads}
          icon={MapPin} color="bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300"
        />
      </div>

      {/* Tab'lar: Müşteriler & Roller + Denetim Kayıtları */}
      <Tabs defaultValue="customers" className="w-full space-y-0">
        <TabsList className="flex flex-wrap h-auto p-1 gap-1">
          <TabsTrigger value="customers" className="text-xs gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Müşteriler &amp; Roller
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs gap-1.5">
            <History className="w-3.5 h-3.5" />
            Denetim Kayıtları
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="text-xs gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" />
            Portfolyo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          {/* 3 kolon layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sol: Ağaç */}
        <Card className="lg:col-span-3 xl:col-span-3 h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <ListTree className="w-4 h-4 text-emerald-600" />
              Tür & Rol Ağacı
            </CardTitle>
            <CardDescription className="text-xs">
              Müşteri türü veya kullanıcı rolü seçerek filtreleyin
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {overviewLoading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <TreePanel
                overview={overview}
                selection={selection}
                onSelect={handleSelect}
              />
            )}
          </CardContent>
        </Card>

        {/* Orta: Liste */}
        <Card className="lg:col-span-5 xl:col-span-5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-sm truncate">{centerTitle}</CardTitle>
                <CardDescription className="text-xs">
                  {centerCount} kayıt listeleniyor
                </CardDescription>
              </div>
              <div className="relative w-32 sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ara..."
                  className="h-8 text-xs pl-7"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isCustomerMode ? (
              <CustomerTable
                customers={customers}
                isLoading={customersLoading}
                onSelectCustomer={handleSelectCustomer}
                selectedId={selectedCustomer?.id ?? null}
                onChangeType={setTypeDialogCustomer}
              />
            ) : (
              <UserTable
                users={users}
                isLoading={usersLoading}
                onSelectUser={handleSelectUser}
                selectedId={selectedUser?.id ?? null}
                onChangeRole={setRoleDialogUser}
                currentActorId={user?.id ?? ''}
              />
            )}
          </CardContent>
        </Card>

        {/* Sağ: Detay */}
        <Card className="lg:col-span-4 xl:col-span-4 h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-emerald-600" />
              Detay
            </CardTitle>
            <CardDescription className="text-xs">
              {selectedCustomer
                ? 'Müşteri özeti'
                : selectedUser
                ? 'Kullanıcı özeti'
                : 'Detay için bir kayıt seçin'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedCustomer ? (
              <CustomerDetail
                customer={selectedCustomer}
                onOpen360={handleOpenCustomer360}
                onChangeType={() => setTypeDialogCustomer(selectedCustomer)}
              />
            ) : selectedUser ? (
              <UserDetail
                user={selectedUser}
                currentUser={user}
                onChangeRole={() => setRoleDialogUser(selectedUser)}
              />
            ) : (
              <div className="py-10 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                  <Eye className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Soldaki listeden bir müşteri veya kullanıcı seçin.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Son Aktiviteler */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-600" />
            Son Aktiviteler
          </CardTitle>
          <CardDescription className="text-xs">
            Sistem genelindeki son 10 denetim kaydı
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentActivity activities={overview?.recentActivity ?? []} />
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AuditLogsTab />
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4">
          <PortfolioManager user={user} />
        </TabsContent>
      </Tabs>

      {/* Diyaloglar */}
      <CustomerTypeDialog
        key={`type-${typeDialogCustomer?.id ?? 'none'}`}
        open={!!typeDialogCustomer}
        onOpenChange={(v) => !v && setTypeDialogCustomer(null)}
        customer={typeDialogCustomer}
        onUpdated={handleUpdatedCustomer}
      />
      <RoleAssignDialog
        key={`role-${roleDialogUser?.id ?? 'none'}`}
        open={!!roleDialogUser}
        onOpenChange={(v) => !v && setRoleDialogUser(null)}
        user={roleDialogUser}
        actorRole={user?.role as Role}
        onUpdated={handleUpdatedUser}
      />
    </div>
  )
}

function SystemStat({
  label, value, icon: Icon, color,
}: {
  label: string
  value: number | undefined
  icon: typeof Users
  color: string
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</span>
        <div className={cn('w-5 h-5 rounded flex items-center justify-center', color)}>
          <Icon className="w-3 h-3" />
        </div>
      </div>
      <div className="text-base font-bold tabular-nums">
        {value === undefined ? <Skeleton className="h-4 w-8" /> : value}
      </div>
    </div>
  )
}
