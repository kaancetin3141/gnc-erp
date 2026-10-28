import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit runtime'da fs ile AFM/font verisi okur — bundle'lanmamalı
  serverExternalPackages: ['pdfkit'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  // CRITICAL: sandbox'ta repo /home/z/my-project altında nested duruyor (mini-services).
  // Çoklu lockfile yüzünden Turbopack workspace root'unu YANLIŞ seçiyor (/home/z/my-project)
  // ve tüm kardeş repoları izleyip bellek patlatıyordu (2GB+ compile, OOM).
  // Root'u bu reponun kendi dizinine sabitle.
  turbopack: {
    root: path.resolve(__dirname, "."),
  },
  allowedDevOrigins: [
    "https://preview-chat-a8272c7e-0fe5-478f-90b2-85f12319d1df.space-z.ai",
    "*.space-z.ai",
    "http://127.0.0.1",
    "http://127.0.0.1:3001",
    "http://localhost",
    "http://localhost:3001",
  ],
  // Dev server memory optimizasyonu
  devIndicators: false,
  // Turbopack (Next 16 dev varsayıcısı) bellek tavanı — 4GB sandbox'ta OOM killer'a
  // karşı Rust allocator'ı sınırlar. Gerekirse artırılabilir.
  experimental: {
    // Büyük dosyalar için memory optimize
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-icons'],
    // 512MB: 4GB sandbox'ta 8 servis birlikte çalışıyor — ERP dev'i kompakt tutmak için
    // turbopack belleğini agresif sınırla (cache eviction ↑, RSS ~1.3-1.4GB).
    turbopackMemoryLimit: 512,
  },
};

export default nextConfig;
