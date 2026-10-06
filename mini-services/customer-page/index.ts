/**
 * GNC Randevu — Müşteri Sitesi mini-servisi
 * Port: 3002 (hardcode — gateway kuralı, env okunmaz)
 *
 * - Ana uygulamadan (http://localhost:3000) SERVER-SIDE fetch ile veri çeker
 * - Tarayıcıya sadece kendi same-origin /api/* uçlarını açar (CORS yok)
 * - 60 sn memory-cache (işletme listesi), 10 sn (slotlar), 60 sn (detay)
 * - BASE_DOMAIN env tanımlıysa {slug}.BASE_DOMAIN Host başlığıyla alt alan adı desteği
 * - Build adımı yok: HTML/CSS/JS views.ts içinde template string olarak gömülü
 */

import {
  STYLE_CSS,
  HOME_JS,
  DETAIL_JS,
  homePage,
  detailPage,
  notFoundPage,
  serverErrorPage,
  type Json,
} from './views.ts';

const PORT = 3002;
const UPSTREAM = 'http://localhost:3000';
// Alt alan adı anahtarı: örn. BASE_DOMAIN=randevu.example.com → sik-kuafor.randevu.example.com
const BASE_DOMAIN = (process.env.BASE_DOMAIN || '').trim().toLowerCase();

// ---------------------------------------------------------------- bellek cache

type Entry = { expires: number; data: Json };
const mem = new Map<string, Entry>();

function cacheGet(key: string): Json | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    mem.delete(key);
    return null;
  }
  return e.data;
}

function cacheSet(key: string, data: Json, ttlMs: number) {
  mem.set(key, { expires: Date.now() + ttlMs, data });
  if (mem.size > 200) {
    const now = Date.now();
    for (const [k, v] of mem) if (now > v.expires) mem.delete(k);
  }
}

// ---------------------------------------------------------------- upstream

class UpstreamError extends Error {}

async function upstream(path: string, init?: RequestInit & { timeoutMs?: number }) {
  const timeoutMs = init?.timeoutMs ?? 8000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(UPSTREAM + path, {
      ...init,
      signal: ctrl.signal,
      headers: { accept: 'application/json', ...(init?.headers || {}) },
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: null as any };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- normalizasyon + filtre

function normBiz(it: Json): Json {
  return {
    id: it.id ?? '',
    slug: it.slug ?? '',
    name: it.name ?? '',
    type: it.type ?? '',
    address: it.address ?? '',
    city: it.city ?? '',
    district: it.district ?? '',
    photo: it.photo ?? null,
    phone: it.phone ?? '',
    email: it.email ?? '',
    lat: typeof it.lat === 'number' && !isNaN(it.lat) ? it.lat : it.lat != null && !isNaN(Number(it.lat)) ? Number(it.lat) : null,
    lng: typeof it.lng === 'number' && !isNaN(it.lng) ? it.lng : it.lng != null && !isNaN(Number(it.lng)) ? Number(it.lng) : null,
    workingHours: it.workingHours && typeof it.workingHours === 'object' ? it.workingHours : {},
    services: Array.isArray(it.services) ? it.services : [],
  };
}

const trLower = (s: unknown) => String(s ?? '').toLocaleLowerCase('tr');

function filterBiz(items: Json[], q: string, type: string, city: string): Json[] {
  const nq = trLower(q.trim());
  return items.filter((b) => {
    if (type && b.type !== type) return false;
    if (city && b.city !== city) return false;
    if (nq) {
      const svcNames = (b.services as Json[]).map((s) => trLower(s.name)).join(' ');
      const hay = trLower([b.name, b.address, b.district, b.city].join(' ') + ' ' + svcNames);
      if (!hay.includes(nq)) return false;
    }
    return true;
  });
}

async function getBusinesses(): Promise<Json[]> {
  const hit = cacheGet('businesses');
  if (hit && Array.isArray(hit.items)) return hit.items;
  const r = await upstream('/api/public/providers');
  if (!r.ok || !r.data || !Array.isArray(r.data.items)) {
    throw new UpstreamError('İşletme listesi şu anda alınamıyor — ana uygulama yanıt vermiyor olabilir. Birkaç saniye sonra tekrar dene.');
  }
  const items = (r.data.items as Json[]).map(normBiz);
  cacheSet('businesses', { items }, 60_000);
  return items;
}

// ---------------------------------------------------------------- yanıtlar

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const htmlRes = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

const assetRes = (body: string, type: string) =>
  new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'public, max-age=300' } });

// ---- Leaflet (self-hosted; startup'ta diske okunur)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const LEAFLET_DIR = join(import.meta.dir, 'assets', 'leaflet');
const LEAFLET_FILES: Record<string, { data: string | Uint8Array; type: string }> = {};
try {
  LEAFLET_FILES['/assets/leaflet/leaflet.js'] = { data: readFileSync(join(LEAFLET_DIR, 'leaflet.js'), 'utf8'), type: 'text/javascript' };
  LEAFLET_FILES['/assets/leaflet/leaflet.css'] = { data: readFileSync(join(LEAFLET_DIR, 'leaflet.css'), 'utf8'), type: 'text/css' };
  LEAFLET_FILES['/assets/leaflet/images/marker-icon.png'] = { data: new Uint8Array(readFileSync(join(LEAFLET_DIR, 'images', 'marker-icon.png'))), type: 'image/png' };
  LEAFLET_FILES['/assets/leaflet/images/marker-icon-2x.png'] = { data: new Uint8Array(readFileSync(join(LEAFLET_DIR, 'images', 'marker-icon-2x.png'))), type: 'image/png' };
  LEAFLET_FILES['/assets/leaflet/images/marker-shadow.png'] = { data: new Uint8Array(readFileSync(join(LEAFLET_DIR, 'images', 'marker-shadow.png'))), type: 'image/png' };
} catch (e) {
  console.error('[customer-page] Leaflet varlıkları okunamadı — harita devre dışı:', (e as Error).message);
}
const leafletRes = (f: { data: string | Uint8Array; type: string }) =>
  new Response(f.data as BodyInit, { headers: { 'content-type': `${f.type}; charset=utf-8`, 'cache-control': 'public, max-age=86400' } });

// ---------------------------------------------------------------- sayfa render

async function renderDetail(slug: string, subdomain: boolean, gwPort?: string | null): Promise<{ body: string; status: number }> {
  const r = await upstream(`/api/public/providers/${encodeURIComponent(slug)}`);
  if (r.status === 404) return { body: notFoundPage(slug, gwPort), status: 404 };
  if (!r.ok || !r.data || !r.data.provider) {
    throw new UpstreamError('İşletme bilgileri şu anda alınamıyor — ana uygulama yanıt vermiyor olabilir.');
  }
  const services: Json[] = Array.isArray(r.data.services) ? r.data.services : [];
  const provider = normBiz({ ...r.data.provider, services });
  // Gateway modunda ana sayfa bağlantısına param ekle (CRM'e düşmesin)
  const homeUrl = subdomain && BASE_DOMAIN ? `https://${BASE_DOMAIN}` : gwq('/')
  return { body: detailPage({ provider, services, homeUrl, gwPort }), status: 200 };

  function gwq(p: string) {
    return gwPort ? p + (p.indexOf('?') === -1 ? '?' : '&') + 'XTransformPort=' + encodeURIComponent(gwPort) : p;
  }
}

// ---------------------------------------------------------------- sunucu

Bun.serve({
  port: PORT,
  idleTimeout: 30,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : '/';
    const method = req.method.toUpperCase();

    // Host başlığı → alt alan adı tespiti ({slug}.{BASE_DOMAIN})
    const host = (req.headers.get('host') || '').split(':')[0].trim().toLowerCase().replace(/\.$/, '');
    let subSlug: string | null = null;
    if (BASE_DOMAIN && host.length > BASE_DOMAIN.length + 1 && host.endsWith('.' + BASE_DOMAIN)) {
      const s = host.slice(0, host.length - BASE_DOMAIN.length - 1);
      if (s && !s.includes('.')) subSlug = s;
    }

    try {
      // Gateway modu tespiti: önizleme paneli ?XTransformPort ile açar;
      // bu durumda göreli varlık/API URL'lerine aynı paramı ekleriz.
      const gwPort = url.searchParams.get('XTransformPort');

      // --- sağlık kontrolü
      if (path === '/healthz') return json({ ok: true, service: 'customer-page', port: PORT, subdomainMode: !!subSlug });

      // --- alt alan adı kökü: {slug}.BASE_DOMAIN/ → o işletmenin detay sayfası
      if (subSlug && path === '/') {
        const page = await renderDetail(subSlug, true, gwPort);
        return htmlRes(page.body, page.status);
      }

      // --- API: işletme listesi (60 sn cache + filtre)
      if (path === '/api/businesses' && method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const type = url.searchParams.get('type') || '';
        const city = url.searchParams.get('city') || '';
        const all = await getBusinesses();
        const items = filterBiz(all, q, type, city);
        const cities = [...new Set(all.map((b) => String(b.city || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
        return json({ items, cities, total: items.length });
      }

      // --- API: işletme detayı
      const mBiz = path.match(/^\/api\/businesses\/([^/]+)$/);
      if (mBiz && method === 'GET') {
        const slug = safeDecode(mBiz[1]);
        const key = `detail:${slug}`;
        const hit = cacheGet(key);
        if (hit) return json(hit);
        const r = await upstream(`/api/public/providers/${encodeURIComponent(slug)}`);
        if (r.status === 404) return json({ error: 'Bu adda bir işletme bulamadık.' }, 404);
        if (!r.ok || !r.data || !r.data.provider) return json({ error: 'İşletme detayı şu anda alınamıyor. Birazdan tekrar dene.' }, 502);
        const services: Json[] = Array.isArray(r.data.services) ? r.data.services : [];
        const out = { provider: normBiz({ ...r.data.provider, services }), services };
        cacheSet(key, out, 60_000);
        return json(out);
      }

      // --- API: uygun saatler
      const mSlots = path.match(/^\/api\/businesses\/([^/]+)\/slots$/);
      if (mSlots && method === 'GET') {
        const slug = safeDecode(mSlots[1]);
        const date = url.searchParams.get('date') || '';
        const serviceId = url.searchParams.get('serviceId') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Geçerli bir tarih gerekli (YYYY-MM-DD).' }, 400);
        if (!serviceId) return json({ error: 'Hizmet (serviceId) gerekli.' }, 400);
        const key = `slots:${slug}:${date}:${serviceId}`;
        const hit = cacheGet(key);
        if (hit) return json(hit);
        const r = await upstream(
          `/api/public/providers/${encodeURIComponent(slug)}/availability?date=${encodeURIComponent(date)}&serviceId=${encodeURIComponent(serviceId)}`
        );
        if (r.status === 404) return json({ error: 'İşletme bulunamadı.' }, 404);
        if (!r.ok || !r.data) return json({ error: 'Uygun saatler şu anda alınamıyor. Birazdan tekrar dene.' }, 502);
        const out = {
          date,
          serviceId,
          workingHours: r.data.workingHours ?? null,
          slots: Array.isArray(r.data.slots) ? r.data.slots : [],
        };
        cacheSet(key, out, 10_000);
        return json(out);
      }

      // --- API: randevu oluştur (upstream'e ilet)
      if (path === '/api/book') {
        if (method !== 'POST') return json({ success: false, error: 'Bu uç için POST kullan.' }, 405);
        let body: Json;
        try {
          body = (await req.json()) as Json;
        } catch {
          return json({ success: false, error: 'İstek gövdesi okunamadı.' }, 400);
        }
        const required: Array<keyof Json> = ['providerSlug', 'serviceId', 'date', 'time', 'customerName', 'customerPhone'];
        const missing = required.filter((k) => !body[k] || typeof body[k] !== 'string' || !String(body[k]).trim());
        if (missing.length) {
          return json({ success: false, error: 'Lütfen hizmet, tarih, saat, ad ve telefon bilgilerini eksiksiz doldur.' }, 400);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) {
          return json({ success: false, error: 'Tarih biçimi geçersiz.' }, 400);
        }
        const r = await upstream('/api/public/appointments', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          timeoutMs: 12000,
        });
        if (r.ok && r.data) return json({ success: true, data: r.data });
        if (r.data && typeof r.data.error === 'string') {
          const status = [400, 401, 403, 404, 409, 422].includes(r.status) ? r.status : 400;
          return json({ success: false, error: r.data.error }, status);
        }
        return json({ success: false, error: 'Randevu servisi şu anda yanıt vermiyor. Lütfen birkaç saniye sonra tekrar dene.' }, 502);
      }

      // --- sayfalar
      if (path === '/' && method === 'GET') return htmlRes(homePage(BASE_DOMAIN, gwPort));

      const mDetail = path.match(/^\/isletme\/([^/]+)$/);
      if (mDetail && method === 'GET') {
        const slug = safeDecode(mDetail[1]);
        const page = await renderDetail(slug, false, gwPort);
        return htmlRes(page.body, page.status);
      }

      // --- gömülü varlıklar
      if (path === '/assets/style.css' && method === 'GET') return assetRes(STYLE_CSS, 'text/css');
      if (path === '/assets/home.js' && method === 'GET') return assetRes(HOME_JS, 'text/javascript');
      if (path === '/assets/detail.js' && method === 'GET') return assetRes(DETAIL_JS, 'text/javascript');

      // --- leaflet varlıkları (self-hosted harita kütüphanesi)
      const lf = LEAFLET_FILES[path];
      if (lf && (method === 'GET' || method === 'HEAD')) return leafletRes(lf);

      return htmlRes(notFoundPage(undefined, gwPort), 404);
    } catch (e: any) {
      const isUp = e instanceof UpstreamError;
      console.error(`[customer-page] ${method} ${path} →`, isUp ? e.message : e?.message || e);
      return htmlRes(
        serverErrorPage(isUp ? e.message : 'Beklenmeyen bir sorun oluştu. Lütfen sayfayı yenile.', url.searchParams.get('XTransformPort')),
        isUp ? 502 : 500
      );
    }
  },
});

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

console.log(
  `🍉 GNC Randevu müşteri sitesi çalışıyor — http://localhost:${PORT}` +
    (BASE_DOMAIN ? ` (alt alan adı modu: *.${BASE_DOMAIN})` : ' (alt alan adı kapalı — BASE_DOMAIN env tanımlı değil)')
);
