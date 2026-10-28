import { db } from '@/lib/db'
import type { SessionUser } from '@/types'
import { isAdminRole } from '@/lib/rbac'

// ============================================================
// RANDEVU MODÜLÜ — ROL BAZLI YETKİ YARDIMCILARI
//
// İki profil vardır:
//
// 1) İŞLETME YÖNETİCİSİ (şirket admini / firma sahibi):
//    • Personel ekleme/düzenleme/silme
//    • Hizmet ekleme/düzenleme/silme
//    • İşletme ayarları (çalışma saatleri, otomatik onay, tatiller)
//    • TÜM personelin takvimi ve randevuları
//    • Vitrin & portföy yönetimi
//
// 2) PERSONEL (usta / çırak — Staff.userId ile bağlı hesap):
//    • Yalnız KENDİ randevularını görür/yönetir
//    • Kendi izin/çalışma saatlerini (time-off) kendisi ayarlar
//    • Hangi hizmetleri vereceğini kendisi seçer (mevcut hizmetler
//      arasından — yeni hizmet ekleme admin'e aittir)
//    • Takvimde yalnız kendi kolonunu görür
// ============================================================

export interface AppointmentContext {
  /** Giriş yapan kullanıcı işletmenin sahibi mi? (admin/superadmin) */
  isProviderAdmin: boolean
  /** Personel (usta/çırak) hesabıyla eşleşen Staff kaydı — yönetici için null */
  myStaff: { id: string; name: string; title: string | null } | null
  /** myStaff.id kısayolu */
  myStaffId: string | null
}

/**
 * Provider + kullanıcı bağlamını doğrular ve rol profilini döndürür.
 * İşletme yoksa veya tenant uyuşmazsa null döner (çağıran route 404 üretir).
 */
export async function getAppointmentContext(
  user: SessionUser,
  providerId: string,
): Promise<AppointmentContext | null> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { id: true, tenantId: true },
  })
  if (!provider) return null
  if (provider.tenantId !== user.tenantId && user.role !== 'superadmin') return null

  const isProviderAdmin = isAdminRole(user.role)
  if (isProviderAdmin) {
    return { isProviderAdmin: true, myStaff: null, myStaffId: null }
  }

  // Personel hesabı: bu işletmedeki kendi Staff kaydını bul
  const myStaff = await db.staff.findFirst({
    where: { providerId, userId: user.id },
    select: { id: true, name: true, title: true },
  })
  return { isProviderAdmin: false, myStaff, myStaffId: myStaff?.id ?? null }
}

/** Yönetici değilse ve personel kaydı yoksa → true (erişim tamamen yok) */
export function hasNoScope(ctx: AppointmentContext): boolean {
  return !ctx.isProviderAdmin && !ctx.myStaffId
}
