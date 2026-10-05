import type { PermissionKey, Role, SessionUser } from '@/types'

// ============================================================
// ROL HİYERARŞİSİ (SUPER APP)
//
// superadmin  → Program admini (platform işleteni)
//               TÜM şirketleri ve modülleri görür
//               Hiyerarşinin en üstünde
//
// admin       → Şirket admini (sadece kendi şirketinden sorumlu)
//               SADECE kendi sektörünün modüllerini görür
//               Kafe admini → sadece kafe
//               Market admini → sadece market
//               Site admini → sadece site
//               Randevu admini → sadece randevu
//
// Diğer roller → kendi yetki alanında çalışır
// ============================================================

export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  // ===== SÜPER ADMIN — Program admini, TÜM şirketler ve modüller =====
  superadmin: [
    'dashboard.view', 'customers.view.own', 'customers.view.team', 'customers.view.all',
    'customers.edit', 'customers.delete',
    'leads.import', 'leads.view', 'leads.edit', 'maps.search',
    'deals.manage', 'tasks.manage', 'tasks.view',
    'reports.view', 'export.data', 'audit.view',
    'messages.view',
    'users.manage', 'roles.manage', 'settings.manage', 'admin.access',
    'erp.manage', 'production.view', 'production.manage',
    'expenses.view', 'expenses.manage',
    'cafe.view', 'cafe.manage', 'cafe.orders', 'cafe.bar', 'cafe.kitchen',
    'market.view', 'market.pos', 'market.stock', 'market.manage',
    'site.view', 'site.manage',
    'appointments.view', 'appointments.manage',
    'social.view', 'social.manage',
    'orders.view', 'irsaliye.view', 'irsaliye.manage', 'invoices.view',
    'hr.view', 'hr.manage', 'tickets.view', 'tickets.manage',
  ],

  // ===== ADMİN — Şirket admini, SADECE kendi sektörü =====
  // Not: admin rolüne hangi sektörün yetkileri verileceği
  // tenant'ın sektörüne göre belirlenir (seed sırasında)
  // Varsayılan olarak CRM yetkileri verilir
  // ÖNEMLİ: 'roles.manage' SADECE superadmin'e verilir.
  // 'admin.access' → Şirket admini Admin Paneli'ni GÖREBİLİR (kendi tenant'ı
  //   scoblu; API'ler tenantId ile filtrelenir). Dağıtım Merkezi de görünür —
  //   kendi firmasının PWA/APK dağıtımını yapabilir.
  //   Superadmin ayrıca platform genelini ve tüm tenant'ları görür.
  admin: [
    'dashboard.view',
    'messages.view',
    'users.manage', 'settings.manage',
    'reports.view', 'export.data',
    'expenses.view', 'expenses.manage',
    'audit.view',
    'social.view', 'social.manage',
    'admin.access',
    'hr.view', 'hr.manage', 'tickets.view', 'tickets.manage',
  ],

  // ===== MÜDÜR — CRM + ekip + raporlar =====
  // Belge görüntüleme: fatura + irsaliye + çeki listesi (Belge Yönetimi sayfası)
  manager: [
    'dashboard.view',
    'customers.view.own', 'customers.view.team', 'customers.edit',
    'leads.import', 'leads.view', 'leads.edit', 'maps.search',
    'deals.manage', 'tasks.manage', 'tasks.view',
    'reports.view', 'export.data',
    'messages.view',
    'production.view',
    'expenses.view',
    'social.view', 'social.manage',
    'orders.view', 'irsaliye.view', 'invoices.view',
    'hr.view', 'hr.manage',
    'tickets.view', 'tickets.manage',
  ],

  // ===== SATIŞ TEMSİLCİSİ — Sadece kendi müşterileri =====
  rep: [
    'dashboard.view',
    'customers.view.own', 'customers.edit',
    'leads.import', 'leads.view', 'leads.edit', 'maps.search',
    'deals.manage', 'tasks.view',
    'reports.view',
    'messages.view',
    'social.view',
    'tickets.view',
    'hr.view',
  ],

  // ===== SALT OKUNUR =====
  readonly: [
    'dashboard.view',
    'customers.view.own', 'leads.view', 'tasks.view',
    'messages.view',
    'social.view',
    'tickets.view',
  ],

  // ===== STOK / DEPO — Sadece üretim listesi + irsaliye + sipariş =====
  stock: [
    'dashboard.view',
    'messages.view',
    'production.view', 'production.manage',
    'orders.view',
    'irsaliye.view', 'irsaliye.manage',
    'tickets.view',
  ],

  // ===== KAFE ROLLERİ — Sadece kafe =====
  kasa: [
    'dashboard.view',
    'cafe.view', 'cafe.manage', 'cafe.orders', 'cafe.kitchen',
    'reports.view', // kasa raporları görebilir
    'messages.view',
    'tickets.view',
  ],
  barmen: [
    'dashboard.view',
    'cafe.view', 'cafe.bar', 'cafe.orders',
    'messages.view',
    'tickets.view',
  ],
  komi: [
    'dashboard.view',
    'cafe.view', 'cafe.orders', 'cafe.kitchen',
    'messages.view',
    'tickets.view',
  ],

  // ===== MARKET ROLLERİ — Market + üretim + mesajlaşma =====
  kasiyer: [
    'market.view', 'market.pos',
    'reports.view',
    'messages.view',
    'dashboard.view',
    'tickets.view',
  ],
  depo_sorumlusu: [
    'market.view', 'market.stock',
    'market.manage',
    'messages.view',
    'dashboard.view',
    'production.view', 'production.manage',
    'orders.view',
    'irsaliye.view', 'irsaliye.manage',
    'tickets.view',
  ],
}

// Şirket admini (admin rolü) için sektöre göre ek yetkiler
// Bu fonksiyon, admin rolündeki kullanıcının tenant'ının sektörüne göre
// hangi modül yetkilerini alacağını belirler
// ÖNEMLİ: 'roles.manage' burada YOK — yalnızca superadmin (Program Admini)
// rolüne özeldir. 'admin.access' base'e DAHİLDİR: şirket admini Admin
// Paneli'ni görebilir (API'ler kendi tenant'ı ile sınırlıdır).
export function getAdminPermissionsForTenant(tenantName: string): PermissionKey[] {
  const base: PermissionKey[] = [
    'dashboard.view',
    'messages.view',
    'users.manage', 'settings.manage',
    'reports.view', 'export.data',
    'expenses.view', 'expenses.manage',
    'audit.view',
    'social.view', 'social.manage',
    'admin.access',
    'hr.view', 'hr.manage', 'tickets.view', 'tickets.manage',
  ]

  const name = tenantName.toLowerCase()

  // Kafe şirketi → kafe yetkileri
  if (name.includes('kafe') || name.includes('restoran') || name.includes('cafe')) {
    return [...base, 'cafe.view', 'cafe.manage', 'cafe.orders', 'cafe.bar', 'cafe.kitchen']
  }

  // Market şirketi → market yetkileri
  if (name.includes('market') || name.includes('market') || name.includes('bakkal')) {
    return [...base, 'market.view', 'market.pos', 'market.stock', 'market.manage']
  }

  // Site şirketi → site yetkileri
  if (name.includes('site') || name.includes('apartman') || name.includes('yönetim')) {
    return [...base, 'site.view', 'site.manage']
  }

  // Randevu şirketi → randevu yetkileri
  if (name.includes('kuaför') || name.includes('berber') || name.includes('güzellik') || name.includes('diş')) {
    return [...base, 'appointments.view', 'appointments.manage']
  }

  // CRM/ERP şirketi → CRM + ERP yetkileri
  return [
    ...base,
    'customers.view.own', 'customers.view.team', 'customers.view.all',
    'customers.edit', 'customers.delete',
    'leads.import', 'leads.view', 'leads.edit', 'maps.search',
    'deals.manage', 'tasks.manage', 'tasks.view',
    'erp.manage', 'production.view', 'production.manage',
    'orders.view', 'irsaliye.view', 'irsaliye.manage', 'invoices.view',
  ]
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Program Admini',
  admin: 'Şirket Admini',
  manager: 'Müdür',
  rep: 'Satış Temsilcisi',
  readonly: 'Salt Okunur',
  stock: 'Stok Sorumlusu',
  kasa: 'Kasa',
  barmen: 'Barmen',
  komi: 'Komi',
  kasiyer: 'Kasiyer',
  depo_sorumlusu: 'Depo Sorumlusu',
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  superadmin: 100,  // En üst — program admini
  admin: 80,        // Şirket admini
  manager: 60,      // Müdür
  rep: 40,          // Satış temsilcisi
  kasa: 30,         // Kafe kasa
  kasiyer: 30,      // Market kasa
  barmen: 25,       // Kafe barmen
  komi: 25,         // Kafe komi
  depo_sorumlusu: 25, // Market depo
  stock: 25,        // Üretim depo
  readonly: 10,     // Salt okunur
}

export const ALL_PERMISSIONS: { key: PermissionKey; label: string; group: string }[] = [
  { key: 'dashboard.view', label: 'Dashboard görüntüle', group: 'Genel' },
  { key: 'customers.view.own', label: 'Kendi müşterilerini görüntüle', group: 'Müşteriler' },
  { key: 'customers.view.team', label: 'Ekip müşterilerini görüntüle', group: 'Müşteriler' },
  { key: 'customers.view.all', label: 'Tüm müşterileri görüntüle', group: 'Müşteriler' },
  { key: 'customers.edit', label: 'Müşteri düzenle', group: 'Müşteriler' },
  { key: 'customers.delete', label: 'Müşteri sil', group: 'Müşteriler' },
  { key: 'leads.import', label: 'Lead içe aktar', group: 'Potansiyel Müşteri' },
  { key: 'leads.view', label: 'Leadleri görüntüle', group: 'Potansiyel Müşteri' },
  { key: 'leads.edit', label: 'Lead düzenle', group: 'Potansiyel Müşteri' },
  { key: 'maps.search', label: 'Harita araması yap', group: 'Potansiyel Müşteri' },
  { key: 'deals.manage', label: 'Fırsat yönet', group: 'Satış' },
  { key: 'tasks.manage', label: 'Görev yönet', group: 'Satış' },
  { key: 'tasks.view', label: 'Görevleri görüntüle', group: 'Satış' },
  { key: 'reports.view', label: 'Raporları görüntüle', group: 'Raporlar' },
  { key: 'export.data', label: 'Veri dışa aktar', group: 'Raporlar' },
  { key: 'messages.view', label: 'Mesajlaşma', group: 'İletişim' },
  { key: 'admin.access', label: 'Admin Paneli erişimi', group: 'Yönetim' },
  { key: 'users.manage', label: 'Kullanıcı yönet', group: 'Yönetim' },
  { key: 'roles.manage', label: 'Rol/yetki yönet', group: 'Yönetim' },
  { key: 'settings.manage', label: 'Ayarları yönet', group: 'Yönetim' },
  { key: 'audit.view', label: 'Denetim kayıtlarını gör', group: 'Yönetim' },
  { key: 'erp.manage', label: 'ERP modülünü yönet', group: 'ERP' },
  { key: 'orders.view', label: 'Siparişleri görüntüle', group: 'ERP' },
  { key: 'invoices.view', label: 'Faturaları görüntüle (Belge Yönetimi)', group: 'ERP' },
  { key: 'irsaliye.view', label: 'İrsaliyeleri görüntüle', group: 'ERP' },
  { key: 'irsaliye.manage', label: 'İrsaliye yönet (oluştur, düzenle, sil)', group: 'ERP' },
  { key: 'production.view', label: 'Üretim listesini görüntüle', group: 'Üretim' },
  { key: 'production.manage', label: 'Üretim kalemlerini yönet', group: 'Üretim' },
  { key: 'expenses.view', label: 'Giderleri görüntüle', group: 'Giderler' },
  { key: 'expenses.manage', label: 'Gider yönet', group: 'Giderler' },
  { key: 'cafe.view', label: 'Kafe modülünü görüntüle', group: 'Kafe' },
  { key: 'cafe.manage', label: 'Kafe yönetimi (masa/menü/sipariş)', group: 'Kafe' },
  { key: 'cafe.orders', label: 'Sipariş alma (komi/kasa)', group: 'Kafe' },
  { key: 'cafe.bar', label: 'Bar istasyonu (barmen)', group: 'Kafe' },
  { key: 'cafe.kitchen', label: 'Mutfak istasyonu (komi/admin)', group: 'Kafe' },
  { key: 'market.view', label: 'Market modülünü görüntüle', group: 'Market' },
  { key: 'market.pos', label: 'Kasa / POS satış (kasiyer)', group: 'Market' },
  { key: 'market.stock', label: 'Stok / Sayım / Mal kabul (depo)', group: 'Market' },
  { key: 'market.manage', label: 'Market yönetimi (admin)', group: 'Market' },
  { key: 'site.view', label: 'Site Yönetimi modülünü görüntüle', group: 'Site Yönetimi' },
  { key: 'site.manage', label: 'Site yönet (daire, sakin, aidat, personel)', group: 'Site Yönetimi' },
  { key: 'appointments.view', label: 'Randevu sistemini görüntüle', group: 'Randevu' },
  { key: 'appointments.manage', label: 'Randevu yönet (personel/hizmet)', group: 'Randevu' },
  { key: 'social.view', label: 'Sosyal medya görüntüle', group: 'Sosyal Medya' },
  { key: 'social.manage', label: 'Sosyal medya yönet (post, hesap, yayınla)', group: 'Sosyal Medya' },
]

export function getRolePermissions(role: Role): PermissionKey[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function hasPermission(user: SessionUser | null, key: PermissionKey): boolean {
  if (!user) return false
  return user.permissions.includes(key)
}

export function hasAnyPermission(user: SessionUser | null, keys: PermissionKey[]): boolean {
  if (!user) return false
  return keys.some((k) => user.permissions.includes(k))
}

export function getViewScope(user: SessionUser | null): 'all' | 'team' | 'own' | 'none' {
  if (!user) return 'none'
  if (user.permissions.includes('customers.view.all')) return 'all'
  if (user.permissions.includes('customers.view.team')) return 'team'
  if (user.permissions.includes('customers.view.own')) return 'own'
  return 'none'
}

export function getVisibleUserIds(users: { id: string; managerId: string | null }[], currentUserId: string): string[] {
  const result = new Set<string>([currentUserId])
  let changed = true
  while (changed) {
    changed = false
    for (const u of users) {
      if (u.managerId && result.has(u.managerId) && !result.has(u.id)) {
        result.add(u.id)
        changed = true
      }
    }
  }
  return Array.from(result)
}

export function canDelegatePermission(
  actor: SessionUser,
  targetUserId: string,
  permission: PermissionKey,
  subordinates: string[],
): boolean {
  if (!actor.permissions.includes(permission)) return false
  if (targetUserId === actor.id) return false
  if (!subordinates.includes(targetUserId)) return false
  return true
}

export function isCafeRole(role: string): boolean {
  return role === 'kasa' || role === 'barmen' || role === 'komi'
}

export function isMarketRole(role: string): boolean {
  return role === 'kasiyer' || role === 'depo_sorumlusu'
}

export function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

export function isSuperAdmin(role: string): boolean {
  return role === 'superadmin'
}

// Eşsiz personel kodu üret
export function generateEmployeeCode(tenantId: string, seq: number): string {
  const prefix = tenantId.slice(-4).toUpperCase()
  return `${prefix}-${String(seq).padStart(3, '0')}`
}
