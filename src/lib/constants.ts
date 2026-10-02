// Uygulama sabitleri — sektörler, şehirler, aşamalar, segmentler, kaynaklar

export const SECTORS = [
  'Sağlık',
  'Diş Sağlığı',
  'Güzellik & Bakım',
  'Restoran & Kafe',
  'Perakende',
  'E-Ticaret',
  'İnşaat & Gayrimenkul',
  'Otomotiv',
  'Eğitim',
  'Teknoloji & Yazılım',
  'Finans & Muhasebe',
  'Hukuk',
  'Lojistik & Taşımacılık',
  'Üretim',
  'Tarım & Hayvancılık',
  'Turizm & Otelcilik',
  'Medya & Reklam',
  'Enerji',
  'Tekstil',
  'Gıda & İçecek',
  'Diğer',
] as const

export const CITIES = [
  'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep',
  'Mersin', 'Kayseri', 'Eskişehir', 'Diyarbakır', 'Samsun', 'Denizli', 'Şanlıurfa',
  'Trabzon', 'Malatya', 'Erzurum', 'Van', 'Sakarya', 'Manisa', 'Kahramanmaraş',
  'Balıkesir', 'Aydın', 'Hatay', 'Tekirdağ',
] as const

export const COUNTRIES = [
  { code: 'TR', name: 'Türkiye', dialCode: '+90' },
  { code: 'DE', name: 'Almanya', dialCode: '+49' },
  { code: 'GB', name: 'Birleşik Krallık', dialCode: '+44' },
  { code: 'US', name: 'ABD', dialCode: '+1' },
  { code: 'AE', name: 'B.A.E.', dialCode: '+971' },
  { code: 'NL', name: 'Hollanda', dialCode: '+31' },
] as const

export const SEGMENTS = [
  { value: 'vip', label: 'VIP', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'kurumsal', label: 'Kurumsal', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'standart', label: 'Standart', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { value: 'potansiyel', label: 'Potansiyel', color: 'text-violet-600 bg-violet-50 border-violet-200' },
] as const

export const CUSTOMER_STATUS = [
  { value: 'aktif', label: 'Aktif', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'pasif', label: 'Pasif', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  { value: 'potansiyel', label: 'Potansiyel', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  { value: 'kaybedildi', label: 'Kaybedildi', color: 'text-red-600 bg-red-50 border-red-200' },
] as const

export const CUSTOMER_SOURCES = [
  { value: 'manuel', label: 'Manuel', icon: 'Hand' },
  { value: 'google_maps', label: 'Google Maps', icon: 'MapPin' },
  { value: 'referral', label: 'Yönlendirme', icon: 'Users' },
  { value: 'website', label: 'Web Sitesi', icon: 'Globe' },
  { value: 'event', label: 'Etkinlik', icon: 'Calendar' },
] as const

export const DEAL_STAGES = [
  { value: 'yeni', label: 'Yeni', color: 'bg-slate-100 text-slate-700 border-slate-200', probability: 10 },
  { value: 'iletisim', label: 'İletişim', color: 'bg-sky-100 text-sky-700 border-sky-200', probability: 25 },
  { value: 'teklif', label: 'Teklif', color: 'bg-amber-100 text-amber-700 border-amber-200', probability: 50 },
  { value: 'muzakere', label: 'Müzakere', color: 'bg-violet-100 text-violet-700 border-violet-200', probability: 70 },
  { value: 'kazanıldı', label: 'Kazanıldı', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', probability: 100 },
  { value: 'kaybedildi', label: 'Kaybedildi', color: 'bg-red-100 text-red-700 border-red-200', probability: 0 },
] as const

export const LOSS_REASONS = [
  'Fiyat çok yüksek',
  'Rakibi tercih etti',
  'Bütçe yok',
  'Zamanlama uygun değil',
  'Karar verici ulaşılabilir değil',
  'İhtiyaç yok',
  'Ürün/hizmet uygun değil',
  'Diğer',
] as const

export const LEAD_STATUSES = [
  { value: 'yeni', label: 'Yeni', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'iletisim', label: 'İletişimde', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'nitelikli', label: 'Nitelikli', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'donustu', label: 'Dönüştü', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'kaybedildi', label: 'Kaybedildi', color: 'bg-red-100 text-red-700 border-red-200' },
] as const

export const ACTIVITY_TYPES = [
  { value: 'arama', label: 'Arama', icon: 'Phone', color: 'text-emerald-600 bg-emerald-50' },
  { value: 'toplanti', label: 'Toplantı', icon: 'Users', color: 'text-violet-600 bg-violet-50' },
  { value: 'email', label: 'E-posta', icon: 'Mail', color: 'text-sky-600 bg-sky-50' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle', color: 'text-green-600 bg-green-50' },
  { value: 'not', label: 'Not', icon: 'StickyNote', color: 'text-amber-600 bg-amber-50' },
  { value: 'ziyaret', label: 'Ziyaret', icon: 'MapPin', color: 'text-rose-600 bg-rose-50' },
  { value: 'gorev', label: 'Görev', icon: 'CheckSquare', color: 'text-indigo-600 bg-indigo-50' },
] as const

export const ACTIVITY_OUTCOMES = [
  { value: 'basarili', label: 'Başarılı', color: 'text-emerald-600' },
  { value: 'basarisiz', label: 'Başarısız', color: 'text-red-600' },
  { value: 'ertelendi', label: 'Ertelendi', color: 'text-amber-600' },
  { value: 'callback', label: 'Geri Aranacak', color: 'text-sky-600' },
] as const

export const TASK_PRIORITIES = [
  { value: 'dusuk', label: 'Düşük', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  { value: 'orta', label: 'Orta', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { value: 'yuksek', label: 'Yüksek', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'acil', label: 'Acil', color: 'text-red-600 bg-red-50 border-red-200' },
] as const

export const TASK_STATUSES = [
  { value: 'acik', label: 'Açık', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { value: 'tamamlandi', label: 'Tamamlandı', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'iptal', label: 'İptal', color: 'text-gray-600 bg-gray-50 border-gray-200' },
] as const

export const CURRENCIES = [
  { code: 'TRY', symbol: '₺', label: 'Türk Lirası' },
  { code: 'USD', symbol: '$', label: 'ABD Doları' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'İngiliz Sterlini' },
] as const

export const CURRENCY_RATES: Record<string, number> = {
  TRY: 1,
  USD: 0.031,
  EUR: 0.029,
  GBP: 0.025,
}

// Mock kategori → işletme adları üretici için
export const MAPS_CATEGORIES = [
  { query: 'diş kliniği', category: 'Diş Kliniği', namePrefix: ['Diş Kliniği', 'Ağız ve Diş Sağlığı', 'Dental', 'İmplant Merkezi'] },
  { query: 'kuaför', category: 'Kuaför & Güzellik', namePrefix: ['Kuaför', 'Güzellik Salonu', 'Saç Tasarım', 'Berber'] },
  { query: 'restoran', category: 'Restoran', namePrefix: ['Restoran', 'Mutfak', 'Yemek Evi', 'Lokanta'] },
  { query: 'eczane', category: 'Eczane', namePrefix: ['Eczane', 'Ecza'] },
  { query: 'otomotiv', category: 'Otomotiv', namePrefix: ['Oto', 'Motor', 'Araç', 'Servis'] },
  { query: 'gym fitness', category: 'Spor Salonu', namePrefix: ['Spor Salonu', 'Fitness', 'Gym', 'Pilates Stüdyosu'] },
  { query: 'avukat', category: 'Hukuk Bürosu', namePrefix: ['Hukuk Bürosu', 'Avukat', 'Danışmanlık'] },
  { query: 'muhasebe', category: 'Muhasebe', namePrefix: ['Mali Müşavirlik', 'Muhasebe', 'Danışmanlık'] },
  { query: 'cafe', category: 'Kafe', namePrefix: ['Kafe', 'Coffee', 'Pastane', 'Fırın'] },
  { query: 'market', category: 'Market', namePrefix: ['Market', 'Süper Market', 'Bakkal', 'Manav'] },
  { query: 'otel', category: 'Otel', namePrefix: ['Otel', 'Hotel', 'Pansiyon', 'Apart'] },
  { query: 'veteriner', category: 'Veteriner', namePrefix: ['Veteriner Kliniği', 'Pet Shop', 'Veteriner', 'Pet'] },
  { query: 'eğitim', category: 'Eğitim', namePrefix: ['Kurs', 'Etüt Merkezi', 'Dershane', 'Anaokulu'] },
  { query: 'emlak', category: 'Emlak', namePrefix: ['Emlak', 'Gayrimenkul', 'İnşaat', 'Realty'] },
] as const

export const TAG_COLORS = [
  'gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
] as const

export const TAG_COLOR_CLASSES: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  lime: 'bg-lime-100 text-lime-700 border-lime-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  sky: 'bg-sky-100 text-sky-700 border-sky-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
}

export function getLabel<T extends { value: string; label: string }>(
  arr: readonly T[],
  value: string,
): string {
  return arr.find((x) => x.value === value)?.label ?? value
}

export function getColor<T extends { value: string; color: string }>(
  arr: readonly T[],
  value: string,
): string {
  return arr.find((x) => x.value === value)?.color ?? ''
}

// ============================================================
// F4 — AĞIRLIK, AMBALAJ, PALET, KARGO SABİTLERİ
// ============================================================

export const WEIGHT_UNITS = [
  { value: 'gr', label: 'Gram (g)' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'ton', label: 'Ton (t)' },
] as const

export const PACKAGING_TYPES = [
  { value: 'karton', label: 'Karton Koli' },
  { value: 'plastik', label: 'Plastik Ambalaj' },
  { value: 'ahsap', label: 'Ahşap Kutu' },
  { value: 'metal', label: 'Metal Kutu' },
  { value: 'other', label: 'Diğer' },
] as const

export const PALET_TYPES = [
  { value: 'tahta', label: 'Tahta Palet' },
  { value: 'plastik', label: 'Plastik Palet' },
  { value: 'tek_kullanimlik', label: 'Tek Kullanımlık' },
  { value: 'eur_pallet', label: 'EUR Pallet (EPAL)' },
  { value: 'other', label: 'Diğer' },
] as const

export const CARRIERS = [
  { value: 'yurtici', label: 'Yurtiçi Kargo' },
  { value: 'aras', label: 'Aras Kargo' },
  { value: 'mng', label: 'MNG Kargo' },
  { value: 'ptt', label: 'PTT Kargo' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL' },
  { value: 'other', label: 'Diğer' },
] as const
