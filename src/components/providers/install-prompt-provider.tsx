'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Download, X, Smartphone, Monitor } from 'lucide-react'
import { useAppStore } from '@/store/app-store'

// PWA "Uygulamayı Yükle" prompt yöneticisi
// beforeinstallprompt event'i yakalayıp kendi UI'ımızı gösteririz
// (Chrome/Edge'de çalışır, iOS Safari'de kullanıcı el ile ekler)

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'gnc-pwa-install-dismissed'
const DISMISS_DURATION = 1000 * 60 * 60 * 24 * 7 // 7 gün

export function InstallPromptProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | 'other'>('other')
  // Giriş ekranındaki kartları KAPATMAMASI için banner yalnızca oturum açıldıktan sonra gösterilir
  const user = useAppStore((s) => s.user)

  useEffect(() => {
    // Standalone modda (zaten kurulmuş) gösterme
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

    // Platform tespiti
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) setPlatform('ios')
    else if (/Android/.test(ua)) setPlatform('android')
    else if (/Windows|Mac|Linux/.test(ua)) setPlatform('desktop')

    // beforeinstallprompt — Chrome/Edge/Android tarayıcılar
    const handler = (e: Event) => {
      e.preventDefault()
      const evt = e as BeforeInstallPromptEvent
      // 7 gün içinde dismiss edildiyse gösterme
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (dismissed && Date.now() - parseInt(dismissed, 10) < DISMISS_DURATION) return
      setDeferredPrompt(evt)
      // 3 saniye sonra göster (sayfanın yüklenmesini bekle)
      setTimeout(() => setShowPrompt(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // appinstalled event
    const installedHandler = () => {
      setShowPrompt(false)
      setDeferredPrompt(null)
      console.log('PWA kuruldu')
    }
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, Date.now().toString())
    }
    setDeferredPrompt(null)
    setShowPrompt(false)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setShowPrompt(false)
  }, [])

  // iOS için talimat (iOS Safari beforeinstallprompt vermez)
  const [showIosHint, setShowIosHint] = useState(false)
  useEffect(() => {
    if (platform === 'ios' && !isStandalone) {
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (dismissed && Date.now() - parseInt(dismissed, 10) < DISMISS_DURATION) return
      // 5 saniye sonra iOS talimatı göster
      const t = setTimeout(() => setShowIosHint(true), 5000)
      return () => clearTimeout(t)
    }
  }, [platform, isStandalone])

  if (isStandalone) {
    return <>{children}</>
  }

  return (
    <>
      {children}

      {/* Chrome/Edge/Android install prompt — yalnızca oturum açıldıktan sonra */}
      {showPrompt && deferredPrompt && user && (
        <InstallBanner
          icon={platform === 'desktop' ? Monitor : Smartphone}
          title="GNC CRM'i Uygulama Olarak Yükle"
          subtitle="Daha hızlı erişim, çevrimdışı destek ve bildirimler"
          installLabel="Yükle"
          onInstall={handleInstall}
          onDismiss={handleDismiss}
        />
      )}

      {/* iOS talimat (Paylaş → Ana Ekrana Ekle) — yalnızca oturum açıldıktan sonra */}
      {showIosHint && user && (
        <InstallBanner
          icon={Smartphone}
          title="iPhone'una Kur"
          subtitle="Safari'de Paylaş butonuna basıp 'Ana Ekrana Ekle' de"
          installLabel="Talimat Göster"
          onInstall={() => {
            alert('iOS Safari:\n1. Alt çubuktan Paylaş butonuna dokun\n2. "Ana Ekrana Ekle" seç\n3. "Ekle" de')
            handleDismiss()
          }}
          onDismiss={() => {
            setShowIosHint(false)
            handleDismiss()
          }}
        />
      )}
    </>
  )
}

function InstallBanner({
  icon: Icon, title, subtitle, installLabel, onInstall, onDismiss,
}: {
  icon: typeof Download
  title: string
  subtitle: string
  installLabel: string
  onInstall: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 animate-slide-up">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 h-1" />
        <div className="p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-slate-900 dark:text-white">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 -m-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <Button
            size="sm"
            onClick={onInstall}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="w-4 h-4 mr-1.5" />
            {installLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDismiss}
          >
            Sonra
          </Button>
        </div>
      </div>
    </div>
  )
}
