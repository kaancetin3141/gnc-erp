import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — personel listesi
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const staff = await db.staff.findMany({
    where: { providerId: id, isActive: true },
    include: { staffServices: { include: { service: true } } },
    orderBy: { sortOrder: 'asc' },
  })
  return ok(staff)
}

// POST — personel ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { name, title, photo, phone, bio } = body

  if (!name) return err('Personel adı gerekli', 400)

  const staff = await db.staff.create({
    data: { providerId: id, name, title: title || null, photo: photo || null, phone: phone || null, bio: bio || null },
  })
  return ok(staff)
}
