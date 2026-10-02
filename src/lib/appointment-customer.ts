// Müşteri kayıt defteri (AppointmentCustomer) — ortak yardımcılar.
// Hem client hem server'da kullanılabilir (db import eden kısım server-only).

export function normalizePhoneDigits(p: string): string {
  const d = (p || '').replace(/\D/g, '')
  // 90xxxxxxxxxx → 0xxxxxxxxxx
  if (d.startsWith('90') && d.length === 12) return '0' + d.slice(2)
  // 10 haneli, 0'sız → başına 0
  if (d.length === 10 && !d.startsWith('0')) return '0' + d
  return d
}
