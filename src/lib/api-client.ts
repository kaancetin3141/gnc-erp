// Frontend API client — session header otomatik ekler

import { useAppStore } from '@/store/app-store'

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

function getHeaders(): HeadersInit {
  const sessionId = useAppStore.getState().sessionId
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (sessionId) {
    headers['x-gnc-session'] = sessionId
  }
  return headers
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: getHeaders() })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.error || 'İstek başarısız', res.status, data.details)
  return data as T
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: getHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.error || 'İstek başarısız', res.status, data.details)
  return data as T
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.error || 'İstek başarısız', res.status, data.details)
  return data as T
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.error || 'İstek başarısız', res.status, data.details)
  return data as T
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE', headers: getHeaders() })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.error || 'İstek başarısız', res.status, data.details)
  return data as T
}

// React Query keys
export const qk = {
  customers: (params?: Record<string, string>) => ['customers', params] as const,
  customer: (id: string) => ['customer', id] as const,
  leads: (params?: Record<string, string>) => ['leads', params] as const,
  deals: (params?: Record<string, string>) => ['deals', params] as const,
  tasks: (params?: Record<string, string>) => ['tasks', params] as const,
  users: ['users'] as const,
  dashboard: ['dashboard'] as const,
  reports: (range?: string) => ['reports', range ?? '6m'] as const,
  mapsSearches: ['maps-searches'] as const,
  templates: (params?: Record<string, string>) => ['templates', params] as const,
}
