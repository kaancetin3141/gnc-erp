import { NextRequest } from 'next/server'
import { getServerSessionFromRequest } from '@/lib/auth'
import { ok, err } from '@/lib/api-utils'

// ============================================================
// GET /api/auth/session — mevcut oturumu doğrula
// İstemci sayfa yüklenince çağırır:
//  · oturum geçerli   → güncel kullanıcı verisi döner (rol/yetki
//    değişiklikleri sayfa yenilemesinde senkronize olur)
//  · oturum geçersiz  → 401 (istemci otomatik logout yapar —
//    "zombi giriş" ve sonsuz 401 poll döngüsü önlenir; sunucu
//    resetlendiğinde localStorage'daki bayat kullanıcı temizlenir)
// ============================================================
export async function GET(req: NextRequest) {
  const user = await getServerSessionFromRequest(req)
  if (!user) return err('Oturum geçersiz veya süresi dolmuş', 401)
  return ok({ user })
}
