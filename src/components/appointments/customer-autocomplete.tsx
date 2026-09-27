'use client'

// ============================================================
// Müşteri Otomatik Tamamlama — Kayıt Defteri'nden müşteri bul,
// tek tıkla forma doldur. Yeni numara için de ipucu gösterir.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatPhone, formatCurrency } from '@/lib/format'
import { normalizePhoneDigits } from '@/lib/appointment-customer'
import { Search, UserPlus, UserCheck, Ban, Loader2, X } from 'lucide-react'

export interface RegistryCustomerLite {
  id: string
  name: string
  phone: string
  email: string | null
  isBlocked: boolean
  stats?: { total: number; completed: number; cancelled: number; spent: number; lastVisit: string | null; nextVisit: string | null }
}

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
]

export function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function CustomerAutocomplete({
  providerId,
  name,
  phone,
  onNameChange,
  onPhoneChange,
  onPick,
}: {
  providerId: string
  name: string
  phone: string
  onNameChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onPick?: (c: RegistryCustomerLite | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [debounced, setDebounced] = useState('')
  const [picked, setPicked] = useState<RegistryCustomerLite | null>(null)

  // debounce arama sorgusu
  useEffect(() => {
    const t = setTimeout(() => {
      const digits = normalizePhoneDigits(phone)
      setDebounced(name.trim().length >= 2 ? name.trim() : digits.length >= 3 ? digits : '')
    }, 250)
    return () => clearTimeout(t)
  }, [name, phone])

  const { data, isFetching } = useQuery({
    queryKey: ['customer-lookup', providerId, debounced],
    queryFn: () => apiGet<{ items: RegistryCustomerLite[] }>(
      `/api/appointments/providers/${providerId}/customers?q=${encodeURIComponent(debounced)}`,
    ),
    enabled: !!debounced && !picked,
    staleTime: 30_000,
  })

  const matches = useMemo(() => (data?.items ?? []).slice(0, 6), [data])
  const phoneDigits = normalizePhoneDigits(phone)
  const isPhoneTaken = matches.some((m) => normalizePhoneDigits(m.phone) === phoneDigits && phoneDigits.length >= 7)

  const pick = (c: RegistryCustomerLite) => {
    setPicked(c)
    onNameChange(c.name)
    onPhoneChange(c.phone)
    setOpen(false)
    onPick?.(c)
  }

  const clearPick = () => {
    setPicked(null)
    onNameChange('')
    onPhoneChange('')
    onPick?.(null)
  }

  return (
    <div className="space-y-1.5 relative">
      <Label className="text-xs">Müşteri *</Label>

      {picked ? (
        /* Seçilmiş kayıtlı müşteri kartı */
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/60 p-2.5">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0', avatarColor(picked.name))}>
              {picked.name.charAt(0).toLocaleUpperCase('tr-TR')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium truncate">{picked.name}</span>
                {picked.isBlocked && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-300 rounded px-1.5 py-0.5">
                    <Ban className="w-2.5 h-2.5" /> Engelli
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatPhone(picked.phone)}
                {picked.stats && picked.stats.total > 0 && (
                  <> · <strong>{picked.stats.total} randevu</strong>{picked.stats.spent > 0 ? ` · ${formatCurrency(picked.stats.spent)}` : ''}</>
                )}
              </div>
            </div>
            <button type="button" onClick={clearPick} className="p-1 rounded hover:bg-accent shrink-0" title="Seçimi temizle">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 relative">
          {/* Ad ile ara */}
          <div className="relative">
            <Input
              value={name}
              onChange={(e) => { onNameChange(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 180)}
              placeholder="Ad Soyad (yazarak ara)"
              className="h-9"
              autoComplete="off"
            />
            {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />}
          </div>
          {/* Telefon */}
          <Input
            value={phone}
            onChange={(e) => { onPhoneChange(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            placeholder="+90 5xx xxx xx xx"
            className="h-9"
            autoComplete="off"
          />

          {/* Arama sonuçları dropdown */}
          {open && debounced && matches.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden max-h-56 overflow-y-auto">
              <div className="px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground border-b flex items-center gap-1">
                <Search className="w-3 h-3" /> Kayıt defterinden {matches.length} müşteri
              </div>
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-accent text-left transition-colors"
                >
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', avatarColor(m.name))}>
                    {m.name.charAt(0).toLocaleUpperCase('tr-TR')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{formatPhone(m.phone)}</div>
                  </div>
                  {m.isBlocked ? (
                    <span className="text-[9px] font-semibold text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-300 rounded px-1.5 py-0.5">Engelli</span>
                  ) : m.stats && m.stats.total > 0 ? (
                    <span className="text-[9px] font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 rounded px-1.5 py-0.5 whitespace-nowrap">
                      {m.stats.total} randevu
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground">yeni</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Yeni müşteri ipucu */}
      {!picked && phoneDigits.length >= 7 && !isPhoneTaken && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <UserPlus className="w-3 h-3 text-emerald-600" />
          Bu numara kayıt defterinde yok — randevu kaydedilince müşteri profili otomatik oluşur
        </div>
      )}
      {!picked && isPhoneTaken && (
        <div className="text-[11px] text-amber-700 dark:text-amber-400">
          ⚠ Bu numara kayıtlı — yukarıdan müşteri seçin, bilgiler otomatik dolsun
        </div>
      )}
    </div>
  )
}
