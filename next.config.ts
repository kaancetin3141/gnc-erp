import type { NextConfig } from "next";

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
  allowedDevOrigins: [
    "https://preview-chat-a8272c7e-0fe5-478f-90b2-85f12319d1df.space-z.ai",
    "*.space-z.ai",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://localhost",
    "http://localhost:3000",
  ],
  // Turbopack yerine webpack kullan (daha az bellek)
  // --turbo flag yoksa webpack kullanılır
  experimental: {
    // Büyük dosyalar için memory optimize
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-icons'],
  },
  // Dev server memory optimizasyonu
  devIndicators: false,
};

export default nextConfig;
