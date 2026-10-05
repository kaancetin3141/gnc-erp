// ============================================================
// TENANT SEKTÖR TESPİTİ
//
// Bir tenant'ın (şirketin) adından hangi sektöre ait olduğunu belirler.
// Tüm süperapp modülleri için ortak kullanılır:
//   - dashboard (sektör bazlı özet)
//   - rbac (admin rolüne verilecek sektör yetkileri)
//   - sidebar (sektöre göre menü varsayılanları)
// ============================================================

export type TenantSector = 'crm' | 'cafe' | 'market' | 'site' | 'appointments'

// Sector → insan-okur etiket + ikon + renk
export const SECTOR_META: Record<TenantSector, {
  label: string
  shortLabel: string
  emoji: string
  gradient: string // tailwind gradient classes
  accent: string // tailwind text color class
  badge: string
}> = {
  crm: {
    label: 'CRM & Satış',
    shortLabel: 'CRM',
    emoji: '📊',
    gradient: 'from-sky-500 to-blue-600',
    accent: 'text-sky-600',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  },
  cafe: {
    label: 'Kafe & Restoran',
    shortLabel: 'Kafe',
    emoji: '☕',
    gradient: 'from-amber-500 to-orange-600',
    accent: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  market: {
    label: 'Market & Bakkal',
    shortLabel: 'Market',
    emoji: '🛒',
    gradient: 'from-emerald-500 to-teal-600',
    accent: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  site: {
    label: 'Site & Apartman Yönetimi',
    shortLabel: 'Site',
    emoji: '🏠',
    gradient: 'from-violet-500 to-purple-600',
    accent: 'text-violet-600',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  },
  appointments: {
    label: 'Randevu & Hizmet',
    shortLabel: 'Randevu',
    emoji: '💇',
    gradient: 'from-pink-500 to-rose-600',
    accent: 'text-pink-600',
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  },
}

/**
 * Tenant adından sektör tespiti.
 * getAdminPermissionsForTenant ile AYNI mantık — tek kaynak.
 */
export function getTenantSector(tenantName: string | undefined | null): TenantSector {
  if (!tenantName) return 'crm'
  const name = tenantName.toLowerCase()

  // Kafe şirketi
  if (name.includes('kafe') || name.includes('restoran') || name.includes('cafe')) {
    return 'cafe'
  }
  // Market şirketi
  if (name.includes('market') || name.includes('bakkal')) {
    return 'market'
  }
  // Site şirketi
  if (name.includes('site') || name.includes('apartman') || name.includes('yönetim')) {
    return 'site'
  }
  // Randevu şirketi (kuaför/berber/güzellik/diş)
  if (
    name.includes('kuaför') ||
    name.includes('berber') ||
    name.includes('güzellik') ||
    name.includes('diş')
  ) {
    return 'appointments'
  }
  // Default → CRM/ERP
  return 'crm'
}

// ============================================================
// YETKİ MATRİSİ — SEKTÖRE GÖRE GÖRÜNÜR GRUPLAR
//
// Admin Paneli > "Müşteriler & Roller" > UserDetail (sağ panel)
// "Tanımlı Yetkiler" bölümünde, kullanıcı rolü bazında hangi
// permission gruplarının gösterileceğini belirler.
//
// Mantık:
//   - superadmin → null döner (tüm grupları görür)
//   - admin (şirket admini) → SADECE kendi sektörünün grupları
//
// Bu fonksiyon sadece UI'da filtreleme yapar. Backend (RBAC) her
// zaman gerçek permission listesini döner; bu, görsel olarak admin
// rolündeki bir kullanıcının kendi sektörüyle ilgili olmayan
// grupları görmesini engeller (örn. kafe admini "Market" grubunu
// göremez).
// ============================================================

export const ALL_PERMISSION_GROUP_NAMES = [
  'Genel',
  'Müşteriler',
  'Potansiyel Müşteri',
  'Satış',
  'Raporlar',
  'İletişim',
  'Yönetim',
  'ERP',
  'Üretim',
  'Giderler',
  'Kafe',
  'Market',
  'Site Yönetimi',
  'Randevu',
  'Sosyal Medya',
  'İnsan Kaynakları',
  'Destek Masası',
] as const

/**
 * Bir sektör için Admin Paneli Yetki Matrisi'nde görünür olan
 * permission grup adlarını döner.
 *
 * @param sector tenant sektörü (getTenantSector() çıktısı)
 * @returns görünecek grup adları; null ise filtre yok (superadmin → tümü)
 */
export function getVisiblePermissionGroups(
  sector: TenantSector | 'platform',
): readonly string[] | null {
  switch (sector) {
    case 'cafe':
      return ['Genel', 'Kafe']
    case 'market':
      return ['Genel', 'Market']
    case 'site':
      return ['Genel', 'Site Yönetimi']
    case 'appointments':
      return ['Genel', 'Randevu']
    case 'crm':
      // CRM/Satış/Ticaret şirketleri → tüm CRM + ERP + üretim +
      // gider + rapor + iletişim + yönetim + İK + destek grupları
      return [
        'Genel',
        'Müşteriler',
        'Potansiyel Müşteri',
        'Satış',
        'ERP',
        'Üretim',
        'Giderler',
        'Raporlar',
        'İletişim',
        'Yönetim',
        'İnsan Kaynakları',
        'Destek Masası',
      ]
    case 'platform':
      // Platform tenant'ı (GNC Süperapp) — tüm gruplar görünür
      return null
    default:
      return ['Genel']
  }
}
