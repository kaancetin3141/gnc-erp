import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { buildSharePath } from '@/lib/pdf/share-token'
import { loadDoc } from '@/lib/pdf/doc-loaders'
import type { DocType } from '@/lib/pdf/generate-doc'

// ============================================================
// POST /api/documents/share-link
// Body: { docType: 'invoice'|'quote'|'proforma', docId: string, days?: number }
// → { url, path, expiresAt }
// Stateless HMAC token ile herkese açık görüntüleme bağlantısı üretir.
// ============================================================
const VALID_TYPES: DocType[] = ['invoice', 'quote', 'proforma']

export async function POST(req: NextRequest) {
  const user = await getSession(req)
  if (!user) return NextResponse.json({ error: 'Oturum açmanız gerekli' }, { status: 401 })

  let body: { docType?: string; docId?: string; days?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
  }

  const docType = body.docType as DocType
  const docId = body.docId
  if (!docType || !VALID_TYPES.includes(docType)) {
    return NextResponse.json({ error: "docType 'invoice', 'quote' veya 'proforma' olmalı" }, { status: 400 })
  }
  if (!docId || typeof docId !== 'string') {
    return NextResponse.json({ error: 'docId zorunlu' }, { status: 400 })
  }

  const loaded = await loadDoc(docType, docId)
  if (!loaded) return NextResponse.json({ error: 'Belge bulunamadı' }, { status: 404 })
  if (loaded.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Erişim reddedildi' }, { status: 403 })
  }

  const days = Number.isFinite(body.days) && (body.days as number) > 0 && (body.days as number) <= 365
    ? Math.floor(body.days as number)
    : undefined
  const { path, expiresAt } = buildSharePath(docType, docId, days)

  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'create',
    entity: 'document_share_link',
    entityId: docId,
    after: { docType, docId, expiresAt },
  })

  return NextResponse.json({ docType, docId, number: loaded.number, path, url: path, expiresAt })
}
