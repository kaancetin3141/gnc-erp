// Randevu sistemi — yardımcı tipler ve fonksiyonlar
// 'use client' DEĞİL — sadece tip/helper, hem client hem server'da kullanılabilir.

export type AppointmentStatus =
  | 'beklemede'
  | 'onaylandi'
  | 'reddedildi'
  | 'tamamlandi'
  | 'iptal'
  | 'gelmedi'

export const APPOINTMENT_STATUSES: { value: AppointmentStatus; label: string; color: string; bg: string; border: string }[] = [
  { value: 'beklemede', label: 'Beklemede', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-800' },
  { value: 'onaylandi', label: 'Onaylandı', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-800' },
  { value: 'tamamlandi', label: 'Tamamlandı', color: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-100 dark:bg-teal-950/40', border: 'border-teal-300 dark:border-teal-800' },
  { value: 'iptal', label: 'İptal', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-950/40', border: 'border-red-300 dark:border-red-800' },
  { value: 'gelmedi', label: 'Gelmedi', color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-100 dark:bg-rose-950/40', border: 'border-rose-300 dark:border-rose-800' },
  { value: 'reddedildi', label: 'Reddedildi', color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/50', border: 'border-slate-300 dark:border-slate-700' },
]

export function getStatusMeta(status: string) {
  return APPOINTMENT_STATUSES.find((s) => s.value === status) ?? APPOINTMENT_STATUSES[0]
}

export type ProviderType = 'berber' | 'kuafor' | 'disci' | 'guzellik' | 'spa' | 'dovme'

export const PROVIDER_TYPES: { value: ProviderType; label: string; emoji: string; gradient: string }[] = [
  { value: 'berber', label: 'Berber', emoji: '✂️', gradient: 'from-slate-500 to-slate-700' },
  { value: 'kuafor', label: 'Kuaför', emoji: '💇', gradient: 'from-violet-500 to-purple-700' },
  { value: 'disci', label: 'Dişçi', emoji: '🦷', gradient: 'from-teal-500 to-cyan-700' },
  { value: 'guzellik', label: 'Güzellik Merkezi', emoji: '💅', gradient: 'from-pink-500 to-rose-700' },
  { value: 'spa', label: 'SPA', emoji: '🧖', gradient: 'from-emerald-500 to-teal-700' },
  { value: 'dovme', label: 'Dövme', emoji: '🎨', gradient: 'from-amber-500 to-orange-700' },
]

export function getProviderTypeMeta(type: string) {
  return PROVIDER_TYPES.find((t) => t.value === type) ?? PROVIDER_TYPES[0]
}

// Çalışma saatleri şeması
export interface DaySchedule {
  start?: string
  end?: string
  closed?: boolean
}

export type WorkingHours = Record<string, DaySchedule>

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const DAY_LABELS: Record<string, string> = {
  mon: 'Pazartesi',
  tue: 'Salı',
  wed: 'Çarşamba',
  thu: 'Perşembe',
  fri: 'Cuma',
  sat: 'Cumartesi',
  sun: 'Pazar',
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: { start: '09:00', end: '19:00' },
  tue: { start: '09:00', end: '19:00' },
  wed: { start: '09:00', end: '19:00' },
  thu: { start: '09:00', end: '19:00' },
  fri: { start: '09:00', end: '19:00' },
  sat: { start: '09:00', end: '19:00' },
  sun: { closed: true },
}

// "HH:mm" → dakika (09:30 → 570)
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Dakika → "HH:mm" (570 → "09:30")
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// JS Date → "mon"|"tue"|... (local)
export function dayKeyFromDate(date: Date): string {
  return DAY_KEYS[(date.getDay() + 6) % 7] // JS: 0=Sun; bizim şemada 0=Mon
}

// İki zaman aralığı çakışıyor mu?
export function rangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && startB < endA
}

// Bir gün için kullanılabilir slot'ları üret (slotInterval dk'lık)
export function generateSlots(
  daySchedule: DaySchedule | undefined,
  slotInterval = 30,
): string[] {
  if (!daySchedule || daySchedule.closed || !daySchedule.start || !daySchedule.end) {
    return []
  }
  const start = timeToMinutes(daySchedule.start)
  const end = timeToMinutes(daySchedule.end)
  const slots: string[] = []
  for (let t = start; t + slotInterval <= end; t += slotInterval) {
    slots.push(minutesToTime(t))
  }
  return slots
}

// "HH:mm" + Date (sadece tarih) → DateTime (local → ISO)
export function slotToDateTime(dateOnly: string, time: string): Date {
  // dateOnly: "2025-01-15"
  const [y, m, d] = dateOnly.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}
