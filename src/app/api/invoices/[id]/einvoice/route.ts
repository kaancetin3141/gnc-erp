import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/api-utils'
import { loadDoc } from '@/lib/pdf/doc-loaders'
import { buildEarsivUblXml, efaturaWarnings, type EfaturaInvoice } from '@/lib/efatura'

// ============================================================
// GET /api/invoices/[id]/einvoice — GİB UBL-TR 1.2 e-Arşiv fatura XML'i
// Faturayı EARSIVFATURA profilinde UBL 1.2 XML olarak indirir
// (GİB e-Arşiv portalına veya entegratöre yüklenebilir formatta).
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  if (!user) return NextResponse.json({ error: 'Oturum açmanız gerekli' }, { status: 401 })

  const { id } = await params
  const loaded = await loadDoc('invoice', id)
  if (!loaded) return NextResponse.json({ error: 'Fatura bulunamadı' }, { status: 404 })
  if (loaded.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Erişim reddedildi' }, { status: 403 })
  }

  const d = loaded.data
  const efatura: EfaturaInvoice = {
    number: d.number,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    currency: d.currency,
    subtotal: d.subtotal,
    taxTotal: d.taxTotal,
    total: d.total,
    customer: {
      name: d.customer.name,
      address: d.customer.address,
      city: d.customer.city,
      taxNumber: d.customer.taxNumber,
      phone: d.customer.phone,
      email: d.customer.email,
    },
    company: {
      name: d.company.name,
      legalName: d.company.legalName,
      address: d.company.address,
      taxNumber: d.company.taxNumber,
      taxOffice: d.company.taxOffice,
      phone: d.company.phone,
      email: d.company.email,
    },
    lines: d.lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      lineTotal: l.lineTotal,
    })),
  }

  const xml = buildEarsivUblXml(efatura)
  const warnings = efaturaWarnings(efatura)

  const fileName = `${loaded.number}_earsiv_ubl.xml`
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      // VKN/TCKN eksikse istemci toast ile uyarabilir
      ...(warnings.length > 0 ? { 'X-Efatura-Warn': encodeURIComponent(warnings.join(' | ')) } : {}),
      'Cache-Control': 'private, no-store',
    },
  })
}
