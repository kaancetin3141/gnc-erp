import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — personel listesi
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const staff = await db.siteStaff.findMany({ where: { siteId: id }, orderBy: { name: 'asc' } })
  return ok(staff)
}

// POST — personel ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { name, role, phone, photo, salary, startDate, notes } = body
  if (!name) return err('Personel adı gerekli', 400)

  const staff = await db.siteStaff.create({
    data: {
      siteId: id,
      name,
      role: role || 'kapici',
      phone: phone || null,
      photo: photo || null,
      salary: salary ? parseFloat(salary) : null,
      startDate: startDate ? new Date(startDate) : null,
      notes: notes || null,
    },
  })
  return ok(staff)
}
