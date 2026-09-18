'use client'

import { PLATFORMS, platformBadgeClass } from '@/lib/social/platforms'
import type { PlatformKey } from '@/lib/social/platforms'
import { cn } from '@/lib/utils'

interface PlatformBadgeProps {
  platform: PlatformKey
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'h-6 px-2 text-[10px] gap-1',
  md: 'h-7 px-2.5 text-xs gap-1.5',
  lg: 'h-9 px-3 text-sm gap-2',
} as const

const emojiSize = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const

export function PlatformBadge({
  platform,
  size = 'md',
  showLabel = true,
  className,
}: PlatformBadgeProps) {
  const def = PLATFORMS[platform]
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold',
        platformBadgeClass(platform),
        sizeClasses[size],
        className,
      )}
      title={def.label}
    >
      <span aria-hidden className={cn('leading-none', emojiSize[size])}>
        {def.emoji}
      </span>
      {showLabel && <span className="truncate">{def.shortLabel}</span>}
    </span>
  )
}

interface PlatformAvatarProps {
  platform: PlatformKey
  size?: number
  className?: string
}

export function PlatformAvatar({ platform, size = 36, className }: PlatformAvatarProps) {
  const def = PLATFORMS[platform]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
        def.gradient,
        className,
      )}
      style={{ width: size, height: size }}
      title={def.label}
    >
      <span style={{ fontSize: size * 0.45 }}>{def.emoji}</span>
    </span>
  )
}

export function PlatformDot({ platform, size = 16 }: { platform: PlatformKey; size?: number }) {
  const def = PLATFORMS[platform]
  return (
    <span
      aria-hidden
      title={def.label}
      className={cn('inline-flex items-center justify-center rounded-full bg-gradient-to-br text-white', def.gradient)}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {def.emoji}
    </span>
  )
}
