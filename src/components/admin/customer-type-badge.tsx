'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Coffee, Globe, Headphones, User } from 'lucide-react'

// Müşteri türleri — admin paneli ve müşteri listesinde kullanılır
export type CustomerTypeKey = 'kafe' | 'dis_ticaret' | 'musteri_hizmetleri' | 'musteri'

export const CUSTOMER_TYPES: {
  value: CustomerTypeKey
  label: string
  icon: typeof Coffee
  emoji: string
  description: string
  color: string // badge renk sınıfları (Tailwind)
  dot: string // sol kenar çubuğu / nokta rengi
  ring: string // tree node hover/active rengi
}[] = [
  {
    value: 'kafe',
    label: 'Kafe',
    icon: Coffee,
    emoji: '☕',
    description: 'Kafe/restaurant işletmesi',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900/60',
    dot: 'bg-emerald-500',
    ring: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/30 data-[active=true]:bg-emerald-100 dark:data-[active=true]:bg-emerald-950/40',
  },
  {
    value: 'dis_ticaret',
    label: 'Dış Ticaret',
    icon: Globe,
    emoji: '🌐',
    description: 'İhracat/ithalat firması',
    color: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950/40 dark:border-sky-900/60',
    dot: 'bg-sky-500',
    ring: 'hover:bg-sky-50 dark:hover:bg-sky-950/30 data-[active=true]:bg-sky-100 dark:data-[active=true]:bg-sky-950/40',
  },
  {
    value: 'musteri_hizmetleri',
    label: 'Müşteri Hizmetleri',
    icon: Headphones,
    emoji: '🎧',
    description: 'Servis/support şirketi',
    color: 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950/40 dark:border-violet-900/60',
    dot: 'bg-violet-500',
    ring: 'hover:bg-violet-50 dark:hover:bg-violet-950/30 data-[active=true]:bg-violet-100 dark:data-[active=true]:bg-violet-950/40',
  },
  {
    value: 'musteri',
    label: 'Müşteri',
    icon: User,
    emoji: '👤',
    description: 'Standart müşteri',
    color: 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800/40 dark:border-slate-700/60',
    dot: 'bg-slate-400',
    ring: 'hover:bg-slate-100 dark:hover:bg-slate-800/30 data-[active=true]:bg-slate-200 dark:data-[active=true]:bg-slate-800/40',
  },
]

export function getCustomerTypeMeta(type: string | null | undefined) {
  return CUSTOMER_TYPES.find((t) => t.value === type) ?? CUSTOMER_TYPES[CUSTOMER_TYPES.length - 1]
}

interface Props {
  type: string | null | undefined
  size?: 'sm' | 'md'
  showIcon?: boolean
  className?: string
}

export function CustomerTypeBadge({ type, size = 'sm', showIcon = true, className }: Props) {
  const meta = getCustomerTypeMeta(type)
  const Icon = meta.icon
  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1 border font-medium',
        size === 'sm' ? 'text-[10px] px-1.5 h-5' : 'text-xs px-2 h-6',
        meta.color,
        className,
      )}
    >
      {showIcon && <Icon className={cn(size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />}
      <span>{meta.label}</span>
    </Badge>
  )
}
