import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// GET /api/settings — tüm tenant ayarları (key-value)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const settings = await db.tenantSetting.findMany({
    where: { tenantId: user!.tenantId },
    select: { key: true, value: true, updatedAt: true },
  })

  // Defaults
  const defaults: Record<string, string> = {
    'automation.enabled': 'true',
    'automation.thresholdDays': '30',
    'notification.email': 'true',
    'notification.inApp': 'true',
    'notification.staleCustomerAlert': 'true',
    'notification.taskReminder': 'true',
  }

  const result: Record<string, string> = { ...defaults }
  for (const s of settings) {
    result[s.key] = s.value
  }

  return ok(result)
}

// PATCH /api/settings — ayar güncelle (body: { key, value })
export async function PATCH(req: NextRequest) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const body = await req.json()
  const { key, value } = body as { key?: string; value?: string }

  if (!key || value === undefined) return err('key ve value gerekli', 400)

  // Izin verilen anahtarlar
  const allowedKeys = [
    'automation.enabled',
    'automation.thresholdDays',
    'notification.email',
    'notification.inApp',
    'notification.staleCustomerAlert',
    'notification.taskReminder',
    'notification.taskReminderHours',
  ]
  if (!allowedKeys.includes(key)) return err('Geçersiz ayar anahtarı', 400)

  const existing = await db.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId: user!.tenantId, key } },
  })

  const setting = await db.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: user!.tenantId, key } },
    create: { tenantId: user!.tenantId, key, value: String(value) },
    update: { value: String(value) },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'setting',
    entityId: setting.id,
    before: existing ? { key, value: existing.value } : null,
    after: { key, value: setting.value },
  })

  return ok({ key: setting.key, value: setting.value })
}
