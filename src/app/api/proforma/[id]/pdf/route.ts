import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/api-utils'
import { renderDocPdf } from '@/lib/pdf/doc-loaders'

// ============================================================
// GET /api/proforma/[id]/pdf — proforma PDF'i (gerçek pdfkit üretimi)
// ?download=1 → attachment, aksi halde inline (tarayıcıda önizleme)
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user) return NextResponse.json({ error: 'Oturum açmanız gerekli' }, { status: 401 })

  const { id } = await params
  const rendered = await renderDocPdf('proforma', id)
  if (!rendered) return NextResponse.json({ error: 'Proforma bulunamadı' }, { status: 404 })
  if (rendered.loaded.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Erişim reddedildi' }, { status: 403 })
  }

  const download = req.nextUrl.searchParams.get('download') === '1'
  const asciiName = rendered.loaded.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')

  return new NextResponse(new Uint8Array(rendered.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rendered.loaded.fileName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
