// Generate PWA icons from public/icon.svg
// Run: bun run scripts/generate-icons.ts
import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PUBLIC = path.join(ROOT, 'public')
const ICONS_DIR = path.join(PUBLIC, 'icons')
const SVG_PATH = path.join(PUBLIC, 'icon.svg')

const ICONS = [
  { name: 'icon-192.png', size: 192, type: 'regular' },
  { name: 'icon-256.png', size: 256, type: 'regular' },
  { name: 'icon-512.png', size: 512, type: 'regular' },
  { name: 'icon-192-maskable.png', size: 192, type: 'maskable' },
  { name: 'icon-512-maskable.png', size: 512, type: 'maskable' },
  { name: 'apple-touch-icon.png', size: 180, type: 'apple' },
  { name: 'favicon-32.png', size: 32, type: 'regular' },
  { name: 'favicon-16.png', size: 16, type: 'regular' },
  { name: 'og-image.png', size: 1200, type: 'og' },
]

async function generateMaskableIcon(svgBuffer: Buffer, size: number) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#0d9488"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size*0.32}" fill="white" opacity="0.95"/>
    <text x="${size/2}" y="${size/2 + size*0.13}" font-family="Arial, sans-serif" font-size="${size*0.42}" font-weight="900" text-anchor="middle" fill="#0d9488">G</text>
  </svg>`
  return await sharp(Buffer.from(svg)).png().toBuffer()
}

async function generateAppleIcon(svgBuffer: Buffer, size: number) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#0d9488"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <text x="${size/2}" y="${size/2 + size*0.2}" font-family="Arial Black, sans-serif" font-size="${size*0.65}" font-weight="900" text-anchor="middle" fill="white">G</text>
  </svg>`
  return await sharp(Buffer.from(svg)).png().toBuffer()
}

async function generateRegularIcon(svgBuffer: Buffer, size: number) {
  return await sharp(svgBuffer).resize(size, size).png().toBuffer()
}

async function generateOgImage() {
  const width = 1200
  const height = 630
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#0f766e"/>
      </linearGradient>
      <linearGradient id="iconGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#0d9488"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect x="80" y="${height/2 - 100}" width="200" height="200" rx="44" fill="url(#iconGrad)"/>
    <text x="180" y="${height/2 + 60}" font-family="Arial Black, sans-serif" font-size="160" font-weight="900" text-anchor="middle" fill="white">G</text>
    <text x="320" y="${height/2 - 30}" font-family="Arial, sans-serif" font-size="72" font-weight="900" fill="white">GNC CRM</text>
    <text x="320" y="${height/2 + 30}" font-family="Arial, sans-serif" font-size="32" fill="#94a3b8">Satış Süperapp — CRM + ERP + Sosyal</text>
    <text x="320" y="${height/2 + 80}" font-family="Arial, sans-serif" font-size="24" fill="#10b981">Müşteri · Pipeline · Stok · Kafe · Market · Site · Randevu</text>
  </svg>`
  return await sharp(Buffer.from(svg)).png().toBuffer()
}

async function main() {
  if (!existsSync(SVG_PATH)) {
    console.error('public/icon.svg bulunamadı')
    process.exit(1)
  }
  if (!existsSync(ICONS_DIR)) await mkdir(ICONS_DIR, { recursive: true })

  const svgBuffer = await readFile(SVG_PATH)
  console.log('Ikonlar uretiliyor...')

  for (const icon of ICONS) {
    let buffer: Buffer
    if (icon.type === 'maskable') buffer = await generateMaskableIcon(svgBuffer, icon.size)
    else if (icon.type === 'apple') buffer = await generateAppleIcon(svgBuffer, icon.size)
    else if (icon.type === 'og') buffer = await generateOgImage()
    else buffer = await generateRegularIcon(svgBuffer, icon.size)
    const outPath = path.join(ICONS_DIR, icon.name)
    await writeFile(outPath, buffer)
    console.log(`  + ${icon.name} (${buffer.length} bytes)`)
  }

  // favicon.ico (32x32 PNG)
  const favBuffer = await sharp(svgBuffer).resize(32, 32).png().toBuffer()
  await writeFile(path.join(PUBLIC, 'favicon.ico'), favBuffer)
  console.log('  + favicon.ico')

  // apple-touch-icon root (iOS Safari burada arar)
  const appleBuffer = await generateAppleIcon(svgBuffer, 180)
  await writeFile(path.join(PUBLIC, 'apple-touch-icon.png'), appleBuffer)
  console.log('  + apple-touch-icon.png (root)')

  console.log('Tum ikonlar uretildi: public/icons/')
}

main().catch((e) => { console.error(e); process.exit(1) })
