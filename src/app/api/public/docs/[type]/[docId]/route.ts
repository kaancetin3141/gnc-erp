import { NextRequest, NextResponse } from 'next/server'
import { renderDocPdf } from '@/lib/pdf/doc-loaders'
import { verifyShareToken } from '@/lib/pdf/share-token'
import type { DocType } from '@/lib/pdf/generate-doc'

// ============================================================
// GET /api/public/docs/[type]/[docId]?t=...&exp=...
// HERKESE AÇIK — auth yok, HMAC imzalı token doğrulaması var.
// WhatsApp/e-posta ile paylaşılan link bu endpoint'e düşer.
// Rate limit: IP başına 30 istek / dakika (basit in-memory Map).
// ============================================================
const VALID_TYPES: DocType[] = ['invoice', 'quote', 'proforma']

// --- basit rate limiter ---
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    // Map büyümesini önle
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
    }
    return true
  }
  entry.count += 1
  return entry.count <= RATE_MAX
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; docId: string }> },
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: 'Çok fazla istek — bir dakika sonra tekrar deneyin' }, { status: 429 })
  }

  const { type, docId } = await params
  if (!VALID_TYPES.includes(type as DocType)) {
    return NextResponse.json({ error: 'Geçersiz belge türü' }, { status: 400 })
  }

  const token = req.nextUrl.searchParams.get('t')
  if (!verifyShareToken(type as DocType, docId, token)) {
    return NextResponse.json({ error: 'Bu bağlantı geçersiz veya süresi dolmuş' }, { status: 403 })
  }

  const rendered = await renderDocPdf(type as DocType, docId)
  if (!rendered) return NextResponse.json({ error: 'Belge bulunamadı' }, { status: 404 })

  const asciiName = rendered.loaded.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')

  return new NextResponse(new Uint8Array(rendered.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rendered.loaded.fileName)}`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
