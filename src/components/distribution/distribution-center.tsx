'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Globe, Smartphone, Apple, Monitor, Download, CheckCircle2, XCircle,
  Loader2, ExternalLink, Copy, Check, AlertCircle, Info, Share2,
  Wifi, WifiOff, Bell, BellOff, RefreshCw, Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'android-chrome' | 'ios-safari' | 'desktop-chrome' | 'desktop-edge' | 'desktop-firefox' | 'desktop-safari' | 'unknown'

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  const isAndroid = /Android/.test(ua)
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream
  const isMac = /Macintosh/.test(ua)
  const isWindows = /Windows/.test(ua)
  const isLinux = /Linux/.test(ua) && !isAndroid

  if (isAndroid && /Chrome/.test(ua)) return 'android-chrome'
  if (isIOS && /Safari/.test(ua) && !/Chrome/.test(ua)) return 'ios-safari'
  if (isWindows || isLinux) {
    if (/Edg/.test(ua)) return 'desktop-edge'
    if (/Chrome/.test(ua)) return 'desktop-chrome'
    if (/Firefox/.test(ua)) return 'desktop-firefox'
  }
  if (isMac && /Safari/.test(ua) && !/Chrome/.test(ua)) return 'desktop-safari'
  return 'unknown'
}

export function DistributionCenter() {
  const [platform, setPlatform] = useState<Platform>('unknown')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [swState, setSwState] = useState<'loading' | 'active' | 'none'>('loading')
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [onlineStatus, setOnlineStatus] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setPlatform(detectPlatform())
    setInstalled(window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true)
    setOnlineStatus(navigator.onLine)
    setPushSupported('PushManager' in window && 'Notification' in window)
    setPushPermission('Notification' in window ? Notification.permission : 'unsupported')

    // Service worker durumu
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        setSwState(reg?.active ? 'active' : 'none')
      }).catch(() => setSwState('none'))
    } else {
      setSwState('none')
    }

    // beforeinstallprompt yakala
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('appinstalled', installedHandler)

    const onlineHandler = () => setOnlineStatus(true)
    const offlineHandler = () => setOnlineStatus(false)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) {
      toast.info('Bu tarayıcı otomatik kurulum desteklemiyor', {
        description: 'Manuel talimatları izleyin (aşağıda)',
      })
      return
    }
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      toast.success('Uygulama kuruldu! 🎉')
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleEnablePush = useCallback(async () => {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    setPushPermission(permission)
    if (permission === 'granted') {
      toast.success('Bildirimler etkinleştirildi', {
        description: 'Artık yeni mesajlar, görevler ve aidat hatırlatmaları için bildirim alacaksınız.',
      })
      // Test bildirimi
      setTimeout(() => {
        new Notification('GNC CRM', {
          body: 'Bildirimler başarıyla etkin! 🎉',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192-maskable.png',
        })
      }, 1000)
    } else if (permission === 'denied') {
      toast.error('Bildirim izni reddedildi', {
        description: 'Tarayıcı ayarlarından izin vermeniz gerekiyor.',
      })
    }
  }, [])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      toast.success('Kopyalandı', { description: label })
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const pwaScore = (() => {
    let score = 0
    if (swState === 'active') score += 25
    if ('PushManager' in window) score += 25
    if (pushPermission === 'granted') score += 25
    if (installed) score += 25
    return score
  })()

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Hero */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white">
        <CardContent className="p-8">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <Globe className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight">Dağıtım Merkezi</h1>
              <p className="text-emerald-50 mt-1 text-sm">
                Bu uygulamayı 4 platformda (Web + Android + iOS + Masaüstü) nasıl yayınlayacağınızı buradan yönetin.
                Şu anda önizlemede gördüğünüz sürüm, PWA olarak tüm modern tarayıcılarda çalışır.
              </p>
            </div>
          </div>

          {/* PWA Skor */}
          <div className="mt-6 p-4 rounded-xl bg-white/10 backdrop-blur border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">PWA Hazırlık Skoru</span>
              <span className="text-2xl font-bold tabular-nums">{pwaScore}/100</span>
            </div>
            <Progress value={pwaScore} className="h-2 bg-white/20" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
              <ScoreItem label="Service Worker" ok={swState === 'active'} />
              <ScoreItem label="Push API" ok={'PushManager' in window} />
              <ScoreItem label="Bildirim İzni" ok={pushPermission === 'granted'} />
              <ScoreItem label="Yüklendi" ok={installed} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Şu anki durum */}
      <div className="grid md:grid-cols-3 gap-4">
        <StatusCard
          icon={onlineStatus ? Wifi : WifiOff}
          title="Bağlantı"
          value={onlineStatus ? 'Çevrimiçi' : 'Çevrimdışı'}
          color={onlineStatus ? 'emerald' : 'red'}
        />
        <StatusCard
          icon={RefreshCw}
          title="Service Worker"
          value={swState === 'active' ? 'Aktif' : swState === 'loading' ? 'Yükleniyor' : 'Pasif'}
          color={swState === 'active' ? 'emerald' : 'amber'}
        />
        <StatusCard
          icon={Bell}
          title="Bildirimler"
          value={pushPermission === 'granted' ? 'Etkin' : pushPermission === 'denied' ? 'Reddedildi' : pushPermission === 'unsupported' ? 'Desteklenmiyor' : 'Beklemede'}
          color={pushPermission === 'granted' ? 'emerald' : pushPermission === 'denied' ? 'red' : 'amber'}
        />
      </div>

      {/* Hemen şimdi yapılabilirler */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Hemen Şimdi Yapılabilirler (Tarayıcıdan)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Install button */}
          <div className="flex items-start gap-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50">
            <Download className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">1. Uygulamayı Cihazına Kur</div>
              <p className="text-xs text-muted-foreground mt-1">
                {installed
                  ? '✅ Bu cihazda zaten kurulu. Tüm cihazlardan erişebilirsiniz.'
                  : platform === 'ios-safari'
                    ? 'Safari\'de alttaki Paylaş butonuna basın → "Ana Ekrana Ekle" → "Ekle" deyin.'
                    : deferredPrompt
                      ? 'Bu tarayıcıda otomatik kurulum destekleniyor. Aşağıdaki butona tıklayın.'
                      : 'Tarayıcı adres çubuğundaki yükle simgesine (⊕) tıklayın veya aşağıdaki talimatları izleyin.'}
              </p>
              <div className="flex gap-2 mt-3">
                {!installed && deferredPrompt && (
                  <Button size="sm" onClick={handleInstall} className="bg-emerald-600 hover:bg-emerald-700">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Hemen Kur
                  </Button>
                )}
                {!installed && platform === 'ios-safari' && (
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard('1. Safari alt çubuk: Paylaş butonu\n2. "Ana Ekrana Ekle"\n3. "Ekle"', 'iOS talimatı')}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Talimat
                  </Button>
                )}
                {installed && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Kurulu
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Push notification */}
          <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
            <Bell className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">2. Bildirimleri Etkinleştir</div>
              <p className="text-xs text-muted-foreground mt-1">
                {pushPermission === 'granted'
                  ? '✅ Bildirimler etkin. Yeni mesaj/görev/aidat geldiğinde anlık bildirim alacaksınız.'
                  : pushPermission === 'denied'
                    ? 'Tarayıcı ayarlarından bildirim iznini sıfırlamanız gerekiyor.'
                    : 'Yeni mesaj, görev ve aidat hatırlatmaları için anlık bildirim alın.'}
              </p>
              <div className="flex gap-2 mt-3">
                {pushPermission !== 'granted' && pushPermission !== 'unsupported' && pushPermission !== 'denied' && (
                  <Button size="sm" variant="outline" onClick={handleEnablePush}>
                    <Bell className="w-3.5 h-3.5 mr-1.5" /> İzin Ver
                  </Button>
                )}
                {pushPermission === 'denied' && (
                  <Button size="sm" variant="outline" onClick={() => {
                    toast.info('Tarayıcı bildirim ayarlarını sıfırla', {
                      description: 'Chrome: chrome://settings/content/notifications → bu siteyi "İzin ver" yap',
                    })
                  }}>
                    <Info className="w-3.5 h-3.5 mr-1.5" /> Nasıl?
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Share URL */}
          <div className="flex items-start gap-4 p-4 rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/50">
            <Share2 className="w-6 h-6 text-sky-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">3. Uygulama Linkini Paylaş</div>
              <p className="text-xs text-muted-foreground mt-1">
                Bu linki herkesle paylaşın — tarayıcıdan direkt açıp kurabilirler.
              </p>
              <div className="flex gap-2 mt-3 items-center">
                <code className="text-xs bg-white dark:bg-slate-900 px-2 py-1 rounded border border-border">
                  {typeof window !== 'undefined' ? window.location.origin : '...'}
                </code>
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(window.location.origin, 'URL kopyalandı')}>
                  {copied === 'URL kopyalandı' ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  Kopyala
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform bazlı rehber */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Web — şu an çalışıyor */}
        <PlatformCard
          icon={Globe}
          title="Web (PWA)"
          status="ready"
          statusLabel="Hazır"
          gradient="from-emerald-500 to-teal-600"
          description="Tarayıcıdan direkt kullanılır. Yüklenebilir (installable). Çevrimdışı çalışır."
          requirements={[
            { label: 'Next.js standalone build', done: true },
            { label: 'PWA manifest + service worker', done: true },
            { label: 'HTTPS (önizlemede zaten aktif)', done: true },
            { label: 'Tüm modern tarayıcılarda çalışır', done: true },
          ]}
          actions={[
            { label: 'Canlıda Yayınla (Vercel)', primary: true, onClick: () => toast.info('Vercel dağıtımı', {
              description: 'GitHub\'a push yapın → Vercel projeyi import etsin → otomatik deploy. Bu sandbox\'ta yapılamaz çünkü CLI yetkisi gerekir.',
            }) },
            { label: 'Download Production Build', primary: false, onClick: () => toast.info('Production build hazır', {
              description: '.next/standalone/ klasörü tam bağımsız bir Node.js sunucusudur. Herhangi bir hosting\'e yükleyin.',
            }) },
          ]}
        />

        {/* Android */}
        <PlatformCard
          icon={Smartphone}
          title="Android APK"
          status="config-ready"
          statusLabel="Yapılandırma Hazır"
          gradient="from-green-500 to-emerald-600"
          description="Bu tarayıcıdan APK üretmek için Android Studio gerekir. PWA'yı Play Store'a TWA (Trusted Web Activity) olarak göndermek daha kolaydır."
          requirements={[
            { label: 'PWA (yukarıda aktif)', done: true },
            { label: 'Android Studio + JDK 17', done: false },
            { label: 'Capacitor: capacitor.config.ts hazır', done: true },
            { label: 'Bubblewrap CLI (TWA için, daha kolay)', done: false },
          ]}
          actions={[
            { label: 'PWA\'yı Android\'e Kur (kolay yol)', primary: true, onClick: () => toast.success('Android için en kolay yol', {
              description: 'Android telefonunuzda Chrome ile bu sayfayı açın → adres çubuğundaki ⊕ simgesi → "Uygulamayı Yükle". Bu PWA\'yı native gibi kurar.',
              duration: 8000,
            }) },
            { label: 'Play Store\'a Gönder (TWA)', primary: false, onClick: () => toast.info('Bubblewrap ile TWA', {
              description: 'npx @bubblewrap/cli init --manifest=https://preview-link/manifest.json → Android Studio olmadan da APK üretir',
              duration: 8000,
            }) },
            { label: 'Native APK (Capacitor)', primary: false, onClick: () => toast.info('Capacitor ile native APK', {
              description: 'Kendi bilgisayarınızda: npm i -g @capacitor/cli && npx cap add android && npx cap open android',
              duration: 8000,
            }) },
          ]}
        />

        {/* iOS */}
        <PlatformCard
          icon={Apple}
          title="iOS IPA"
          status="config-ready"
          statusLabel="Yapılandırma Hazır"
          gradient="from-slate-600 to-slate-800"
          description="iOS IPA üretmek için macOS + Xcode gerekir. PWA olarak iPhone'a kurulabilir (iOS 16.4+ push destekler)."
          requirements={[
            { label: 'PWA (yukarıda aktif)', done: true },
            { label: 'macOS + Xcode 15+', done: false },
            { label: 'Apple Developer hesabı ($99/yıl)', done: false },
            { label: 'Capacitor iOS config hazır', done: true },
          ]}
          actions={[
            { label: 'PWA\'yı iPhone\'a Kur (kolay yol)', primary: true, onClick: () => toast.success('iPhone için en kolay yol', {
              description: 'iPhone\'da Safari ile bu sayfayı açın → Paylaş butonu → "Ana Ekrana Ekle" → "Ekle". Native app gibi ana ekranda belirir.',
              duration: 8000,
            }) },
            { label: 'App Store\'a Gönder (Native)', primary: false, onClick: () => toast.info('Native iOS için', {
              description: 'Kendi Mac\'inizde: npx cap add ios && npx cap open ios → Xcode\'da Archive → App Store Connect\'e yükle',
              duration: 8000,
            }) },
          ]}
        />

        {/* Desktop */}
        <PlatformCard
          icon={Monitor}
          title="Windows / Mac / Linux"
          status="config-ready"
          statusLabel="Yapılandırma Hazır"
          gradient="from-violet-500 to-purple-600"
          description="Masaüstü uygulaması olarak kurulabilir. PWA olarak Chrome/Edge'den kurulur, Tauri ile native installer üretilebilir."
          requirements={[
            { label: 'PWA (yukarıda aktif)', done: true },
            { label: 'Tauri config: src-tauri/ hazır', done: true },
            { label: 'Rust toolchain (native binary için)', done: false },
            { label: 'Microsoft Store / Mac App Store (opsiyonel)', done: false },
          ]}
          actions={[
            { label: 'PWA olarak Masaüstüne Kur', primary: true, onClick: () => toast.success('Desktop için en kolay yol', {
              description: 'Chrome/Edge\'de adres çubuğundaki ⊕ simgesi → "Yükle". Masaüstünde native app gibi açılır (kendi penceresinde).',
              duration: 8000,
            }) },
            { label: 'Native .exe/.dmg üret (Tauri)', primary: false, onClick: () => toast.info('Tauri ile native binary', {
              description: 'Kendi bilgisayarınızda Rust + Tauri CLI kurulu olmalı: curl https://sh.rustup.rs | sh && npm i -g @tauri-apps/cli && tauri build',
              duration: 8000,
            }) },
          ]}
        />
      </div>

      {/* Komut kopyalama — gerçek komutlar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="w-5 h-5 text-emerald-600" />
            Yerel Makinenizde Çalıştırılacak Komutlar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Bu komutlar <strong>sandbox'ta değil</strong>, kendi bilgisayarınızda çalıştırılır. Gerekli araçları kurduktan sonra (Node, Rust, Android Studio) projenizi kendi makinenize kopyalayıp çalıştırın.
          </p>

          {/* Web */}
          <CommandBlock
            title="Web — Production Build + Sunucu"
            description="Node.js 18+ yeterli. Sunucunuzu herhangi bir hostinge (Vercel, Docker, VPS) yükleyebilirsiniz."
            commands={[
              'git clone <repo> && cd gnc-crm',
              'bun install',
              'bun run db:push',
              'bun run build:web',
              'cd .next/standalone && PORT=3000 node server.js',
            ]}
            onCopy={(c) => copyToClipboard(c, 'Web komutları')}
            copied={copied === 'Web komutları'}
          />

          {/* Android APK */}
          <CommandBlock
            title="Android — Native APK (Capacitor)"
            description="Android Studio + JDK 17 gerekli. ~30 dakika sürer."
            commands={[
              'npm install -g @capacitor/cli',
              'bun add @capacitor/core @capacitor/android',
              'bun run build:web',
              'npx cap add android',
              'npx cap sync android',
              'npx cap open android',
              '# Android Studio açılır → Build → Generate Signed APK',
            ]}
            onCopy={(c) => copyToClipboard(c, 'Android komutları')}
            copied={copied === 'Android komutları'}
          />

          {/* Android TWA — Bubblewrap */}
          <CommandBlock
            title="Android — TWA (Bubblewrap — Android Studio gerekmez)"
            description="PWA'yı Play Store'a native APK olarak sarmalar. Java JDK 17 yeterli."
            commands={[
              'npx @bubblewrap/cli init \\',
              '  --manifest=https://your-domain.com/manifest.json',
              'cd gnc-crm-android && bubblewrap build --verbose',
              '# → app-release-signed.apk üretilir (Play Store\'a yükle)',
            ]}
            onCopy={(c) => copyToClipboard(c, 'TWA komutları')}
            copied={copied === 'TWA komutları'}
          />

          {/* iOS */}
          <CommandBlock
            title="iOS — IPA (Capacitor)"
            description="macOS + Xcode 15+ + Apple Developer hesabı ($99/yıl) gerekli."
            commands={[
              'bun add @capacitor/ios',
              'bun run build:web',
              'npx cap add ios',
              'npx cap sync ios',
              'npx cap open ios',
              '# Xcode açılır → Product → Archive → Distribute App',
            ]}
            onCopy={(c) => copyToClipboard(c, 'iOS komutları')}
            copied={copied === 'iOS komutları'}
          />

          {/* Desktop */}
          <CommandBlock
            title="Masaüstü — Windows/Mac/Linux (Tauri)"
            description="Rust toolchain gerekli. Tek komutla tüm platformlar için binary üretir."
            commands={[
              '# Rust kur (ilk seferlik)',
              'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
              'npm install -g @tauri-apps/cli',
              'bun run build:web',
              'bun run tauri:build',
              '# → src-tauri/target/release/bundle/ altında .msi / .dmg / .deb',
            ]}
            onCopy={(c) => copyToClipboard(c, 'Tauri komutları')}
            copied={copied === 'Tauri komutları'}
          />
        </CardContent>
      </Card>

      {/* Önemli not */}
      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-200 mb-1">Önemli: Bu Sandbox Sınırlamaları</div>
              <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-4">
                <li>Bu önizleme ortamında <strong>Android Studio, Xcode ve Rust bulunmaz</strong> — native APK/IPA/.exe üretilemez.</li>
                <li><strong>PWA olarak kurulum gerçekten çalışır</strong> — bu, kullanıcılarınızın 4 platformda da uygulamayı kurması için en kolay yoldur.</li>
                <li>Native binary'ler (APK/IPA/.exe) için yukarıdaki komutları kendi bilgisayarınızda çalıştırın.</li>
                <li>Web (Vercel) dağıtımı için GitHub'a push yapmanız yeterli — Vercel gerisini otomatik yapar.</li>
                <li>İlk kurulumda tüm kullanıcılar PWA olarak kurabilir; ileride gerektiğinde store'larda native paketleri yayınlayabilirsiniz.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ScoreItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? <CheckCircle2 className="w-3 h-3 text-emerald-300" /> : <XCircle className="w-3 h-3 text-white/50" />}
      <span className={ok ? 'text-white' : 'text-white/60'}>{label}</span>
    </div>
  )
}

function StatusCard({ icon: Icon, title, value, color }: {
  icon: typeof Globe
  title: string
  value: string
  color: 'emerald' | 'red' | 'amber'
}) {
  const colors = {
    emerald: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400',
    red: 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400',
    amber: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400',
  }
  return (
    <Card className={cn('bg-gradient-to-br border', colors[color])}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium opacity-80">{title}</div>
            <div className="font-semibold text-sm">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PlatformCard({ icon: Icon, title, status, statusLabel, gradient, description, requirements, actions }: {
  icon: typeof Globe
  title: string
  status: 'ready' | 'config-ready' | 'blocked'
  statusLabel: string
  gradient: string
  description: string
  requirements: { label: string; done: boolean }[]
  actions: { label: string; primary: boolean; onClick: () => void }[]
}) {
  const statusColors = {
    ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    'config-ready': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    blocked: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader className={cn('bg-gradient-to-br text-white', gradient)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
            </div>
          </div>
          <Badge className={cn('text-[10px] uppercase tracking-wide font-bold border-0', statusColors[status])}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="space-y-1.5">
          {requirements.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-xs">
              {r.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <span className={r.done ? '' : 'text-muted-foreground line-through'}>{r.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {actions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.primary ? 'default' : 'outline'}
              onClick={a.onClick}
              className={a.primary ? 'bg-emerald-600 hover:bg-emerald-700 text-xs' : 'text-xs'}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CommandBlock({ title, description, commands, onCopy, copied }: {
  title: string
  description: string
  commands: string[]
  onCopy: (cmd: string) => void
  copied: boolean
}) {
  const cmdText = commands.join('\n')
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onCopy(cmdText)} className="h-7 text-xs">
          {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </Button>
      </div>
      <pre className="bg-slate-950 text-slate-100 text-xs p-4 overflow-x-auto custom-scroll font-mono">
        {commands.map((c, i) => (
          <div key={i} className={cn(c.startsWith('#') && 'text-slate-500 italic')}>{c}</div>
        ))}
      </pre>
    </div>
  )
}
