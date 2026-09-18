import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ServiceWorkerProvider } from "@/components/providers/sw-provider";
import { InstallPromptProvider } from "@/components/providers/install-prompt-provider";
import { ErrorBoundary } from "@/components/providers/error-boundary";
import { AiAssistantWidget } from "@/components/ai/ai-assistant-widget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gnc-crm.app"),
  title: {
    default: "GNC CRM — Satış Süperapp",
    template: "%s · GNC CRM",
  },
  description:
    "KOBİ satış ekipleri için CRM + ERP + Sosyal Medya süperapp. Müşteri portföyü, potansiyel müşteri madenciliği, pipeline, kafe, market, site yönetimi, randevu ve sosyal medya — hepsi tek platformda.",
  keywords: [
    "CRM", "ERP", "satış", "KOBİ", "müşteri yönetimi", "pipeline",
    "kafe yönetimi", "market yönetimi", "site yönetimi", "randevu",
    "sosyal medya", "WhatsApp", "fatura", "teklif", "stok",
  ],
  authors: [{ name: "GNC CRM" }],
  creator: "GNC CRM",
  publisher: "GNC CRM",
  applicationName: "GNC CRM",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "GNC CRM",
    statusBarStyle: "default",
    startupImage: [
      { url: "/icons/icon-512.png", media: "(device-width: 320px)" },
    ],
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    type: "website",
    siteName: "GNC CRM",
    title: "GNC CRM — Satış Süperapp",
    description: "KOBİ için CRM + ERP + Sosyal Medya — tek platformda",
    url: "https://gnc-crm.app",
    images: [{ url: "/icons/og-image.png", width: 1200, height: 630, alt: "GNC CRM" }],
    locale: "tr_TR",
  },
  twitter: {
    card: "summary_large_image",
    title: "GNC CRM — Satış Süperapp",
    description: "KOBİ için CRM + ERP + Sosyal Medya — tek platformda",
    images: ["/icons/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: no-preference)", color: "#10b981" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        {/* PWA — Microsoft / Edge tile renkleri */}
        <meta name="msapplication-TileColor" content="#10b981" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="application-name" content="GNC CRM" />
        {/* iOS — durum çubuğu */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="GNC CRM" />
        {/* iOS — splash screen */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="1024x1024" href="/icons/icon-512.png" />
        {/* Favicon varyasyonları */}
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="mask-icon" href="/icon.svg" color="#10b981" />
        <link rel="shortcut icon" href="/favicon.ico" />
        {/* iOS — Safe area padding desteği */}
        <style dangerouslySetInnerHTML={{ __html: `
          html { -webkit-text-size-adjust: 100%; }
          body { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
          @media (display-mode: standalone) {
            body { user-select: none; -webkit-user-select: none; }
            input, textarea, [contenteditable] { user-select: text; -webkit-user-select: text; }
          }
        ` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground overscroll-none`}
      >
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <ServiceWorkerProvider>
                <InstallPromptProvider>
                  {children}
                  <AiAssistantWidget />
                  <Toaster />
                  <SonnerToaster position="top-right" richColors />
                </InstallPromptProvider>
              </ServiceWorkerProvider>
            </QueryProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
