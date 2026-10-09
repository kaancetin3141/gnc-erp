import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET — list attachments for a customer
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const attachments = await db.attachment.findMany({
    where: { customerId: id },
    orderBy: { createdAt: 'desc' },
  })
  return ok(attachments)
}

// POST — upload attachment metadata (file content handled client-side as base64 or URL)
// In production this would use Supabase Storage; here we store metadata + a data URL
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer || customer.tenantId !== user!.tenantId && user!.role !== 'superadmin') return err('Müşteri bulunamadı', 404)

  const body = await req.json()
  const { fileName, fileType, fileSize, url } = body

  if (!fileName || !url) return err('Dosya adı ve içeriği gerekli', 400)

  // Limit: reject if data URL too large (>5MB base64 ~6.7M chars)
  if (url.length > 6_700_000) return err('Dosya çok büyük (maks 5MB)', 413)

  const attachment = await db.attachment.create({
    data: {
      customerId: id,
      fileName,
      fileType: fileType || 'application/octet-stream',
      fileSize: fileSize || 0,
      url,
      uploadedBy: user!.id,
    },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'create',
    entity: 'attachment',
    entityId: attachment.id,
    after: attachment,
  })

  return ok(attachment)
}
