'use client'

import { useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Camera, X, Building2, Package, User, Loader2,
} from 'lucide-react'

// ============================================================
// PhotoUpload — base64 data URL olarak fotoğraf yükleme
// - Logo (logo style = rounded square) — müşteri/ürün için
// - Avatar (avatar style = circle) — kişi/contact için
// 2MB limit, image/* accept
// ============================================================

export type PhotoUploadVariant = 'logo' | 'avatar'
export type PhotoUploadSize = 'sm' | 'md' | 'lg'

const SIZE_PX: Record<PhotoUploadSize, number> = {
  sm: 56,
  md: 80,
  lg: 112,
}

const ICON_PX: Record<PhotoUploadSize, number> = {
  sm: 22,
  md: 30,
  lg: 42,
}

export interface PhotoUploadProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  label?: string
  size?: PhotoUploadSize
  variant?: PhotoUploadVariant
  placeholderIcon?: 'building' | 'package' | 'user'
  disabled?: boolean
  className?: string
}

export function PhotoUpload({
  value,
  onChange,
  label,
  size = 'md',
  variant = 'logo',
  placeholderIcon = variant === 'avatar' ? 'user' : 'building',
  disabled = false,
  className,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(value ?? null)

  useEffect(() => {
    setPreview(value ?? null)
  }, [value])

  const handleFile = (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Lütfen bir görsel dosyası seçin')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Görsel 2MB\'dan büyük olamaz')
      return
    }
    setLoading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        setPreview(result)
        onChange(result)
      }
      setLoading(false)
    }
    reader.onerror = () => {
      setError('Görsel okunamadı')
      setLoading(false)
    }
    reader.readAsDataURL(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreview(null)
    onChange(null)
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  const sizePx = SIZE_PX[size]
  const iconPx = ICON_PX[size]
  const PlaceholderIcon =
    placeholderIcon === 'package' ? Package :
    placeholderIcon === 'user' ? User : Building2

  const shapeClass = variant === 'avatar' ? 'rounded-full' : 'rounded-xl'

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative">
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label || 'Fotoğraf yükle'}
          onClick={() => !disabled && !loading && inputRef.current?.click()}
          onKeyDown={handleKeyDown}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cn(
            'relative group cursor-pointer flex items-center justify-center overflow-hidden border-2 border-dashed transition-all',
            shapeClass,
            error ? 'border-red-300 dark:border-red-800' : 'border-border hover:border-emerald-400 dark:hover:border-emerald-700',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          style={{ width: sizePx, height: sizePx }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={label || 'Fotoğraf'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted/40 text-muted-foreground">
              {loading ? (
                <Loader2 className="text-emerald-600 animate-spin" style={{ width: iconPx, height: iconPx }} />
              ) : (
                <>
                  <PlaceholderIcon
                    className="text-muted-foreground/70 group-hover:text-emerald-600 transition-colors"
                    style={{ width: iconPx, height: iconPx }}
                  />
                  {size !== 'sm' && (
                    <Camera className="absolute bottom-1 right-1 w-4 h-4 text-muted-foreground/70 group-hover:text-emerald-600 transition-colors" />
                  )}
                </>
              )}
            </div>
          )}

          {/* Hover overlay (sadece preview varken) */}
          {preview && !disabled && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-[10px] font-medium flex items-center gap-1">
                <Camera className="w-3 h-3" /> Değiştir
              </span>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />

        {/* Remove button */}
        {preview && !disabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full bg-background shadow border-border hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950/40 z-10"
                onClick={handleRemove}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fotoğrafı kaldır</TooltipContent>
          </Tooltip>
        )}
      </div>

      {label && (
        <div className="text-center">
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">PNG/JPG · maks 2MB</div>
        </div>
      )}
      {error && (
        <div className="text-[10px] text-red-600 text-center max-w-[140px]">{error}</div>
      )}
    </div>
  )
}
