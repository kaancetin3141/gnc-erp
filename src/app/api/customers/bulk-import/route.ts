import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getSession,
  requirePermission,
  ok,
  err,
  safeJsonParse,
} from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'
import { normalizePhone } from '@/lib/format'

// İçe aktarılan tek satır — frontend tarafından parse edilmiş hali
export interface CustomerImportRow {
  name?: string | null
  sector?: string | null
  segment?: string | null
  ownerId?: string | null
  source?: string | null
  address?: string | null
  city?: string | null
  district?: string | null
  country?: string | null
  lat?: number | null
  lng?: number | null
  phone?: string | null
  email?: string | null
  web?: string | null
  taxNumber?: string | null
  customerType?: string | null
  status?: string | null
  tags?: string[] | null
  // CSV/Excel'den gelen verilerde "true"/"1" gibi dizgiler görülebilir — geniş tip
  kvkkConsent?: boolean | string | null
  annualRevenue?: number | null
  employeeCount?: number | null
}

interface BulkImportBody {
  customers: CustomerImportRow[]
}

interface BulkImportError {
  row: number
  error: string
}

interface BulkImportResponse {
  imported: number
  skipped: number
  errors: BulkImportError[]
}

const VALID_CUSTOMER_TYPES = ['kafe', 'dis_ticaret', 'musteri_hizmetleri', 'musteri']
const VALID_STATUSES = ['aktif', 'pasif', 'potansiyel', 'kaybedildi']
const VALID_SEGMENTS = ['vip', 'kurumsal', 'standart', 'potansiyel']
const BATCH_SIZE = 50

// POST /api/customers/bulk-import
// Müşterileri toplu içe aktarır (CSV/Excel parse edilmiş veriyi alır)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'customers.edit')
  if (permErr) return permErr

  let body: BulkImportBody
  try {
    body = (await req.json()) as BulkImportBody
  } catch {
    return err('Geçersiz JSON gövdesi', 400)
  }

  if (!body || !Array.isArray(body.customers)) {
    return err("'customers' alanı bir dizi olmalı", 400)
  }

  const rows = body.customers
  if (rows.length === 0) {
    return err('İçe aktarılacak müşteri yok', 400)
  }

  const tenantId = user!.tenantId
  const actorId = user!.id
  const errors: BulkImportError[] = []
  const toCreate: Array<Record<string, unknown>> = []
  let skipped = 0

  // Mevcut müşterileri ön belleğe al — duplicate kontrolü için
  // (name+taxNumber veya email eşleşmesi varsa skip)
  const candidateNames = rows
    .map((r) => (r.name ?? '').toString().trim())
    .filter((n) => n.length > 0)
  const candidateTaxNumbers = rows
    .map((r) => (r.taxNumber ?? '').toString().trim())
    .filter((t) => t.length > 0)
  const candidateEmails = rows
    .map((r) => (r.email ?? '').toString().trim().toLowerCase())
    .filter((e) => e.length > 0)

  const existingCustomers = await db.customer.findMany({
    where: {
      tenantId,
      OR: [
        ...(candidateNames.length ? [{ name: { in: candidateNames } }] : []),
        ...(candidateTaxNumbers.length
          ? [{ taxNumber: { in: candidateTaxNumbers } }]
          : []),
        ...(candidateEmails.length ? [{ email: { in: candidateEmails } }] : []),
      ],
    },
    select: { id: true, name: true, taxNumber: true, email: true },
  })

  // Hızlı lookup için setler
  const existingByName = new Set(existingCustomers.map((c) => c.name.trim()))
  const existingByTax = new Set(
    existingCustomers.map((c) => c.taxNumber?.trim() ?? '').filter(Boolean),
  )
  const existingByEmail = new Set(
    existingCustomers
      .map((c) => c.email?.trim().toLowerCase() ?? '')
      .filter(Boolean),
  )

  // Dosya içi duplikatları da yakalamak için bu oturumda kabul edilenleri izle
  const seenInBatch = new Set<string>()

  rows.forEach((raw, idx) => {
    const rowNum = idx + 1 // 1-bazlı
    const name = (raw.name ?? '').toString().trim()
    if (!name) {
      errors.push({ row: rowNum, error: 'Müşteri adı boş' })
      return
    }

    const taxNumber = (raw.taxNumber ?? '').toString().trim() || null
    const email = (raw.email ?? '').toString().trim().toLowerCase() || null

    // Duplicate kontrolü — DB veya bu batch
    let dupKey = ''
    if (taxNumber && taxNumber.length > 0) {
      dupKey = `tax:${taxNumber}`
      if (existingByTax.has(taxNumber) || seenInBatch.has(dupKey)) {
        skipped++
        return
      }
    } else if (email && email.length > 0) {
      dupKey = `email:${email}`
      if (existingByEmail.has(email) || seenInBatch.has(dupKey)) {
        skipped++
        return
      }
    } else {
      // Ne tax ne email varsa name'e göre
      dupKey = `name:${name.toLowerCase()}`
      if (existingByName.has(name) || seenInBatch.has(dupKey)) {
        skipped++
        return
      }
    }
    seenInBatch.add(dupKey)

    // customerType doğrula
    const customerType = VALID_CUSTOMER_TYPES.includes(raw.customerType ?? '')
      ? raw.customerType!
      : 'musteri'

    const status = VALID_STATUSES.includes(raw.status ?? '') ? raw.status! : 'aktif'
    const segment = VALID_SEGMENTS.includes(raw.segment ?? '')
      ? raw.segment!
      : 'standart'
    const sector = (raw.sector ?? '').toString().trim() || 'Diğer'
    const country = (raw.country ?? '').toString().trim() || 'TR'
    const source = (raw.source ?? '').toString().trim() || 'manuel'

    // ownerId: boşsa aktarana atanır
    let ownerId: string | null = null
    if (raw.ownerId && raw.ownerId.toString().trim().length > 0) {
      ownerId = raw.ownerId.toString().trim()
    } else {
      ownerId = actorId
    }

    // Sayısal alanları güvenli dönüştür
    const annualRevenue =
      typeof raw.annualRevenue === 'number' && !Number.isNaN(raw.annualRevenue)
        ? raw.annualRevenue
        : null
    const employeeCount =
      typeof raw.employeeCount === 'number' &&
      !Number.isNaN(raw.employeeCount) &&
      Number.isInteger(raw.employeeCount)
        ? raw.employeeCount
        : null
    const lat =
      typeof raw.lat === 'number' && !Number.isNaN(raw.lat) ? raw.lat : null
    const lng =
      typeof raw.lng === 'number' && !Number.isNaN(raw.lng) ? raw.lng : null

    // KVKK rızası: boolean true + yaygın dizgi karşılıkları kabul edilir
    const kvkkRaw = raw.kvkkConsent
    const kvkkConsent =
      kvkkRaw === true ||
      (typeof kvkkRaw === 'string' &&
        ['true', '1', 'evet', 'yes'].includes(kvkkRaw.trim().toLowerCase()))

    const tagsParsed: string[] = Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === 'string')
      : typeof raw.tags === 'string'
        ? safeJsonParse<string[]>(raw.tags as unknown as string, [])
        : []

    toCreate.push({
      tenantId,
      name,
      sector,
      segment,
      ownerId,
      source,
      address: (raw.address ?? '').toString().trim() || null,
      city: (raw.city ?? '').toString().trim() || null,
      district: (raw.district ?? '').toString().trim() || null,
      country,
      lat,
      lng,
      phone:
        normalizePhone(raw.phone ?? null) ||
        (raw.phone ?? '').toString().trim() ||
        null,
      email: email || null,
      web: (raw.web ?? '').toString().trim() || null,
      taxNumber,
      customerType,
      status,
      tags: JSON.stringify(tagsParsed),
      kvkkConsent,
      kvkkConsentAt: kvkkConsent ? new Date() : null,
      annualRevenue,
      employeeCount,
    })
  })

  if (toCreate.length === 0) {
    return ok<BulkImportResponse>({
      imported: 0,
      skipped,
      errors,
    })
  }

  // Batch'ler halinde transaction ile insert et
  const batches: typeof toCreate[] = []
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    batches.push(toCreate.slice(i, i + BATCH_SIZE))
  }

  let imported = 0
  for (const batch of batches) {
    try {
      await db.$transaction(
        batch.map((data) =>
          db.customer.create({
            data: data as Parameters<typeof db.customer.create>[0]['data'],
          }),
        ),
      )
      imported += batch.length
    } catch {
      // Batch hatası — satırları tek tek dene
      for (const data of batch) {
        try {
          await db.customer.create({
            data: data as Parameters<typeof db.customer.create>[0]['data'],
          })
          imported++
        } catch (e) {
          const rowName = (data as { name: string }).name
          errors.push({
            row: rows.findIndex((r) => (r.name ?? '').toString().trim() === rowName) + 1,
            error: e instanceof Error ? e.message : 'Bilinmeyen hata',
          })
        }
      }
    }
  }

  // Audit log
  await writeAuditLog({
    tenantId,
    actorId,
    action: 'bulk_import',
    entity: 'customer',
    entityId: null,
    after: {
      imported,
      skipped,
      errors: errors.length,
      totalRows: rows.length,
    },
  })

  return ok<BulkImportResponse>({ imported, skipped, errors })
}
