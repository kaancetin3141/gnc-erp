import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requirePermission, ok, err } from '@/lib/api-utils'
import { writeAuditLog } from '@/lib/auth'

// SMTP ayarları — TenantSetting(key='smtp') üzerinde saklanır
// Değer: JSON {host, port, secure, user, pass, from}

// GET — mevcut ayarları oku (şifre MASKELENİR, sadece var/yok bilgisi döner)
export async function GET(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'settings.manage')
  if (permErr) return permErr

  const row = await db.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId: user!.tenantId, key: 'smtp' } },
  })
  if (!row?.value) return ok({ configured: false })

  try {
    const raw = JSON.parse(row.value) as Record<string, unknown>
    return ok({
      configured: !!(raw.host && raw.user && raw.pass),
      host: raw.host ?? '',
      port: raw.port ?? 587,
      secure: !!raw.secure,
      user: raw.user ?? '',
      from: raw.from ?? '',
      hasPassword: !!raw.pass,
      updatedAt: row.updatedAt,
    })
  } catch {
    return ok({ configured: false })
  }
}

// POST — ayarları kaydet (şifre boş gelirse mevcut şifre korunur)
export async function POST(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'settings.manage')
  if (permErr) return permErr

  const body = await req.json().catch(() => ({}))
  const host = typeof body.host === 'string' ? body.host.trim() : ''
  const port = Number(body.port) || 587
  const secure = !!body.secure
  const smtpUser = typeof body.user === 'string' ? body.user.trim() : ''
  const pass = typeof body.pass === 'string' ? body.pass : ''
  const from = typeof body.from === 'string' ? body.from.trim() : ''

  if (!host || !smtpUser) {
    return err('Sunucu (host) ve kullanıcı adı zorunludur', 400)
  }

  const existing = await db.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId: user!.tenantId, key: 'smtp' } },
  })
  let existingPass = ''
  if (existing?.value) {
    try {
      existingPass = String(JSON.parse(existing.value).pass ?? '')
    } catch {
      existingPass = ''
    }
  }
  const finalPass = pass || existingPass
  if (!finalPass) {
    return err('Şifre gerekli (mevcut şifre kayıtlı değilse yeniden girmeniz gerekir)', 400)
  }

  const value = JSON.stringify({
    host, port, secure,
    user: smtpUser,
    pass: finalPass,
    ...(from ? { from } : {}),
  })

  await db.tenantSetting.upsert({
    where: { tenantId_key: { tenantId: user!.tenantId, key: 'smtp' } },
    create: { tenantId: user!.tenantId, key: 'smtp', value },
    update: { value },
  })

  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'update',
    entity: 'setting_smtp',
    entityId: 'smtp',
    after: { host, port, secure, user: smtpUser },
  })

  return ok({ success: true, message: 'SMTP ayarları kaydedildi' })
}

// DELETE — SMTP ayarlarını kaldır (mailto fallback'e dön)
export async function DELETE(req: NextRequest) {
  const user = await getSession(req)
  const permErr = requirePermission(user, 'settings.manage')
  if (permErr) return permErr

  await db.tenantSetting.deleteMany({
    where: { tenantId: user!.tenantId, key: 'smtp' },
  })
  await writeAuditLog({
    tenantId: user!.tenantId,
    actorId: user!.id,
    action: 'delete',
    entity: 'setting_smtp',
    entityId: 'smtp',
  })
  return ok({ success: true, message: 'SMTP ayarları kaldırıldı' })
}
