'use client'

// Widget'larda kullanılan ortak "Canlı / Çevrimdışı" rozeti

import { cn } from '@/lib/utils'

export function LiveBadge({ live, className }: { live: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
        live ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          live ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/60',
        )}
      />
      {live ? 'Canlı' : 'Çevrimdışı'}
    </span>
  )
}
