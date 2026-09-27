// ============================================================
// PERSONEL İZİN (TIME-OFF) YARDIMCILARI
// · İzin kaydı: tam gün veya saat aralıklı (startTime–endTime "HH:MM")
// · Hem server (API route'ları) hem client (takvim UI) kullanır
// ============================================================

export interface TimeOffLike {
  date: string | Date
  isFullDay: boolean
  startTime?: string | null
  endTime?: string | null
  reason?: string | null
}

const DAY_MS = 24 * 60 * 60_000

/** İzin kaydının [startMs, endMs) aralığını hesaplar (yerel saat). */
export function timeOffWindowMs(t: TimeOffLike): { start: number; end: number } {
  const dayStart = new Date(t.date)
  dayStart.setHours(0, 0, 0, 0)
  const s = dayStart.getTime()
  if (t.isFullDay) return { start: s, end: s + DAY_MS }
  const toMin = (v?: string | null, def: number = 0) => {
    if (!v) return def
    const [h, m] = v.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  return {
    start: s + toMin(t.startTime, 0) * 60_000,
    end: s + toMin(t.endTime, 23 * 60 + 59) * 60_000,
  }
}

/** İzin aralığı verilen randevu aralığıyla kesişiyor mu? */
export function timeOffCoversRange(t: TimeOffLike, rangeStartMs: number, rangeEndMs: number): boolean {
  const w = timeOffWindowMs(t)
  return rangeStartMs < w.end && w.start < rangeEndMs
}

/** İzin açıklaması: "Tam gün" veya "09:00–13:00" (+ sebep çağrı tarafında eklenir) */
export function describeTimeOff(t: TimeOffLike): string {
  if (t.isFullDay) return 'Tam gün'
  return `${t.startTime ?? '00:00'}–${t.endTime ?? '23:59'}`
}

/** İzin + sebep birleşik etiketi: "Tam gün · Yıllık izin" */
export function timeOffLabel(t: TimeOffLike): string {
  const base = describeTimeOff(t)
  return t.reason ? `${base} · ${t.reason}` : base
}

/**
 * Verilen randevu aralığıyla kesişen İLK izin kaydını bulur.
 * Booking route'larında "personel izinli" engeli için kullanılır.
 */
export function findTimeOffConflict<T extends TimeOffLike & { staffId?: string | null }>(
  timeOffs: T[],
  staffId: string,
  rangeStartMs: number,
  rangeEndMs: number,
): T | null {
  for (const t of timeOffs) {
    if (t.staffId !== staffId) continue
    if (timeOffCoversRange(t, rangeStartMs, rangeEndMs)) return t
  }
  return null
}
