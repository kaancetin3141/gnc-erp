'use client'

import { QueryClient } from '@tanstack/react-query'

/**
 * Paylaşılan (singleton) TanStack Query istemcisi.
 *
 * Neden singleton? Oturum değişiminde (login/logout/tenant değişimi) cache'in
 * tamamen temizlenebilmesi için istemciye modül düzeyinde erişmem gerekir.
 * Aksi halde önceki kullanıcının önbelleğe alınmış verileri (ör. panel
 * istatistikleri, müşteri listeleri) yeni kullanıcıya bir anlığına
 * sızabilir — çok kiracılı (multi-tenant) yapıda gizlilik hatasıdır.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
