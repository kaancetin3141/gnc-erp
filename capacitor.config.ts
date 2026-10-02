import type { CapacitorConfig } from '@capacitor/cli'

// GNC CRM — Capacitor config (Android APK + iOS IPA üretim)
// Kullanım:
//   1. npm install -g @capacitor/cli
//   2. Web build: bun run build:web (önce standalone production build)
//   3. npx cap sync
//   4. Android: npx cap open android → Android Studio'da Run/Build APK
//   5. iOS: npx cap open ios → Xcode'da Run/Archive (IPA üret)
//
// Tüm işlemler mevcut PWA'yı native shell olarak sarar —
// ekstra kod yazmaya gerek yok (Capacitor bir WebView wrapper'dır).

const config: CapacitorConfig = {
  appId: 'com.gnccrm.app',
  appName: 'GNC CRM',
  webDir: '.next/standalone', // Next.js standalone build output
  android: {
    allowMixedContent: true,
    backgroundColor: '#10b981',
    // AndroidManifest'de izinler:
    // - INTERNET, ACCESS_NETWORK_STATE, CAMERA, VIBRATE, WAKE_LOCK
    // - POST_NOTIFICATIONS (Android 13+)
    // - SCHEDULE_EXACT_ALARM (zamanlanmış bildirimler için)
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: '#10b981',
    // Info.plist izinleri:
    // - NSCameraUsageDescription
    // - NSPhotoLibraryUsageDescription
    // - NSMicrophoneUsageDescription
    // - NSUserNotificationUsageDescription
    contentInset: 'always',
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // Push notifications (Capacitor PushNotifications)
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Local notifications (zamanlanmış hatırlatmalar)
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#10b981',
      sound: 'bell.wav',
    },
    // Splash screen
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#10b981',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
    // App icon + name
    App: {
      logLevel: 'DEBUG',
    },
    // Haptic feedback
    Haptics: {},
    // Status bar
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#10b981',
      overlaysWebView: false,
    },
    // Network status (offline detection)
    Network: {
      // otomatik
    },
    // Share
    Share: {},
    // Camera
    Camera: {},
    // Geolocation (harita modülü için)
    Geolocation: {
      // iOS Info.plist: NSLocationWhenInUseUsageDescription
    },
    // Filesystem (CSV dışa aktarma, dosya okuma)
    Filesystem: {},
  },
  server: {
    // Production'da backend URL'i buraya gelecek
    // androidScheme: 'https',
    // url: 'https://app.gnccrm.com',
  },
  //cordova: {},
}

export default config
