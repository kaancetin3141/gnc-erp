'use client'

import { useEffect, useState } from 'react'

// Service Worker'ı kaydeder ve güncellemeleri yönetir
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // localhost'ta da SW'i kaydet — test için gerekli
    // Production'da zaten çalışır

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })

        reg.addEventListener('updatefound', () => {
          const installingWorker = reg.installing
          if (!installingWorker) return
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Yeni SW hazır — bekliyor
              setWaitingWorker(installingWorker)
              setUpdateAvailable(true)
            }
          })
        })

        // Sayfa yüklendiğinde periyodik güncelleme kontrolü
        const interval = setInterval(() => {
          reg.update().catch(() => {})
        }, 60 * 60 * 1000) // saatlik

        return () => clearInterval(interval)
      } catch (e) {
        console.warn('SW kaydı başarısız:', e)
      }
    }

    register()

    // Online'a geri dönünce API önbelleğini temizle
    const onOnline = () => {
      if ('caches' in window) {
        caches.delete('gnc-api-v1.0.0').catch(() => {})
      }
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  const applyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
      waitingWorker.addEventListener('statechange', () => {
        if (waitingWorker.state === 'activated') {
          window.location.reload()
        }
      })
    } else {
      window.location.reload()
    }
  }

  return (
    <>
      {children}
      {updateAvailable && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-4 sm:right-auto sm:w-96 z-50 animate-slide-up">
          <div className="bg-emerald-600 text-white rounded-xl shadow-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.78.95 6.5 2.5" />
                <path d="M21 4v5h-5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Yeni sürüm mevcut</div>
              <div className="text-xs text-white/80">Değişiklikleri uygulamak için güncelleyin</div>
            </div>
            <button
              onClick={applyUpdate}
              className="px-3 py-1.5 bg-white text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-50 transition-colors shrink-0"
            >
              Güncelle
            </button>
          </div>
        </div>
      )}
    </>
  )
}
