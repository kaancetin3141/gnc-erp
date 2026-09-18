// Site Yönetimi — paylaşılan yardımcılar (server-side)

const MONTH_NAMES_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

export function monthNameTR(month: number): string {
  return MONTH_NAMES_TR[month - 1] ?? '?'
}

// 1-12 arası ay listesi
export const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: MONTH_NAMES_TR[i],
}))

// Mevcut yıl ± 2
export function yearOptions(): number[] {
  const y = new Date().getFullYear()
  return [y - 2, y - 1, y, y + 1]
}

// Rol etiketleri (personel)
export const STAFF_ROLE_LABELS: Record<string, string> = {
  kapici: 'Kapıcı',
  guvenlik: 'Güvenlik',
  temizlik: 'Temizlik',
  bahcivan: 'Bahçıvan',
  teknik: 'Teknik Personel',
}

export const STAFF_ROLES = Object.keys(STAFF_ROLE_LABELS)

// Daire tipi etiketleri
export const APARTMENT_TYPE_LABELS: Record<string, string> = {
  daire: 'Daire',
  dukkan: 'Dükkan',
  depo: 'Depo',
}

// Şikayet kategorileri
export const COMPLAINT_CATEGORY_LABELS: Record<string, string> = {
  su: 'Su',
  elektrik: 'Elektrik',
  asansor: 'Asansör',
  guvenlik: 'Güvenlik',
  temizlik: 'Temizlik',
  gurultu: 'Gürültü',
  park: 'Park',
  diger: 'Diğer',
}

export const COMPLAINT_CATEGORIES = Object.keys(COMPLAINT_CATEGORY_LABELS)

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  acik: 'Açık',
  inceleniyor: 'İnceleniyor',
  cozuldu: 'Çözüldü',
  reddedildi: 'Reddedildi',
}

export const COMPLAINT_PRIORITY_LABELS: Record<string, string> = {
  dusuk: 'Düşük',
  normal: 'Normal',
  yuksek: 'Yüksek',
  acil: 'Acil',
}

export const ANNOUNCEMENT_TYPE_LABELS: Record<string, string> = {
  genel: 'Genel',
  acil: 'Acil',
  aidat: 'Aidat',
  bakim: 'Bakım',
  etkinlik: 'Etkinlik',
}

// Aidat durumu etiketleri
export const DUES_STATUS_LABELS: Record<string, string> = {
  odenmedi: 'Ödenmedi',
  odendi: 'Ödendi',
  gecikti: 'Gecikti',
}

// Ödeme yöntemi etiketleri
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Nakit',
  bank: 'Havale/EFT',
  online: 'Online',
}
