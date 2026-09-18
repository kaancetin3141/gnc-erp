import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSession, requireAuth, ok, err } from '@/lib/api-utils'

// GET — hizmet listesi
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const services = await db.service.findMany({
    where: { providerId: id, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  return ok(services)
}

// POST — hizmet ekle
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req)
  const authErr = requireAuth(user)
  if (authErr) return authErr

  const { id } = await params
  const body = await req.json()
  const { name, description, duration, price, category, photo } = body

  if (!name) return err('Hizmet adı gerekli', 400)

  const service = await db.service.create({
    data: {
      providerId: id,
      name,
      description: description || null,
      duration: parseInt(duration) || 30,
      price: parseFloat(price) || 0,
      category: category || null,
      photo: photo || null,
    },
  })
  return ok(service)
}
