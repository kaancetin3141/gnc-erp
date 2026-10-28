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
  MEMBER_JS,
  homePage,
  detailPage,
  memberPage,
  notFoundPage,
  serverErrorPage,
  type Json,
} from './views.ts';

const PORT = 3002;
const UPSTREAM = 'http://localhost:3000';
// Alt alan adı anahtarı: örn. BASE_DOMAIN=randevu.example.com → sik-kuafor.randevu.example.com
const BASE_DOMAIN = (process.env.BASE_DOMAIN || '').trim().toLowerCase();
// Sistem alt alan adları — işletme slug'ı OLAMAZ (yoksa randevu.alanadi ana liste
// yerine "işletme bulunamadı" gösterirdi — sunucuda tespit edilen bug, v1.4)
const RESERVED_SLUGS = new Set([
  'randevu', 'www', 'crm', 'app', 'admin', 'api', 'ana', 'panel', 'mail', 'ftp', 'ns1', 'ns2',
]);

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
    about: typeof it.about === 'string' ? it.about : null,
    phone: it.phone ?? '',
    email: it.email ?? '',
    lat: typeof it.lat === 'number' && !isNaN(it.lat) ? it.lat : it.lat != null && !isNaN(Number(it.lat)) ? Number(it.lat) : null,
    lng: typeof it.lng === 'number' && !isNaN(it.lng) ? it.lng : it.lng != null && !isNaN(Number(it.lng)) ? Number(it.lng) : null,
    workingHours: it.workingHours && typeof it.workingHours === 'object' ? it.workingHours : {},
    services: Array.isArray(it.services) ? it.services : [],
    // değerlendirme özeti (ana sayfa kartındaki ★ rozeti)
    ratingAvg: typeof it.ratingAvg === 'number' ? it.ratingAvg : 0,
    ratingCount: typeof it.ratingCount === 'number' ? it.ratingCount : 0,
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

// 404 öneri sıralaması: arama terimi işletme ADI yanında HİZMET adı/etiketinde de
// aranır; hizmet eşleşmesi en güçlü sinyaldir ("manik" → Manikür hizmetli kuaför).
// Eşleşen hizmet adı _svcMatch alanına yazılır (arayüzde chip olarak gösterilir).
function rankSuggestions(items: Json[], q: string, excludeSlug?: string, limit = 6): Json[] {
  const term = trLower(q).trim().slice(0, 64);
  const pool = excludeSlug ? items.filter((b) => b.slug !== excludeSlug) : items;
  if (!term) return pool.slice(0, limit);
  const scored = pool.map((b) => {
    let score = 0;
    let svcMatch = '';
    const services = Array.isArray(b.services) ? (b.services as Json[]) : [];
    for (const sv of services) {
      const nm = trLower(sv.name);
      const cat = trLower(sv.category);
      if (nm === term) { score = Math.max(score, 100); svcMatch = String(sv.name || ''); break; }
      if (nm.includes(term)) { score = Math.max(score, 60); if (!svcMatch) svcMatch = String(sv.name || ''); }
      else if (cat && (cat === term || cat.includes(term))) { score = Math.max(score, 40); if (!svcMatch) svcMatch = String(sv.category || ''); }
    }
    if (trLower(b.name).includes(term)) score += 30;
    const hay = trLower([b.address, b.district, b.city, b.type].join(' '));
    if (hay.includes(term)) score += 10;
    return { b, score, svcMatch };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored
    .filter((x) => x.score > 0)
    .slice(0, limit)
    .map((x) => (x.svcMatch ? { ...x.b, _svcMatch: x.svcMatch } : x.b));
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

// ---- Görsel varlıkları (tur5: Apple estetiği hero/karanlık bölüm fotoğrafları)
import { readdirSync } from 'node:fs';
const IMG_DIR = join(import.meta.dir, 'assets', 'img');
const IMG_FILES: Record<string, { data: Uint8Array; type: string }> = {};
try {
  for (const f of readdirSync(IMG_DIR)) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const ext = f.slice(f.lastIndexOf('.') + 1).toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    IMG_FILES['/assets/img/' + f] = { data: new Uint8Array(readFileSync(join(IMG_DIR, f))), type };
  }
} catch (e) {
  console.error('[customer-page] Görsel varlıkları okunamadı:', (e as Error).message);
}
const imgRes = (f: { data: Uint8Array; type: string }) =>
  new Response(f.data as BodyInit, { headers: { 'content-type': f.type, 'cache-control': 'public, max-age=86400' } });

// ---------------------------------------------------------------- sayfa render

async function renderDetail(slug: string, subdomain: boolean, gwPort?: string | null, q?: string, embed?: boolean): Promise<{ body: string; status: number }> {
  const r = await upstream(`/api/public/providers/${encodeURIComponent(slug)}`);
  if (r.status === 404) {
    // Alt alan adı modunda "tüm işletmelere dön" hedefi: randevu.ANA_DOMAIN ana liste
    const randevuHome = subdomain && BASE_DOMAIN ? `https://${listHost()}` : null;
    // Hata sayfasını zenginleştir: terim hizmet adlarında da aranır (hizmet eşleşmesi öne çıkar)
    let sugg: Json[] = [];
    try {
      const all = await getBusinesses();
      sugg = rankSuggestions(all, q || '', slug);
    } catch {
      // liste alınamadıysa önerisiz 404 gösterilir
    }
    return { body: notFoundPage(slug, gwPort, randevuHome, sugg, subdomain && BASE_DOMAIN ? BASE_DOMAIN : undefined, q), status: 404 };
  }
  if (!r.ok || !r.data || !r.data.provider) {
    throw new UpstreamError('İşletme bilgileri şu anda alınamıyor — ana uygulama yanıt vermiyor olabilir.');
  }
  const services: Json[] = Array.isArray(r.data.services) ? r.data.services : [];
  // vitrin (tur4): portföy fotoğrafları + ekip — upstream hatasına dayanıklı
  const photos: Json[] = Array.isArray(r.data.photos) ? r.data.photos : [];
  const staff: Json[] = Array.isArray(r.data.staff) ? r.data.staff : [];
  const provider = normBiz({ ...r.data.provider, services });
  // Değerlendirmeler (server-side çekilir; hata olursa bölüm boş düşer)
  let reviews: { items: Json[]; summary: Json } | null = null;
  try {
    const rr = await upstream(`/api/public/providers/${encodeURIComponent(slug)}/reviews?limit=20`);
    const rd = rr.data as Json | null;
    if (rr.ok && rd && Array.isArray(rd.items)) {
      reviews = {
        items: rd.items,
        summary: (rd.summary ?? { average: 0, count: 0, distribution: {} }) as Json,
      };
    }
  } catch {
    // değerlendirmeler olmadan da sayfa render edilir
  }
  // Gateway modunda ana sayfa bağlantısına param ekle (CRM'e düşmesin)
  // Düzeltme: "Tüm işletmeler" her zaman randevu LİSTESİNE gider (ana siteye değil)
  const homeUrl = subdomain && BASE_DOMAIN ? `https://${listHost()}` : gwq('/')
  return { body: detailPage({ provider, services, photos, staff, reviews, homeUrl, gwPort, embed }), status: 200 };

  // BASE_DOMAIN=randevu.x biçimindeyse aynen; bare domain ise randevu. öneki ekle
  function listHost(): string {
    return BASE_DOMAIN.startsWith('randevu.') ? BASE_DOMAIN : `randevu.${BASE_DOMAIN}`;
  }

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
      if (s && !s.includes('.') && !RESERVED_SLUGS.has(s)) subSlug = s;
    }

    try {
      // Gateway modu tespiti: önizleme paneli ?XTransformPort ile açar;
      // bu durumda göreli varlık/API URL'lerine aynı paramı ekleriz.
      const gwPort = url.searchParams.get('XTransformPort');

      // --- sağlık kontrolü
      if (path === '/healthz') return json({ ok: true, service: 'customer-page', port: PORT, subdomainMode: !!subSlug });

      // --- alt alan adı kökü: {slug}.BASE_DOMAIN/ → o işletmenin detay sayfası
      if (subSlug && path === '/') {
        const page = await renderDetail(subSlug, true, gwPort, url.searchParams.get('q') || undefined);
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
          // hızlı seçim: ilk uygun saat ("İlk uygun saat" butonu bunu kullanır)
          nextAvailable: typeof r.data.nextAvailable === 'string' ? r.data.nextAvailable : null,
          nextAvailableLabel: typeof r.data.nextAvailableLabel === 'string' ? r.data.nextAvailableLabel : null,
        };
        cacheSet(key, out, 10_000);
        return json(out);
      }

      // --- API: üyelik proxy'si (CRM /api/public/member/* uçlarını same-origin yapar)
      // GET/HEAD okuma, POST login/register/cancel, DELETE hesap silme (KVKK) için.
      const mMember = path.match(/^\/api\/member\/(.+)$/);
      if (mMember) {
        const rest = mMember[1].replace(/\/+$/, '');
        const auth = req.headers.get('authorization');
        const headers: Record<string, string> = { accept: 'application/json' };
        if (auth) headers['authorization'] = auth;
        if (method === 'GET' || method === 'HEAD') {
          const r = await upstream('/api/public/member/' + rest, { headers });
          if (r.data) return json(r.data, r.ok ? 200 : r.status);
          return json({ error: 'Üyelik servisi şu anda yanıt vermiyor. Birazdan tekrar dene.' }, 502);
        }
        if (method !== 'POST' && method !== 'DELETE') return json({ error: 'Bu uç için GET, POST veya DELETE kullan.' }, 405);
        let mbody: Json;
        try {
          const raw = await req.text();
          mbody = (raw.trim() ? JSON.parse(raw) : {}) as Json; // gövdesiz POST (ör. cancel) kabul edilir
        } catch {
          return json({ error: 'İstek gövdesi okunamadı.' }, 400);
        }
        const r = await upstream('/api/public/member/' + rest, {
          method,
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify(mbody),
          timeoutMs: 12000,
        });
        if (r.data) return json(r.data, r.ok ? 200 : r.status);
        return json({ error: 'Üyelik servisi şu anda yanıt vermiyor. Birazdan tekrar dene.' }, 502);
      }

      // --- API: değerlendirme proxy'si (CRM /api/public/reviews ucunu same-origin yapar)
      // POST /api/reviews                     → POST   /api/public/reviews (üye token'ı varsa Bearer iletilir)
      // GET  /api/reviews/providers/<slug>    → GET    /api/public/providers/<slug>/reviews
      if (path === '/api/reviews' && method === 'POST') {
        let rbody: Json;
        try {
          const raw = await req.text();
          rbody = (raw.trim() ? JSON.parse(raw) : {}) as Json;
        } catch {
          return json({ error: 'İstek gövdesi okunamadı.' }, 400);
        }
        const auth = req.headers.get('authorization');
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (auth) headers['authorization'] = auth;
        const r = await upstream('/api/public/reviews', {
          method: 'POST',
          headers,
          body: JSON.stringify(rbody),
          timeoutMs: 12000,
        });
        if (r.data) return json(r.data, r.ok ? 200 : r.status);
        return json({ error: 'Değerlendirme servisi şu anda yanıt vermiyor. Birazdan tekrar dene.' }, 502);
      }
      const mRevList = path.match(/^\/api\/reviews\/providers\/([^/]+)$/);
      if (mRevList && method === 'GET') {
        const slug = safeDecode(mRevList[1]);
        const lim = url.searchParams.get('limit') || '20';
        const key = `reviews:${slug}:${lim}`;
        const hit = cacheGet(key);
        if (hit) return json(hit);
        const r = await upstream(`/api/public/providers/${encodeURIComponent(slug)}/reviews?limit=${encodeURIComponent(lim)}`);
        if (r.status === 404) return json({ error: 'İşletme bulunamadı.' }, 404);
        if (!r.ok || !r.data) return json({ error: 'Değerlendirmeler şu anda alınamıyor. Birazdan tekrar dene.' }, 502);
        // admin onayı yeni yorum yayınlandığında görünsün — kısa TTL
        cacheSet(key, r.data, 15_000);
        return json(r.data);
      }

      // --- API: bekleme listesi proxy'si (CRM /api/public/waitlist → same-origin)
      // POST /api/waitlist → beklemeye gir (üye token'ı varsa Bearer iletilir)
      // GET  /api/waitlist?phone=  → "Bekleme Durumum" sorgusu
      // Gerçek istemci IP'si (x-forwarded-for) rate limit için taşınır —
      // aksi halde tüm müşteri sitesi istekleri tek 'unknown' kovasına düşerdi.
      if (path === '/api/waitlist') {
        const auth = req.headers.get('authorization');
        const headers: Record<string, string> = { accept: 'application/json' };
        if (auth) headers['authorization'] = auth;
        const xff = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
        if (xff) headers['x-forwarded-for'] = xff;
        if (method === 'GET') {
          const qs = url.searchParams.toString();
          const r = await upstream('/api/public/waitlist' + (qs ? '?' + qs : ''), { headers });
          if (r.data) return json(r.data, r.ok ? 200 : r.status);
          return json({ error: 'Bekleme durumu şu anda alınamıyor. Birazdan tekrar dene.' }, 502);
        }
        if (method !== 'POST') return json({ error: 'Bu uç için GET veya POST kullan.' }, 405);
        let wbody: Json;
        try {
          const raw = await req.text();
          wbody = (raw.trim() ? JSON.parse(raw) : {}) as Json;
        } catch {
          return json({ error: 'İstek gövdesi okunamadı.' }, 400);
        }
        const r = await upstream('/api/public/waitlist', {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify(wbody),
          timeoutMs: 12000,
        });
        // 201 (oluştu) dahil olmak üzere status aynen iletilir
        if (r.data) return json(r.data, r.status);
        return json({ error: 'Bekleme servisi şu anda yanıt vermiyor. Birazdan tekrar dene.' }, 502);
      }

      // --- API: damga kartı proxy'si (CRM /api/public/stampcard → same-origin)
      // GET /api/stampcard — üyenin damga kartları (Bearer token iletilir;
      // /api/reviews proxy deseni). Kartlar yalnız aktif damga programı
      // olan işletmeler için döner.
      if (path === '/api/stampcard' && method === 'GET') {
        const auth = req.headers.get('authorization');
        const headers: Record<string, string> = { accept: 'application/json' };
        if (auth) headers['authorization'] = auth;
        const r = await upstream('/api/public/stampcard', { headers });
        if (r.data) return json(r.data, r.ok ? 200 : r.status);
        return json({ error: 'Damga kartların şu anda alınamıyor. Birazdan tekrar dene.' }, 502);
      }

      // --- API: ICS takvim dosyası proxy'si (CRM /api/public/appointments/ics → same-origin)
      // "📅 Takvime ekle" butonları bu ucu kullanır: ?code=XXXXXXXX (misafir) ya da
      // ?id=<appointmentId> + Authorization: Bearer (üye). Token varsa upstream'e
      // iletilir; gerçek istemci IP'si (x-forwarded-for) rate limit için taşınır.
      // text/calendar yanıtı olduğu gibi (Content-Disposition dahil) aktarılır;
      // JSON hataları (400/401/404/409/429) status koduyla iletilir.
      if (path === '/api/appointments/ics' && method === 'GET') {
        const qs = url.searchParams.toString();
        const fwdHeaders: Record<string, string> = { accept: 'text/calendar, application/json' };
        const auth = req.headers.get('authorization');
        if (auth) fwdHeaders['authorization'] = auth;
        const xff = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
        if (xff) fwdHeaders['x-forwarded-for'] = xff;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(UPSTREAM + '/api/public/appointments/ics' + (qs ? '?' + qs : ''), {
            headers: fwdHeaders,
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('text/calendar')) {
            const body = await res.text();
            return new Response(body, {
              status: res.status,
              headers: {
                'content-type': 'text/calendar; charset=utf-8',
                'content-disposition':
                  res.headers.get('content-disposition') || 'attachment; filename="randevu.ics"',
                'cache-control': 'no-store',
              },
            });
          }
          // hata yanıtı: JSON (404/429/400/…) — olduğu gibi aktar
          let data: Json | null = null;
          try {
            data = (await res.json()) as Json;
          } catch {
            data = null;
          }
          return json(data ?? { error: 'Takvim dosyası alınamadı.' }, res.status);
        } catch {
          return json({ error: 'Takvim servisi şu anda yanıt vermiyor. Birazdan tekrar dene.' }, 502);
        }
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
      if (path === '/uyelik' && method === 'GET') return htmlRes(memberPage(BASE_DOMAIN, gwPort));

      const mDetail = path.match(/^\/isletme\/([^/]+)$/);
      if (mDetail && method === 'GET') {
        const slug = safeDecode(mDetail[1]);
        // ?embed=1 → siteye göm modu (iframe içi kompakt: nav/footer gizli)
        const embed = url.searchParams.get('embed') === '1';
        const page = await renderDetail(slug, false, gwPort, url.searchParams.get('q') || undefined, embed);
        return htmlRes(page.body, page.status);
      }

      // --- 🔗 siteye göm (widget) — işletmelerin kendi sitelerine eklediği
      // iframe kaynağı: /widget/:slug → detail sayfasının çerçevesiz hâli.
      // Aynı kamu randevu API'lerini kullanır (ek saldırı yüzeyi yok).
      const mWidget = path.match(/^\/widget\/([^/]+)$/);
      if (mWidget && method === 'GET') {
        const slug = safeDecode(mWidget[1]);
        const page = await renderDetail(slug, false, gwPort, undefined, true);
        return htmlRes(page.body, page.status);
      }

      // --- gömülü varlıklar
      if (path === '/assets/style.css' && method === 'GET') return assetRes(STYLE_CSS, 'text/css');
      if (path === '/assets/home.js' && method === 'GET') return assetRes(HOME_JS, 'text/javascript');
      if (path === '/assets/detail.js' && method === 'GET') return assetRes(DETAIL_JS, 'text/javascript');
      if (path === '/assets/member.js' && method === 'GET') return assetRes(MEMBER_JS, 'text/javascript');

      // --- leaflet varlıkları (self-hosted harita kütüphanesi)
      const lf = LEAFLET_FILES[path];
      if (lf && (method === 'GET' || method === 'HEAD')) return leafletRes(lf);

      // --- gömülü görsel varlıkları (tur5)
      const im = IMG_FILES[path];
      if (im && (method === 'GET' || method === 'HEAD')) return imgRes(im);

      // Bilinmeyen sayfa: önerili 404 — ?q= terimi hizmet adlarında da aranır
      const nfq = (url.searchParams.get('q') || '').trim();
      let sugg: Json[] = [];
      try {
        sugg = rankSuggestions(await getBusinesses(), nfq);
      } catch {
        // öneri alınamadı
      }
      return htmlRes(notFoundPage(undefined, gwPort, null, sugg, subSlug && BASE_DOMAIN ? BASE_DOMAIN : undefined, nfq || undefined), 404);
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
