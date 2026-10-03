// ============================================================
// Belge yükleyici — invoice / quote / proforma kaydını Prisma'dan
// çekip generateDocPdf'in beklediği DocPdfData şekline çevirir.
// Tenant sahiplik kontrolü ÇAĞIRAN route'ta yapılır (auth'lu) veya
// token doğrulamasıyla (public route).
// ============================================================

import { db } from '@/lib/db'
import { generateDocPdf, type DocPdfData, type DocType, type DocPdfLine } from './generate-doc'

export interface LoadedDoc {
  tenantId: string
  customerId: string
  number: string
  fileName: string
  data: DocPdfData
}

function toLines(raw: {
  description: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
}[]): DocPdfLine[] {
  return raw.map((l) => ({
    description: l.description,
    qty: l.qty,
    unitPrice: l.unitPrice,
    taxRate: l.taxRate,
    lineTotal: l.lineTotal,
  }))
}

function docFileName(type: DocType, number: string): string {
  // Numaralar zaten FAT-/TKL-/PRO- önekli — dosya adı doğrudan numaradır
  void type
  return `${number}.pdf`
}

export async function loadDoc(type: DocType, docId: string): Promise<LoadedDoc | null> {
  if (type === 'invoice') {
    const inv = await db.invoice.findUnique({
      where: { id: docId },
      include: {
        customer: {
          select: {
            id: true, name: true, address: true, city: true,
            phone: true, email: true, taxNumber: true,
          },
        },
        lines: true,
        tenant: { select: { name: true } },
      },
    })
    if (!inv) return null

    const tpl = await db.invoiceTemplate.findUnique({ where: { tenantId: inv.tenantId } })

    return {
      tenantId: inv.tenantId,
      customerId: inv.customerId,
      number: inv.number,
      fileName: docFileName(type, inv.number),
      data: {
        type,
        number: inv.number,
        status: inv.status,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        subtotal: inv.subtotal,
        taxTotal: inv.taxTotal,
        total: inv.total,
        customer: inv.customer,
        lines: toLines(inv.lines),
        company: {
          name: inv.tenant.name,
          legalName: tpl?.companyName ?? null,
          address: tpl?.companyAddress ?? null,
          phone: tpl?.companyPhone ?? null,
          email: tpl?.companyEmail ?? null,
          web: tpl?.companyWeb ?? null,
          taxNumber: tpl?.taxNumber ?? null,
          taxOffice: tpl?.taxOffice ?? null,
        },
        footerNote: tpl?.footerText ?? null,
      },
    }
  }

  // quote / proforma — Quote tablosu
  const q = await db.quote.findUnique({
    where: { id: docId },
    include: {
      customer: {
        select: {
          id: true, name: true, address: true, city: true,
          phone: true, email: true, taxNumber: true,
        },
      },
      lines: true,
      tenant: { select: { name: true } },
    },
  })
  if (!q) return null
  if (type === 'proforma' && !q.isProforma) return null

  const tpl = await db.invoiceTemplate.findUnique({ where: { tenantId: q.tenantId } })

  return {
    tenantId: q.tenantId,
    customerId: q.customerId,
    number: q.number,
    fileName: docFileName(type, q.number),
    data: {
      type,
      number: q.number,
      status: q.status,
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      currency: q.currency,
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      total: q.total,
      customer: q.customer,
      lines: toLines(q.lines),
      company: {
        name: q.tenant.name,
        legalName: tpl?.companyName ?? null,
        address: tpl?.companyAddress ?? null,
        phone: tpl?.companyPhone ?? null,
        email: tpl?.companyEmail ?? null,
        web: tpl?.companyWeb ?? null,
        taxNumber: tpl?.taxNumber ?? null,
        taxOffice: tpl?.taxOffice ?? null,
      },
      footerNote: tpl?.footerText ?? null,
    },
  }
}

export async function renderDocPdf(type: DocType, docId: string, shareUrl?: string | null): Promise<{
  buffer: Buffer
  loaded: LoadedDoc
} | null> {
  const loaded = await loadDoc(type, docId)
  if (!loaded) return null
  const buffer = await generateDocPdf({ ...loaded.data, shareUrl: shareUrl ?? loaded.data.shareUrl ?? null })
  return { buffer, loaded }
}
