import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { hasPermission } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/auth'

// GET — tenant'ın fatura şablonu
// ÖNEMLİ: Tüm otantik kullanıcılar okuyabilir — PDF önizlemeleri
// (fatura, proforma, teklif, irsaliye, çeki listesi) şablonu uygular.
// Yazma (PUT) yalnızca settings.manage yetkisiyle yapılabilir.
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  let tpl = await db.invoiceTemplate.findUnique({
    where: { tenantId: user!.tenantId },
  })

  // Varsayılan şablon oluştur
  if (!tpl) {
    tpl = await db.invoiceTemplate.create({
      data: {
        tenantId: user!.tenantId,
        companyName: user!.tenant.name,
      },
    })
  }

  // bankInfo parse et
  let bankInfo = null
  if (tpl.bankInfo) {
    try { bankInfo = JSON.parse(tpl.bankInfo) } catch { bankInfo = null }
  }

  return ok({
    id: tpl.id,
    tenantId: tpl.tenantId,
    logoUrl: tpl.logoUrl,
    logoPosition: tpl.logoPosition,
    primaryColor: tpl.primaryColor,
    accentColor: tpl.accentColor,
    textColor: tpl.textColor,
    fontFamily: tpl.fontFamily,
    fontSize: tpl.fontSize,
    headerText: tpl.headerText,
    footerText: tpl.footerText,
    companyName: tpl.companyName,
    companyAddress: tpl.companyAddress,
    companyPhone: tpl.companyPhone,
    companyEmail: tpl.companyEmail,
    companyWeb: tpl.companyWeb,
    taxNumber: tpl.taxNumber,
    taxOffice: tpl.taxOffice,
    showBankInfo: tpl.showBankInfo,
    bankInfo,
    showSignature: tpl.showSignature,
    signatureText: tpl.signatureText,
    pageSize: tpl.pageSize,
    marginMm: tpl.marginMm,
    notes: tpl.notes,
  })
}

// PUT — şablonu güncelle
export async function PUT(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr
  if (!hasPermission(user!, 'settings.manage')) return err('Ayarları yönetme yetkiniz yok', 403)

  const body = await req.json().catch(() => ({}))
  const updateData: Record<string, unknown> = {}

  // Tüm güncellenebilir alanlar
  const fields = [
    'logoUrl', 'logoPosition', 'primaryColor', 'accentColor', 'textColor',
    'fontFamily', 'fontSize', 'headerText', 'footerText',
    'companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'companyWeb',
    'taxNumber', 'taxOffice', 'showBankInfo', 'showSignature', 'signatureText',
    'pageSize', 'marginMm', 'notes',
  ]
  for (const f of fields) {
    if (f in body) updateData[f] = body[f]
  }
  // bankInfo JSON olarak sakla
  if ('bankInfo' in body) {
    updateData.bankInfo = body.bankInfo ? JSON.stringify(body.bankInfo) : null
  }

  // Varsa update, yoksa create (upsert)
  const tpl = await db.invoiceTemplate.upsert({
    where: { tenantId: user!.tenantId },
    create: {
      tenantId: user!.tenantId,
      companyName: user!.tenant.name,
      ...updateData,
    } as never,
    update: updateData as never,
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'settings.update',
    entity: 'invoice_template',
    entityId: tpl.id,
    after: updateData,
  })

  return ok({ id: tpl.id, success: true })
}
