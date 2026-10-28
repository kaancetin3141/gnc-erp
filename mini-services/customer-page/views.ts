/**
 * GNC Randevu — Müşteri Sitesi görünümleri (server-rendered HTML + gömülü CSS/JS)
 * Port 3002 mini-servisi için saf bun; build adımı yok, CDN yok, her şey offline.
 */

export type Json = Record<string, any>;

// ---------------------------------------------------------------- yardımcılar

/** HTML kaçış — tüm kullanıcı verilerinde kullanılır. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** <script> veri adası için JSON — </script> patlamasına karşı < karakteri kodlanır. */
function jsonIsland(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// ---------------------------------------------------------------- tür meta + SVG ikonlar

const TYPE_META: Record<string, { label: string; icon: string }> = {
  berber: { label: 'Berber', icon: 'scissors' },
  kuafor: { label: 'Kuaför', icon: 'scissors' },
  disci: { label: 'Dişçi', icon: 'tooth' },
  guzellik: { label: 'Güzellik', icon: 'sparkle' },
  spa: { label: 'Spa', icon: 'lotus' },
  dovme: { label: 'Dövme', icon: 'needle' },
};

function typeMeta(type: string) {
  return TYPE_META[type] || { label: 'İşletme', icon: 'store' };
}

/** İnce SVG çizgi ikonlar — Apple estetiğinde emoji yerine geçer (inline, stroke). */
const SVGS: Record<string, string> = {
  search: '<circle cx="7" cy="7" r="4.7"/><path d="m10.5 10.5 3.3 3.3"/>',
  chevR: '<path d="m5.5 3 4.5 5-4.5 5"/>',
  chevL: '<path d="M10.5 3 6 8l4.5 5"/>',
  arrowL: '<path d="M13.5 8H3m0 0 4-4M3 8l4 4"/>',
  scissors: '<circle cx="4.6" cy="4.6" r="1.9"/><circle cx="4.6" cy="11.4" r="1.9"/><path d="M6.1 5.6 14 12.4M6.1 10.4 14 3.6"/>',
  tooth:
    '<path d="M8 2.3c-1.1 0-1.7.6-2.8.6-1.9 0-2.9 1.4-2.9 3.8 0 2.1.8 3.5 1.2 5.5.3 1.4.5 2.5 1.3 2.5.9 0 1-1.5 1.3-3.1.2-1.1.6-1.9 1.9-1.9s1.7.8 1.9 1.9c.3 1.6.4 3.1 1.3 3.1.8 0 1-1.1 1.3-2.5.4-2 1.2-3.4 1.2-5.5 0-2.4-1-3.8-2.9-3.8-1.1 0-1.7-.6-2.8-.6Z"/>',
  sparkle:
    '<path d="M8 1.8 9.5 5.4 13.1 6.9 9.5 8.4 8 12 6.5 8.4 2.9 6.9 6.5 5.4Z"/><path d="m12.3 10.4.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z"/>',
  lotus:
    '<path d="M8 12.3c-2.4 0-4.4-1-5.4-2.5 1.2-.3 2.3-.1 3.2.4C5.1 8.6 4.6 6.9 4.9 5c1.5.8 2.6 2 3.1 3.6C8.5 7 9.6 5.8 11 5c.3 1.9-.2 3.6-1.2 5.2.9-.5 2-.7 3.2-.4-1 1.5-2.6 2.5-5 2.5Z"/><path d="M3 13.4c1.5 1 3.2 1.5 5 1.5s3.5-.5 5-1.5"/>',
  needle:
    '<path d="M13.4 2.6 6.2 9.8"/><path d="m5.2 8.8-1.9 1.1a1 1 0 0 0-.2 1.6l1.4 1.4a1 1 0 0 0 1.6-.2l1.1-1.9"/><path d="m11.9 3.3 1.5-1.5"/>',
  store:
    '<path d="M2.4 6.4 3.4 3h9.2l1 3.4"/><path d="M2.4 6.4c0 1.1.9 1.9 2 1.9s2-.8 2-1.9c0 1.1.9 1.9 2 1.9s2-.8 2-1.9c0 1.1.7 1.9 1.7 1.9s1.9-.8 1.9-1.9"/><path d="M4 9.4v4.1h8V9.4"/><path d="M7 13.5v-2.6h2v2.6"/>',
  cal: '<rect x="2.4" y="3.4" width="11.2" height="10.2" rx="2"/><path d="M2.4 6.6h11.2M5.6 2v2.8M10.4 2v2.8"/>',
  clock: '<circle cx="8" cy="8" r="5.7"/><path d="M8 4.9V8l2.1 1.4"/>',
  pin: '<path d="M12.9 6.4a4.9 4.9 0 1 0-9.8 0c0 1.5.7 2.8 1.6 3.8L8 13.8l3.3-3.6c.9-1 1.6-2.3 1.6-3.8Z"/><circle cx="8" cy="6.3" r="1.6"/>',
  phone:
    '<path d="M5.4 2.7c.4-.5 1.1-.6 1.5-.1l1.2 1.4c.4.4.3 1-.1 1.4l-.8.8c-.2.2-.3.5-.1.8.4.7 1 1.4 1.7 2 .6.6 1.3 1.1 2 1.4.3.1.6.1.8-.2l.7-.7c.4-.4 1-.4 1.4 0l1.4 1.2c.5.4.5 1.1.1 1.5l-1 1c-.6.6-1.5.9-2.3.6-2.8-1-5.1-3.2-6.7-6.1-.4-.8-.3-1.7.3-2.4Z"/>',
  star: '<path d="m8 2 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4l-3.8 2.4.7-4.3-3.1-3 4.3-.6Z"/>',
  user: '<circle cx="8" cy="5.4" r="3.1"/><path d="M2.7 13.6c.8-2.3 2.9-3.6 5.3-3.6s4.5 1.3 5.3 3.6"/>',
  bolt: '<path d="M8.8 1.6 3.4 9.2h3.5l-.9 5.2 5.5-7.7H7.9Z"/>',
  check: '<path d="m3 8.6 3.3 3.1L13 4.6"/>',
  x: '<path d="m4 4 8 8M12 4 4 12"/>',
  bell: '<path d="M8 2.4a4.1 4.1 0 0 0-4.1 4.1v2.6L2.7 11.6h10.6l-1.2-2.5V6.5A4.1 4.1 0 0 0 8 2.4Z"/><path d="M6.6 13.6a1.5 1.5 0 0 0 2.8 0"/>',
  trash:
    '<path d="M2.8 4.4h10.4"/><path d="M6.4 4.4V3.1c0-.4.3-.7.7-.7h1.8c.4 0 .7.3.7.7v1.3"/><path d="M4.3 4.4 4.9 13c0 .6.5 1 1 1h4.2c.5 0 1-.4 1-1l.6-8.6"/>',
  calPlus:
    '<rect x="2.4" y="3.4" width="11.2" height="10.2" rx="2"/><path d="M2.4 6.6h11.2M5.6 2v2.8M10.4 2v2.8M8 8.7v2.6M6.7 10h2.6"/>',
  wa: '<path d="M11.7 9.3c-.3-.2-1.6-.8-1.8-.9-.2-.1-.4 0-.6.2l-.5.6c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-2.6-2.5c-.1-.2-.1-.4.1-.5l.5-.6c.1-.2.2-.4.1-.6l-.7-1.8c-.1-.3-.4-.4-.7-.3-.6.2-1.2.6-1.5 1.2-.5 1-.3 2.2.3 3.5a10 10 0 0 0 3.5 3.9c1.2.8 2.5 1 3.5.5.6-.3 1-.8 1.2-1.4.1-.3 0-.6-.3-.7Z"/><path d="M8 1.7a6.3 6.3 0 0 0-5.4 9.5L1.7 14.3l3.2-.9A6.3 6.3 0 1 0 8 1.7Z"/>',
};

function icon(name: string, size = 16): string {
  const p = SVGS[name] || SVGS.store;
  return `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#1d1d1f"/><text x="50" y="69" font-family="-apple-system,Arial,sans-serif" font-size="54" font-weight="700" fill="#ffffff" text-anchor="middle">G</text></svg>'
  );

// ---------------------------------------------------------------- Ortak CSS

export const STYLE_CSS = `
/* ════════════════════════════════════════════════════════════════════
   GNC Randevu — Apple.com estetiği (tur5 tam redesign)
   Beyaz / #f5f5f7 dönüşümlü section'lar · #1d1d1f / #86868b metin
   #0071e3 CTA · 48px blur nav · pill butonlar · reveal animasyonları
   ════════════════════════════════════════════════════════════════════ */
:root{
  --ink:#1d1d1f;--sub:#86868b;--bg:#ffffff;--bg2:#f5f5f7;
  --blue:#0071e3;--blue-h:#0077ed;--link:#0066cc;
  --hair:rgba(0,0,0,.08);--hair-strong:#d2d2d7;
  --ok:#34a853;--err:#de3131;
  --radius:18px;--radius-lg:28px;
  --ease:cubic-bezier(.28,.11,.32,1);
  --shadow-hover:0 12px 40px rgba(0,0,0,.12);
  --shadow-soft:0 4px 18px rgba(0,0,0,.06);
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{
  font-family:var(--font);color:var(--ink);line-height:1.47;
  font-size:17px;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  min-height:100vh;background:var(--bg);
}
img{max-width:100%}
a{color:var(--link);text-decoration:none}
a:hover{color:var(--blue-h)}
:focus-visible{outline:4px solid rgba(0,113,227,.45);outline-offset:1px;border-radius:6px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
[hidden]{display:none !important}
::selection{background:rgba(0,113,227,.18)}

/* ---- sayfa iskeleti: sticky footer ---- */
.page{min-height:100vh;min-height:100svh;display:flex;flex-direction:column}
main{flex:1 0 auto;width:100%;max-width:1024px;margin:0 auto;padding:0 22px 72px}
.wrap-wide{max-width:1024px;margin:0 auto;padding:0 22px}
section{margin:0}

/* ---- Apple tipografisi ---- */
h1,h2,h3{color:var(--ink);letter-spacing:-.015em;text-wrap:balance}
.sec-h{font-size:clamp(28px,4.6vw,48px);font-weight:700;letter-spacing:-.02em;line-height:1.08}
.sec-sub{font-size:clamp(17px,2vw,21px);color:var(--sub);line-height:1.4;font-weight:400}
.section-title{font-size:clamp(24px,3.4vw,36px);font-weight:700;letter-spacing:-.018em;line-height:1.12;margin:0 0 18px}
.mini-note{font-size:13px;color:var(--sub);font-weight:400}
.sub{color:var(--sub);font-size:17px}

/* ═══ Reveal animasyonları (Apple imzası) ═══ */
html.js .reveal{opacity:0;transform:translateY(24px);transition:opacity .8s var(--ease),transform .8s var(--ease)}
html.js .reveal.in{opacity:1;transform:none}
html.js .reveal-group>*{opacity:0;transform:translateY(24px);transition:opacity .8s var(--ease),transform .8s var(--ease)}
html.js .reveal-group.in>*{opacity:1;transform:none}
html.js .reveal-group.in>*:nth-child(1){transition-delay:0ms}
html.js .reveal-group.in>*:nth-child(2){transition-delay:90ms}
html.js .reveal-group.in>*:nth-child(3){transition-delay:180ms}
html.js .reveal-group.in>*:nth-child(4){transition-delay:270ms}
html.js .reveal-group.in>*:nth-child(5){transition-delay:360ms}
html.js .reveal-group.in>*:nth-child(6){transition-delay:450ms}
html.js .reveal-group.in>*:nth-child(7){transition-delay:540ms}
html.js .reveal-group.in>*:nth-child(8){transition-delay:630ms}
@media (prefers-reduced-motion:reduce){
  html.js .reveal,html.js .reveal-group>*{opacity:1 !important;transform:none !important;transition:none !important}
  html{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
}

/* ═══ Sticky nav: 48px · blur · hairline ═══ */
header.top{
  position:sticky;top:0;z-index:50;height:48px;
  background:rgba(255,255,255,.72);
  backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);
  border-bottom:1px solid var(--hair);
}
.top-in{max-width:1024px;margin:0 auto;height:48px;padding:0 22px;display:flex;align-items:center;gap:18px}
.logo{display:inline-flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);font-size:15px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;flex:none}
.logo:hover{color:var(--ink)}
.logo-mark{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5.5px;background:var(--ink);color:#fff;font-size:12px;font-weight:700;letter-spacing:0;flex:none}
.logo-word{display:inline}
.nav-links{display:flex;align-items:center;gap:26px;flex:none}
.nav-links a{font-size:12px;color:rgba(29,29,31,.8);text-decoration:none;white-space:nowrap;transition:color .15s}
.nav-links a:hover{color:var(--ink)}
.nav-tools{display:flex;align-items:center;gap:14px;margin-left:auto;flex:none}
.search{position:relative;width:200px}
.search input{
  width:100%;height:30px;padding:0 30px;border:none;border-radius:9px;
  background:rgba(29,29,31,.06);font:inherit;font-size:13px;color:var(--ink);
  transition:background .2s,box-shadow .2s;
}
.search input::placeholder{color:var(--sub)}
.search input:focus{outline:none;background:#fff;box-shadow:0 0 0 3px rgba(0,113,227,.25)}
.search .s-ic{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--sub);display:inline-flex;pointer-events:none}
.s-kbd{display:none}
.member-btn{
  display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 14px;border-radius:980px;
  background:var(--blue);color:#fff !important;font-size:12px;font-weight:500;text-decoration:none;white-space:nowrap;
  transition:background .15s;
}
.member-btn:hover{background:var(--blue-h);color:#fff !important}
.member-btn.logged{background:var(--ink)}
@media(max-width:860px){
  .nav-links{display:none}
  .search{width:auto;flex:1 1 120px;max-width:none}
  .top-in{gap:12px}
}
@media(max-width:560px){
  .logo-word{display:none}
}

/* ═══ Butonlar: pill 980px · 17px ═══ */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  border:none;cursor:pointer;font:inherit;font-size:17px;font-weight:400;
  border-radius:980px;padding:12px 24px;min-height:44px;
  text-decoration:none;color:var(--ink);
  transition:background .2s var(--ease),transform .2s var(--ease),box-shadow .2s var(--ease),color .15s;
}
.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.55;cursor:wait;transform:none}
.btn-primary,.btn-geo{background:var(--blue);color:#fff}
.btn-primary:hover,.btn-geo:hover{background:var(--blue-h);color:#fff}
.btn-wa{background:#1f9e57;color:#fff}
.btn-wa:hover{background:#178a4b;color:#fff}
.btn-ghost{background:transparent;color:var(--link);padding:12px 10px}
.btn-ghost:hover{color:var(--blue-h)}
.btn-submit{background:var(--blue);color:#fff;font-weight:500}
.btn-submit:hover{background:var(--blue-h);color:#fff}
.btn-wl{width:100%;background:var(--ink);color:#fff;font-weight:500}
.btn-wl:hover{background:#3a3a3c;color:#fff}
.btn-wl:disabled{opacity:.55}
/* text link + chevron */
.btn-link,.link-more{
  display:inline-flex;align-items:center;gap:4px;font-size:17px;color:var(--link);
  text-decoration:none;min-height:44px;padding:4px 2px;
}
.btn-link:hover,.link-more:hover{color:var(--blue-h)}
.btn-link svg,.link-more svg{transition:transform .2s var(--ease)}
.btn-link:hover svg,.link-more:hover svg{transform:translateX(3px)}
.chev{flex:none}

/* ═══ Filtre çipleri: minimal pill ═══ */
.filters-row{display:flex;gap:12px;align-items:center;margin:0 0 22px;flex-wrap:wrap}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{
  display:inline-flex;align-items:center;height:36px;padding:0 16px;border:none;cursor:pointer;
  border-radius:980px;background:transparent;color:var(--ink);
  font:inherit;font-size:14px;font-weight:400;white-space:nowrap;
  transition:background .18s,color .18s;
}
.chip:hover{background:rgba(0,0,0,.05)}
.chip.on{background:var(--ink);color:#fff}
.chip[aria-pressed="true"]{background:var(--ink);color:#fff}
.chip:focus-visible{outline:3px solid rgba(0,113,227,.45)}
.city-wrap select{
  height:36px;border:none;border-radius:980px;background:rgba(0,0,0,.05);
  font:inherit;font-size:14px;color:var(--ink);padding:0 14px;cursor:pointer;appearance:none;
  -webkit-appearance:none;
}
.city-wrap select:focus{outline:3px solid rgba(0,113,227,.45)}

/* ═══ Ana sayfa hero ═══ */
.hero{padding:56px 0 36px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
@media(min-width:760px){.hero{min-height:88vh;padding:40px 0}}
section[id],.bhead{scroll-margin-top:64px}
.hero-eyebrow{font-size:19px;font-weight:600;color:var(--blue);letter-spacing:-.01em;margin-bottom:10px}
.hero h1{
  font-size:clamp(34px,7vw,76px);font-weight:700;letter-spacing:-.025em;line-height:1.05;
  margin:0 auto;max-width:16ch;
}
.hero p{margin:18px auto 0;color:var(--sub);font-size:clamp(17px,2.2vw,21px);line-height:1.45;max-width:52ch;font-weight:400}
.hero-ctas{display:flex;gap:18px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:26px}
.loc-status{margin-top:16px;font-size:14px;color:var(--sub);min-height:1.3em}
.loc-status b{color:var(--ink);font-weight:600}

/* hero görseli: tam genişlik · scale-in · beyaz fade · ince parallax */
.hero-shot{margin:0}
.hero-shot-media{position:relative;overflow:hidden;aspect-ratio:1344/768;background:var(--bg2)}
@media(max-width:640px){.hero-shot-media{aspect-ratio:4/3}}
.hero-shot-img{
  position:absolute;left:0;top:-8%;width:100%;height:116%;object-fit:cover;display:block;
  transform:translateY(var(--py,0px));will-change:transform;
}
html.js .hero-shot-img{animation:heroZoom 1.2s var(--ease) both}
@keyframes heroZoom{from{scale:1.06}to{scale:1}}
.hero-shot-fade{
  position:absolute;left:0;right:0;bottom:0;height:20%;z-index:2;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92));
}
.hero-shot-cap{
  position:absolute;left:18px;bottom:12px;z-index:3;
  font-size:13px;color:rgba(29,29,31,.72);font-weight:500;
  background:rgba(255,255,255,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border-radius:980px;padding:5px 13px;
}

/* ═══ Feature strip ═══ */
.features{display:grid;grid-template-columns:1fr;gap:14px;padding:64px 0 8px}
@media(min-width:720px){.features{grid-template-columns:repeat(3,1fr);gap:20px}}
.feature{display:grid;gap:8px;justify-items:center;text-align:center;padding:34px 22px;background:var(--bg2);border-radius:var(--radius)}
.feature-ic{color:var(--ink);display:inline-flex;margin-bottom:4px}
.feature b{font-size:19px;font-weight:600;letter-spacing:-.01em}
.feature span{font-size:14px;color:var(--sub);line-height:1.45;max-width:30ch}

/* ═══ Koyu section (#000) ═══ */
.dark-section{background:#000;color:#fff;margin:64px -22px;padding:72px 22px;text-align:center}
.dark-section .sec-h{color:#fff}
.dark-section .sec-sub{color:rgba(255,255,255,.72);margin:14px auto 0;max-width:46ch}
.dark-section .link-more{color:#2997ff;margin-top:22px}
.dark-section .link-more:hover{color:#57aeff}
.dark-img{display:block;width:100%;max-width:860px;height:auto;margin:44px auto 0;border-radius:var(--radius)}

/* ═══ İşletme kartları: Apple "product tile" ═══ */
.grid{display:grid;grid-template-columns:1fr;gap:22px}
@media(min-width:660px){.grid{grid-template-columns:repeat(2,1fr);gap:26px}}
.card{
  display:flex;flex-direction:column;background:#fff;border-radius:var(--radius-lg);
  overflow:hidden;text-decoration:none;
  transition:transform .3s var(--ease),box-shadow .3s var(--ease);
}
.card:hover{transform:translateY(-6px);box-shadow:var(--shadow-hover)}
.card-link{display:block;color:inherit;text-decoration:none}
.cover{position:relative;display:block;aspect-ratio:4/3;background:var(--bg2);overflow:hidden}
.cover .cphoto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s var(--ease)}
.card:hover .cphoto{transform:scale(1.03)}
.phb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--sub)}
.phb svg{opacity:.5}
.ph-berber,.ph-kuafor,.ph-disci,.ph-guzellik,.ph-spa,.ph-dovme,.ph-def{background:#f5f5f7}
.body{display:flex;flex-direction:column;gap:8px;padding:26px 26px 24px;flex:1}
.row-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{
  display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:var(--sub);
  letter-spacing:0;padding:0;
}
.badge svg{opacity:.75}
.b-berber,.b-kuafor,.b-disci,.b-guzellik,.b-spa,.b-dovme,.b-def{background:transparent;color:var(--sub)}
.rate-chip{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:500;color:var(--ink)}
.rate-chip .s{color:#f56300;font-size:13px}
.dist{display:inline-flex;align-items:center;gap:3px;font-size:13px;color:var(--sub)}
.c-name{font-size:21px;font-weight:600;letter-spacing:-.015em;line-height:1.2;margin:0}
.c-name a{color:var(--ink);text-decoration:none}
.c-name a:hover{color:var(--blue)}
.c-loc{font-size:15px;color:var(--sub);margin:0;display:flex;align-items:center;gap:5px}
.c-addr{font-size:13px;color:var(--sub);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.c-meta{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--sub);margin-top:2px}
.minp{color:var(--ink);font-weight:500}
.c-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:14px}
.tel-link{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--link);text-decoration:none;min-height:44px}
.tel-link:hover{color:var(--blue-h)}
.go{display:inline-flex;align-items:center;gap:3px;font-size:15px;color:var(--link);font-weight:400}
.card:hover .go{color:var(--blue-h)}

/* iskelet (skeleton) */
.sk{background:#fff;border-radius:var(--radius-lg);overflow:hidden;box-shadow:none}
.sc{aspect-ratio:4/3;background:var(--bg2)}
.sb{padding:22px;display:grid;gap:10px}
.sk-line{height:12px;border-radius:6px;background:var(--bg2)}
.sk-line.w60{width:60%}.sk-line.w80{width:80%}
.sk,.sk-line{animation:skPulse 1.6s ease-in-out infinite}
@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.55}}

.count{font-size:13px;color:var(--sub);margin:0 0 18px}
.state-box{grid-column:1/-1;text-align:center;padding:64px 20px;color:var(--sub);background:var(--bg2);border-radius:var(--radius)}
.state-box .big{display:block;font-size:40px;margin-bottom:12px;color:var(--sub)}
.state-box p{font-size:17px;line-height:1.5}
.state-box .btn{margin-top:18px}

/* ═══ Harita bölümü ═══ */
.map-card{background:#fff;border:1px solid var(--hair);border-radius:var(--radius-lg);overflow:hidden}
.map-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 24px 0}
.map-head h2{font-size:21px;font-weight:600;letter-spacing:-.01em;margin:0}
.map-toggle{
  border:none;background:transparent;font:inherit;font-size:14px;color:var(--link);
  cursor:pointer;min-height:44px;padding:4px 8px;border-radius:8px;
}
.map-toggle:hover{color:var(--blue-h)}
.biz-map{height:380px;margin-top:12px}
.map-hint{padding:12px 24px 18px;font-size:13px;color:var(--sub);margin:0}
/* Leaflet pinleri: Apple Maps tarzı minimal daireler */
.biz-pin{
  width:26px;height:26px;border-radius:50%;background:#fff;
  border:1px solid var(--hair);box-shadow:0 2px 8px rgba(0,0,0,.22);
  display:flex;align-items:center;justify-content:center;
}
.pin-dot{width:10px;height:10px;border-radius:50%;background:var(--ink);display:block}
.biz-pin.pin-nearest{width:34px;height:34px;background:var(--blue);border-color:#fff}
.biz-pin.pin-nearest .pin-dot{width:14px;height:14px;background:#fff}
.pin-star{position:absolute;top:-7px;right:-7px;width:14px;height:14px;border-radius:50%;background:#fff;border:1px solid var(--hair);box-shadow:0 1px 4px rgba(0,0,0,.2);display:block}
.pin-star::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--blue)}
.user-dot{width:16px;height:16px;border-radius:50%;background:var(--blue);border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.3)}
.biz-pop{font-family:var(--font);min-width:170px}
.pop-t{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:-.01em}
.pop-s{font-size:12px;color:var(--sub);margin-top:2px}
.pop-d{font-size:12px;color:var(--sub);margin-top:4px;display:flex;align-items:center;gap:4px}
.pop-link{display:inline-flex;align-items:center;gap:3px;margin-top:8px;font-size:14px;color:var(--link);text-decoration:none}
.pop-link:hover{color:var(--blue-h)}
.leaflet-container{font-family:var(--font)}

/* ═══ Detay sayfası ═══ */
.crumb{
  display:inline-flex;align-items:center;gap:6px;margin:18px 0 4px;font-size:13px;color:var(--sub);
  text-decoration:none;min-height:44px;
}
.crumb:hover{color:var(--ink)}
.crumb svg{opacity:.7}
.dwrap{display:grid;gap:54px;padding-top:8px}
.dwrap>*{min-width:0} /* bölüm içerikleri (tablo/harita/şerit) grid track'i mobilde genişletmesin */

/* vitrin hero: tam genişlik kapak — altında ortalanmış başlık */
.bhero{position:relative;overflow:hidden;margin:0 -22px;background:var(--bg2);min-height:300px}
@media(min-width:640px){.bhero{min-height:440px}}
@media(min-width:1024px){.bhero{min-height:520px}}
.bhero-img{position:absolute;left:0;top:-16%;width:100%;height:132%;object-fit:cover;display:block;transform:translateY(var(--py,0px));will-change:transform}
.bhero-ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 0%,rgba(0,0,0,0) 40%,rgba(0,0,0,.28) 100%)}
.bhero-glyph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;opacity:.34}
.bhero-emoji{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:7rem;opacity:.25;user-select:none}
/* başlık bloğu: Apple ürün sayfası gibi görselin altında */
.bhead{padding:44px 0 8px;text-align:center;display:grid;gap:14px;justify-items:center}
.bhead-type{font-size:17px;font-weight:600;color:var(--sub);letter-spacing:.01em;margin:0}
.bhead-title{
  font-size:clamp(32px,5.6vw,60px);font-weight:700;letter-spacing:-.025em;line-height:1.06;
  margin:0;max-width:18ch;
}
.bhead-meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;font-size:15px;color:var(--sub)}
.bhead-addr{font-size:14px;color:var(--sub);margin:0;max-width:60ch}
.bhead-actions{display:flex;align-items:center;gap:22px;flex-wrap:wrap;justify-content:center;margin-top:8px}
.rate-badge{
  display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:500;color:var(--ink);
  text-decoration:none;min-height:44px;padding:4px 2px;
}
.rate-badge:hover{color:var(--blue)}
.rate-badge-s{color:#f56300;font-size:15px}
.rate-badge-c{color:var(--sub);font-weight:400;font-size:14px}
.rate-badge.rate-new{color:var(--sub);font-weight:400}
.rate-badge.hlt,.rate-badge.rate-new.hlt{color:var(--ink)}
.open-chip{
  display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--sub);
  padding:5px 13px;border-radius:980px;background:var(--bg2);
}
.open-chip::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--sub);flex:none}
.open-chip.on{background:rgba(52,168,83,.12);color:#1e7e34}
.open-chip.on::before{background:var(--ok)}
.open-chip.off{background:rgba(0,0,0,.06);color:var(--sub)}
.open-chip.off::before{background:#b0b0b5}

/* dhead: saatler + harita kartları */
.dhead{display:grid;gap:22px}
@media(min-width:900px){.dhead{grid-template-columns:1fr 1fr}}
.dcard{background:#fff;border:1px solid var(--hair);border-radius:var(--radius-lg);overflow:hidden}
.dbody{padding:26px 26px 24px}
.dbody .section-title{font-size:24px;margin-bottom:14px}
.hours{width:100%;border-collapse:collapse;font-size:15px}
.hours tr{border-bottom:1px solid var(--hair)}
.hours tr:last-child{border-bottom:none}
.hours td{padding:11px 0;color:var(--sub)}
.hours td:first-child{color:var(--ink);font-weight:400}
.hours td.t-time{text-align:right;font-variant-numeric:tabular-nums}
.hours td.t-time.closed{color:#b0b0b5}
.hours tr.today td{color:var(--ink)}
.hours tr.today td:first-child{font-weight:600}
.today-pill{
  display:inline-block;margin-left:8px;font-size:11px;font-weight:500;color:var(--blue);
  border:1px solid rgba(0,113,227,.35);border-radius:980px;padding:1px 9px;vertical-align:2px;
}
.detail-map{height:300px;border-radius:14px;overflow:hidden;border:1px solid var(--hair)}
.dir-links{display:flex;gap:22px;margin-top:14px;flex-wrap:wrap}
.dir-links a{display:inline-flex;align-items:center;gap:6px;font-size:15px;color:var(--link);text-decoration:none;min-height:44px}
.dir-links a:hover{color:var(--blue-h)}

/* hakkımızda */
.about-card{border:none;background:transparent}
.about-card .dbody{padding:0;max-width:640px;margin:0 auto;text-align:center}
.about-card .section-title{font-size:clamp(24px,3.4vw,36px);margin-bottom:16px}
.about-text{white-space:pre-line;color:var(--sub);font-size:clamp(17px,2vw,19px);line-height:1.55;margin:0}

/* ═══ Portföy ═══ */
.pf-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.pf-chips::-webkit-scrollbar{display:none}
.pf-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@media(min-width:640px){.pf-grid{grid-template-columns:repeat(3,1fr);gap:14px}}
@media(min-width:1024px){.pf-grid{grid-template-columns:repeat(4,1fr)}}
.pf-item{
  position:relative;display:block;padding:0;border:none;aspect-ratio:4/3;border-radius:14px;
  overflow:hidden;cursor:zoom-in;background:var(--bg2);
  transition:transform .3s var(--ease),box-shadow .3s var(--ease);
}
.pf-item:hover,.pf-item:focus-visible{transform:translateY(-4px);box-shadow:var(--shadow-hover)}
.pf-item img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.pf-ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.42) 100%);opacity:0;transition:opacity .3s}
.pf-item:hover .pf-ov{opacity:1}
.pf-cap{
  position:absolute;left:12px;right:12px;bottom:10px;z-index:2;color:#fff;font-size:14px;font-weight:500;
  text-shadow:0 1px 6px rgba(0,0,0,.5);text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  opacity:0;transform:translateY(6px);transition:opacity .3s var(--ease),transform .3s var(--ease);
}
.pf-item:hover .pf-cap{opacity:1;transform:none}
.pf-cat{
  position:absolute;top:10px;right:10px;z-index:2;font-size:11px;font-weight:500;color:#fff;
  background:rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border-radius:980px;padding:3px 10px;
}

/* lightbox: Apple TV tam ekran */
.lbx{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.94);padding:16px}
.lbx-fig{margin:0;max-width:92vw;display:grid;gap:14px;justify-items:center}
.lbx-fig img{max-width:92vw;max-height:76vh;object-fit:contain;border-radius:8px}
.lbx-cap{display:grid;gap:3px;text-align:center;color:#fff;max-width:80vw;justify-items:center}
.lbx-cap b{font-size:17px;font-weight:600}
.lbx-cap span{font-size:14px;color:rgba(255,255,255,.7)}
.lbx-close{
  position:fixed;top:calc(12px + env(safe-area-inset-top,0px));right:14px;z-index:3;
  width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;
  display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s;
}
.lbx-close:hover{background:rgba(255,255,255,.28)}
.lbx-nav{
  position:fixed;top:50%;transform:translateY(-50%);z-index:3;
  width:48px;height:64px;border-radius:16px;border:none;background:rgba(255,255,255,.1);color:#fff;
  display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s;
}
.lbx-nav:hover:not(:disabled){background:rgba(255,255,255,.22)}
.lbx-nav:disabled{opacity:.28;cursor:default}
.lbx-prev{left:12px}
.lbx-next{right:12px}
.lbx-count{
  position:fixed;top:calc(18px + env(safe-area-inset-top,0px));left:18px;z-index:3;
  color:rgba(255,255,255,.9);font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;
  background:rgba(255,255,255,.12);border-radius:980px;padding:5px 13px;
}
@media(max-width:640px){.lbx-nav{width:44px;height:68px}.lbx-prev{left:6px}.lbx-next{right:6px}.lbx{padding:10px}}

/* ═══ Ekip ═══ */
.team-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media(min-width:640px){.team-grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:1024px){.team-grid{grid-template-columns:repeat(4,1fr)}}
.team-card{
  display:grid;justify-items:center;text-align:center;gap:8px;background:var(--bg2);
  border-radius:var(--radius);padding:28px 16px 24px;
  transition:transform .3s var(--ease),box-shadow .3s var(--ease);
}
.team-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover)}
.team-photo{width:84px;height:84px;border-radius:50%;object-fit:cover;background:#fff}
.team-initial{display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;color:var(--ink);background:#fff}
.team-name{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:0}
.team-title{font-size:14px;color:var(--sub);margin:0}
.team-bio{font-size:13px;color:var(--sub);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45}

/* ═══ Hizmet listesi ═══ */
.svc-list{display:grid;gap:12px}
.svc{
  display:flex;align-items:center;gap:16px;padding:18px 20px;background:#fff;
  border:1px solid var(--hair);border-radius:var(--radius);
  transition:transform .25s var(--ease),box-shadow .25s var(--ease);
}
.svc:hover{transform:translateY(-2px);box-shadow:var(--shadow-soft)}
.si{color:var(--sub);display:inline-flex;flex:none}
.sn{font-size:17px;font-weight:600;letter-spacing:-.01em}
.sc-cat{font-size:13px;color:var(--sub);margin-top:2px}
.svc-meta{margin-left:auto;text-align:right;flex:none;display:grid;gap:2px}
.svc-dur{font-size:13px;color:var(--sub)}
.svc-price{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.svc-pick{
  flex:none;display:inline-flex;align-items:center;gap:4px;border:none;cursor:pointer;
  background:transparent;color:var(--link);font:inherit;font-size:15px;min-height:44px;padding:4px 6px;
  border-radius:980px;white-space:nowrap;transition:color .15s;
}
.svc-pick:hover{color:var(--blue-h)}
.svc-pick svg{transition:transform .2s var(--ease)}
.svc-pick:hover svg{transform:translateX(3px)}
@media(max-width:640px){
  .svc{flex-wrap:wrap}
  .svc-meta{margin-left:0;text-align:left;width:100%;order:3;display:flex;gap:12px;align-items:baseline}
  .svc-pick{margin-left:auto}
}
.hint{color:var(--sub);font-size:15px;padding:14px 0}
.err-txt{color:var(--err)}

/* ═══ Değerlendirmeler ═══ */
.rev-card{
  display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;
  background:var(--bg2);border-radius:var(--radius);padding:26px 28px;
}
.rev-summary{display:grid;gap:16px}
.rev-avg{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.rev-avg-n{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1}
.rev-stars{color:#f56300;font-size:17px;letter-spacing:2px}
.rev-avg-c{font-size:14px;color:var(--sub)}
.rev-bars{display:grid;gap:6px;max-width:340px;width:100%}
.rev-bar-row{display:grid;grid-template-columns:38px 1fr 28px;align-items:center;gap:10px;font-size:13px;color:var(--sub)}
.rev-bar{display:block;height:4px;border-radius:2px;background:rgba(0,0,0,.08);overflow:hidden}
.rev-bar i{display:block;height:100%;border-radius:2px;background:var(--ink)}
.rev-bar-v{text-align:right;font-variant-numeric:tabular-nums}
.rev-empty{color:var(--sub);font-size:15px;margin:0}
.rev-open{flex:none}
.rev-form{margin-top:16px;background:#fff;border:1px solid var(--hair);border-radius:var(--radius);padding:24px}
.rev-star-row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.rev-star-btn{
  border:1.5px solid var(--hair-strong);background:#fff;border-radius:12px;cursor:pointer;
  font:inherit;font-size:15px;color:#b0b0b5;padding:9px 12px;min-height:44px;min-width:44px;
  transition:all .15s;letter-spacing:1px;
}
.rev-star-btn:hover{border-color:var(--sub)}
.rev-star-btn.on{border-color:#f56300;color:#f56300;background:rgba(245,99,0,.06)}
.rev-list{display:grid;gap:14px;margin-top:18px}
.rev-item{background:#fff;border:1px solid var(--hair);border-radius:var(--radius);padding:22px 24px}
.rev-item-head{display:flex;gap:12px;align-items:center}
.rev-avatar{
  width:40px;height:40px;border-radius:50%;background:var(--bg2);color:var(--ink);
  display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;flex:none;
}
.rev-author{font-size:15px;font-weight:600}
.rev-meta{display:flex;gap:8px;align-items:center;margin-top:2px;font-size:13px;color:var(--sub)}
.rev-stars{color:#f56300;font-size:13px;letter-spacing:1px}
.rev-date{color:var(--sub)}
.rev-text{margin-top:12px;font-size:15px;line-height:1.55;color:var(--ink)}
.rev-reply{margin-top:14px;border-left:2px solid var(--hair-strong);padding-left:14px}
.rev-reply-t{font-size:12px;font-weight:600;color:var(--sub);display:block;margin-bottom:4px}
.rev-reply p{font-size:14px;color:var(--sub);line-height:1.5}
.rev-done{display:grid;gap:8px;text-align:center;padding:34px 10px;background:var(--bg2);border-radius:var(--radius)}
.rev-done h3{font-size:24px;font-weight:600;letter-spacing:-.01em;margin:0}

/* ═══ Formlar ═══ */
.field{display:grid;gap:7px}
.f-label{font-size:14px;font-weight:600;color:var(--ink);letter-spacing:-.005em;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.f-eyebrow{font-size:12px;font-weight:600;color:var(--sub);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:3px}
input,select,textarea{
  font:inherit;font-size:17px;color:var(--ink);width:100%;
  border:1px solid var(--hair-strong);border-radius:12px;padding:12px 14px;min-height:48px;
  background:#fff;transition:border-color .2s,box-shadow .2s;
}
textarea{min-height:96px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3.5px rgba(0,113,227,.22)}
input::placeholder,textarea::placeholder{color:#b0b0b5}
select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' stroke='%2386868b' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:38px}
.form-err{font-size:14px;color:var(--err);font-weight:400}
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}

/* ═══ Randevu kartı ═══ */
.book-card{
  background:#fff;border:1px solid var(--hair);border-radius:var(--radius-lg);
  padding:30px 28px 28px;display:grid;gap:26px;
  box-shadow:0 2px 12px rgba(0,0,0,.03);
}
@media(min-width:720px){.book-card{padding:40px 44px 36px}}
.book-card>*{min-width:0} /* grid öğeleri içerik min-content'iyle track'i şişirmesin (mobil tarih şeridi düzeltmesi) */
.book-card>.section-title{margin:0;text-align:center}
.dates{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
@media(max-width:640px){
  .dates{display:flex;overflow-x:auto;gap:8px;padding-bottom:6px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .dates::-webkit-scrollbar{display:none}
  .date-btn{flex:0 0 auto;width:76px}
}
.date-btn{
  display:grid;gap:2px;justify-items:center;padding:10px 6px;border-radius:14px;
  border:1px solid var(--hair-strong);background:#fff;cursor:pointer;font:inherit;min-height:64px;
  transition:all .18s var(--ease);align-content:center;
}
.date-btn:hover{border-color:var(--sub)}
.date-btn.on{background:var(--blue);border-color:var(--blue)}
.date-btn.on .dw,.date-btn.on .dn{color:#fff}
.dw{font-size:12px;color:var(--sub);font-weight:500}
.dn{font-size:15px;font-weight:600;color:var(--ink);white-space:nowrap}
.quick-slot{
  display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 18px;border-radius:980px;
  border:1px solid rgba(0,113,227,.4);background:rgba(0,113,227,.06);color:var(--blue);
  font:inherit;font-size:14px;font-weight:500;cursor:pointer;min-height:44px;transition:all .15s;
}
.quick-slot:hover{background:var(--blue);border-color:var(--blue);color:#fff}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.slot{
  border:1px solid var(--hair-strong);background:#fff;border-radius:980px;cursor:pointer;
  font:inherit;font-size:15px;font-weight:400;color:var(--ink);padding:10px 8px;min-height:44px;
  transition:all .18s var(--ease);font-variant-numeric:tabular-nums;
}
.slot:hover:not(:disabled){border-color:var(--sub)}
.slot.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:500}
.slot:disabled{color:#c7c7cc;cursor:not-allowed;border-color:var(--hair);text-decoration:line-through}
.slotload{grid-column:1/-1;display:flex;gap:10px;align-items:center;color:var(--sub);font-size:15px;padding:8px 0}
.sumline{
  font-size:15px;color:var(--sub);background:var(--bg2);border-radius:14px;padding:14px 18px;
}
.sumline b{color:var(--ink);font-weight:600}
.wl-teaser{
  display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:10px 16px;border-radius:980px;
  border:1px dashed var(--hair-strong);background:transparent;color:var(--link);
  font:inherit;font-size:14px;cursor:pointer;min-height:44px;transition:all .15s;
}
.wl-teaser:hover{border-color:var(--blue);background:rgba(0,113,227,.05)}
/* başarı kartı */
.success{display:grid;gap:18px;text-align:center;justify-items:center;padding:16px 0}
.success .okmark{
  width:64px;height:64px;border-radius:50%;background:rgba(52,168,83,.12);color:#1e7e34;
  display:flex;align-items:center;justify-content:center;
}
.success h2{font-size:clamp(24px,3.4vw,34px);font-weight:700;letter-spacing:-.02em}
.sumcard{
  width:100%;max-width:440px;background:var(--bg2);border-radius:var(--radius);padding:8px 22px;text-align:left;
}
.sumrow{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--hair);font-size:15px}
.sumrow:last-child{border-bottom:none}
.sumrow .k{color:var(--sub)}
.sumrow .v{font-weight:500;text-align:right}
.s-actions{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:4px}
.okmark{display:inline-flex}
/* bekleme listesi */
.wl-box{margin-top:8px;padding-top:26px;border-top:1px solid var(--hair)}
.wl-title{font-size:21px;font-weight:600;letter-spacing:-.01em;margin:0 0 6px}
.wl-sub{font-size:15px;color:var(--sub);margin:0 0 18px}
.wl-grid{display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:560px){.wl-grid{grid-template-columns:1fr 1fr}}
.wl-done{display:grid;gap:10px;text-align:center;padding:26px 6px}
.wl-done h3{font-size:24px;font-weight:600;letter-spacing:-.01em}
.wl-done .sub{font-size:15px}

/* ═══ Sticky mobil CTA (≤760px; embed'de yok) ═══ */
.mcta{
  display:none;position:fixed;left:0;right:0;bottom:0;z-index:80;gap:10px;
  background:rgba(255,255,255,.9);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);
  border-top:1px solid var(--hair);padding:8px 14px calc(8px + env(safe-area-inset-bottom,0px));
}
.mcta-btn{
  flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:48px;
  border-radius:980px;font:inherit;font-weight:400;font-size:16px;text-decoration:none;
}
.mcta-call{background:transparent;border:1px solid var(--hair-strong);color:var(--ink)}
.mcta-book{background:var(--blue);color:#fff}
@media(max-width:760px){
  body:not(.embed){padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}
  body:not(.embed) .mcta{display:flex}
}

/* ═══ Üyelik sayfası ═══ */
.mem-hero{padding:64px 0 30px;text-align:center;display:grid;gap:12px;justify-items:center}
.mem-hero h1{font-size:clamp(30px,5vw,52px);font-weight:700;letter-spacing:-.025em;line-height:1.07;margin:0}
.mem-hero p{color:var(--sub);font-size:17px;max-width:52ch;margin:0;line-height:1.5}
.mem-wrap{display:grid;gap:14px;max-width:560px;margin:0 auto;width:100%}
.mem-card{background:#fff;border:1px solid var(--hair);border-radius:var(--radius-lg);padding:28px}
.mem-tabs{
  display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--bg2);
  border-radius:12px;padding:4px;margin-bottom:22px;
}
.mem-tab{
  border:none;background:transparent;font:inherit;font-size:15px;font-weight:500;color:var(--sub);
  border-radius:9px;padding:9px 10px;cursor:pointer;min-height:44px;transition:all .18s var(--ease);
}
.mem-tab.on{background:#fff;color:var(--ink);box-shadow:0 1px 5px rgba(0,0,0,.1)}
.mem-profile{display:flex;align-items:center;gap:14px}
.mem-avatar{
  width:52px;height:52px;border-radius:50%;background:var(--bg2);color:var(--ink);
  display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600;flex:none;
}
.mem-id .n{font-size:19px;font-weight:600;letter-spacing:-.01em}
.mem-id .p{font-size:14px;color:var(--sub);margin-top:2px}
.mem-actions{display:flex;gap:12px;margin-top:18px;flex-wrap:wrap}
.mem-danger{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid var(--hair)}
.del-btn{
  border:1px solid rgba(222,49,49,.4);background:transparent;color:var(--err);border-radius:980px;
  padding:9px 18px;font:inherit;font-size:14px;font-weight:400;cursor:pointer;min-height:44px;transition:all .15s;
}
.del-btn:hover{background:rgba(222,49,49,.06)}
/* randevu satırları */
.appt{display:flex;gap:14px;align-items:flex-start}
.appt-main{flex:1;min-width:0}
.appt-biz{font-weight:600;font-size:17px;letter-spacing:-.01em}
.appt-biz a{color:inherit;text-decoration:none}
.appt-biz a:hover{color:var(--blue)}
.appt-svc{color:var(--sub);font-size:14px;margin:3px 0 4px}
.appt-when{font-weight:500;font-size:15px;color:var(--ink)}
.appt-code{font-size:12px;color:var(--sub);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:4px}
.st-badge{
  display:inline-flex;align-items:center;font-size:12px;font-weight:500;padding:4px 11px;
  border-radius:980px;white-space:nowrap;background:var(--bg2);color:var(--sub);
}
.st-beklemede{background:rgba(245,159,11,.12);color:#9a6700}
.st-onaylandi{background:rgba(52,168,83,.12);color:#1e7e34}
.st-tamamlandi{background:rgba(0,113,227,.1);color:var(--blue)}
.st-gelmedi{background:var(--bg2);color:var(--sub)}
.st-iptal{background:rgba(222,49,49,.1);color:var(--err)}
.appt-cancel,.appt-replan,.appt-review{
  border:1px solid var(--hair-strong);background:#fff;color:var(--ink);border-radius:980px;
  padding:8px 16px;font:inherit;font-size:13px;font-weight:400;cursor:pointer;min-height:44px;
  transition:all .15s;white-space:nowrap;
}
.appt-cancel:hover,.appt-replan:hover,.appt-review:hover{border-color:var(--sub)}
.appt-review{color:var(--link)}
.appt-review:hover{border-color:rgba(0,113,227,.5);color:var(--blue-h)}
.appt-ics{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;
  border:1px solid var(--hair-strong);background:#fff;color:var(--ink);border-radius:980px;
  padding:8px 16px;font:inherit;font-size:13px;cursor:pointer;transition:all .15s;text-decoration:none;white-space:nowrap;
}
.appt-ics:hover{border-color:var(--sub);color:var(--ink)}
.empty-box{text-align:center;padding:36px 18px;color:var(--sub);font-size:15px;line-height:1.55}
/* hatırlatıcı tercihi */
.rem-pref{margin:2px 0}
.rem-row{
  display:flex;align-items:center;gap:14px;width:100%;min-height:56px;background:#fff;
  border:1px solid var(--hair);border-radius:var(--radius);padding:12px 18px;cursor:pointer;
  font:inherit;text-align:left;transition:border-color .15s;
}
.rem-row:hover{border-color:var(--hair-strong)}
.rem-ic{color:var(--ink);display:inline-flex;flex:none}
.rem-txt{flex:1;min-width:0}
.rem-txt b{display:block;font-size:15px;font-weight:600}
.rem-sub{display:block;font-size:13px;color:var(--sub);margin-top:1px}
.rem-sw{flex:none;width:48px;height:29px;border-radius:980px;background:rgba(0,0,0,.12);position:relative;transition:background .2s}
.rem-knob{position:absolute;top:2px;left:2px;width:25px;height:25px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);transition:transform .2s var(--ease)}
.rem-row[aria-checked="true"] .rem-sw{background:var(--ok)}
.rem-row[aria-checked="true"] .rem-knob{transform:translateX(19px)}
.rem-note{font-size:12px;color:var(--sub);margin:8px 4px 0}
/* hesap silme + değerlendirme diyalogları */
.del-overlay{
  position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.48);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;padding:16px;
}
.del-box{background:#fff;border-radius:var(--radius-lg);box-shadow:0 24px 80px rgba(0,0,0,.3);padding:28px;max-width:440px;width:100%;display:grid;gap:14px}
.del-box h2{font-size:21px;font-weight:600;letter-spacing:-.01em}
.del-box p{font-size:15px;color:var(--sub);line-height:1.5}
.del-box .warn{background:rgba(222,49,49,.06);border:1px solid rgba(222,49,49,.2);border-radius:12px;padding:12px 14px;font-weight:400;color:var(--err);font-size:14px}
.del-confirm{background:var(--err);color:#fff}
.del-confirm:hover:not(:disabled){background:#c52525;color:#fff}
.del-actions{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;margin-top:4px}
.rev-ov-summary{font-size:15px;color:var(--sub);line-height:1.5}
/* damga kartları */
.sc-card{position:relative}
.sc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sc-biz{font-weight:600;font-size:17px;letter-spacing:-.01em}
.sc-dots{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 12px}
.sc-dot{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:600;flex:none;box-sizing:border-box}
.sc-dot.full{background:var(--ink);color:#fff}
.sc-dot.empty{background:transparent;border:1.5px dashed var(--hair-strong);color:transparent}
.sc-reward{margin:0;font-size:14px;font-weight:400;color:var(--sub);background:var(--bg2);border-radius:12px;padding:11px 15px;line-height:1.45}
.sc-won{flex:none;display:inline-block;font-size:12px;font-weight:500;background:rgba(52,168,83,.12);color:#1e7e34;border-radius:980px;padding:4px 12px;white-space:nowrap}
/* bekleme durumum */
.wlq-wrap{max-width:560px;margin:44px auto 0;width:100%}
.wlq-row{display:flex;gap:10px;flex-wrap:wrap}
.wlq-row input{flex:1;min-width:200px}
.wl-card{
  display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;
  border:1px solid var(--hair);border-radius:var(--radius);padding:16px 18px;margin-top:10px;
}
.wl-card-main{min-width:0}
.wl-card-biz{font-weight:600;font-size:16px}
.wl-card-svc{font-size:13px;color:var(--sub);margin-top:2px}
.wl-st{flex:none;border-radius:980px;padding:5px 13px;font-size:12px;font-weight:500;white-space:nowrap}
.wl-st-waiting{background:rgba(245,159,11,.12);color:#9a6700}
.wl-st-notified{background:rgba(0,113,227,.1);color:var(--blue)}
.wl-st-booked{background:rgba(52,168,83,.12);color:#1e7e34}

/* ═══ 404 / 500 ═══ */
.center-page{min-height:60vh;display:flex;align-items:center;justify-content:center;padding:40px 0}
.center-card{text-align:center;display:grid;gap:14px;justify-items:center}
.center-card h1{font-size:clamp(30px,5vw,52px);font-weight:700;letter-spacing:-.025em;line-height:1.08;margin:0}
.center-card p{color:var(--sub);font-size:17px;max-width:52ch;line-height:1.5;margin:0}
.nf-search{display:flex;gap:10px;max-width:440px;margin:14px auto 4px;width:100%}
.nf-search input{flex:1;min-width:0}
.nf-search .btn{padding:10px 20px;font-size:15px}
.nf-sub{font-size:13px;color:var(--sub);margin:8px 0 0;line-height:1.5}
.nf-sugg{margin-top:28px;text-align:left;width:100%}
.nf-sugg h2{font-size:21px;font-weight:600;letter-spacing:-.01em;margin:0 0 14px;text-align:center}
.nf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.nf-item{
  display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--hair);
  border-radius:var(--radius);padding:14px 16px;text-decoration:none;
  transition:transform .25s var(--ease),box-shadow .25s var(--ease);
}
.nf-item:hover{transform:translateY(-3px);box-shadow:var(--shadow-soft)}
.nf-ic{color:var(--sub);display:inline-flex;flex:none}
.nf-nm{font-weight:600;font-size:15px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nf-svc{display:inline-block;margin-top:4px;font-size:12px;font-weight:500;color:var(--blue);background:rgba(0,113,227,.08);border-radius:980px;padding:2px 10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nf-loc{font-size:12px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;margin-top:2px}

/* ═══ Footer: Apple sadeliği ═══ */
footer.ft{margin-top:auto;border-top:1px solid var(--hair);background:var(--bg2)}
.ft-in{max-width:1024px;margin:0 auto;padding:20px 22px 28px}
.ft-cols{display:grid;grid-template-columns:1fr;gap:18px}
@media(min-width:640px){.ft-cols{grid-template-columns:repeat(3,1fr);gap:24px}}
.ft-col h3{font-size:12px;font-weight:600;color:var(--ink);margin:0 0 10px}
.ft-col a{display:block;font-size:12px;color:var(--sub);text-decoration:none;padding:4px 0;min-height:20px}
.ft-col a:hover{color:var(--ink)}
.ft-legal{
  margin-top:20px;padding-top:14px;border-top:1px solid var(--hair);
  display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--sub);
}
.ft-legal .fl{white-space:nowrap}
.ft-legal .fr{white-space:nowrap}

/* ═══ Toast + spinner ═══ */
#toast{
  position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom,0px));transform:translate(-50%,16px);
  z-index:300;background:var(--ink);color:#fff;font-size:14px;font-weight:400;
  border-radius:980px;padding:11px 20px;max-width:min(88vw,480px);text-align:center;
  opacity:0;pointer-events:none;transition:opacity .3s var(--ease),transform .3s var(--ease);
  box-shadow:0 12px 40px rgba(0,0,0,.28);
}
#toast.show{opacity:1;transform:translate(-50%,0)}
#toast.ok{background:var(--ink)}
#toast.err{background:var(--err)}
#toast.warn{background:#9a6700}
.spin{
  display:inline-block;width:16px;height:16px;border-radius:50%;
  border:2px solid rgba(255,255,255,.35);border-top-color:#fff;
  animation:spin .7s linear infinite;vertical-align:-3px;
}
.spin.dark{border-color:rgba(0,0,0,.12);border-top-color:var(--ink)}
@keyframes spin{to{transform:rotate(360deg)}}

/* ═══ Widget / embed modu ═══ */
body.embed{background:#fff}
body.embed .page{min-height:auto;padding:0}
body.embed header.top,
body.embed .crumb,
body.embed footer.ft,
body.embed .embed-hide{display:none !important}
body.embed main{padding:12px 12px 26px;max-width:100%}
body.embed .dwrap{padding-top:0;gap:34px}
body.embed .bhero{margin:0 -12px;min-height:220px;border-radius:0}
body.embed .bhead{padding:24px 0 4px}
body.embed .mcta{display:none !important}
body.embed .book-card{padding:22px 18px 20px}
body.embed .hero-shot-fade{display:none}
body.embed .hero-shot-media{aspect-ratio:4/3}

/* backdrop-filter yoksa düz yüzey */
@supports not ((backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px))){
  header.top{background:#fff}
  .mcta{background:#fff}
}
`;

// ---------------------------------------------------------------- Ortak sayfa parçaları

/** Sayfa sonu gömülü motion script'i: reveal (IO) + ince parallax (rAF).
 *  JS kapalıysa / reduce-motion'da içerik anında görünür kalır. */
const MOTION_JS = `<script>
(function () {
  var d = document, w = window;
  var rm = false;
  try { rm = w.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var els = d.querySelectorAll('.reveal, .reveal-group');
  if (rm || !('IntersectionObserver' in w)) {
    for (var i = 0; i < els.length; i++) els[i].classList.add('in');
  } else {
    var io = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (entries[k].isIntersecting) { entries[k].target.classList.add('in'); io.unobserve(entries[k].target); }
      }
    }, { threshold: 0.15 });
    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }
  if (rm || !('IntersectionObserver' in w)) return;
  var pxEls = [].slice.call(d.querySelectorAll('.hero-shot-img, .bhero-img'));
  if (!pxEls.length) return;
  var vis = [];
  var io2 = new IntersectionObserver(function (es) {
    for (var m = 0; m < es.length; m++) {
      var idx = vis.indexOf(es[m].target);
      if (es[m].isIntersecting && idx === -1) vis.push(es[m].target);
      else if (!es[m].isIntersecting && idx > -1) vis.splice(idx, 1);
    }
  });
  for (var n = 0; n < pxEls.length; n++) io2.observe(pxEls[n]);
  var ticking = false;
  function apply() {
    ticking = false;
    var sy = w.scrollY || w.pageYOffset || 0;
    for (var q = 0; q < vis.length; q++) {
      var el = vis[q];
      var top = el.getBoundingClientRect().top + sy;
      var rel = sy - top;
      var py = Math.max(-64, Math.min(64, rel * 0.15));
      el.style.setProperty('--py', py.toFixed(1) + 'px');
    }
  }
  function onScroll() { if (!ticking) { ticking = true; w.requestAnimationFrame(apply); } }
  w.addEventListener('scroll', onScroll, { passive: true });
  apply();
})();
</script>`;

function pageShell(o: { title: string; desc: string; body: string; scripts?: string[]; extraCss?: string[]; gwPort?: string | null; bodyClass?: string }): string {
  // Sürüm parametresi: CSS/JS içeriğinin djb2 özeti — içerik değişince URL değişir,
  // tarayıcı/heuristik önbellek eski stili servis edemez (cache-busting).
  let _vh = 5381;
  const _verSrc = STYLE_CSS + '\u0000' + HOME_JS + '\u0000' + DETAIL_JS + '\u0000' + MEMBER_JS;
  for (let i = 0; i < _verSrc.length; i++) _vh = ((_vh << 5) + _vh + _verSrc.charCodeAt(i)) >>> 0;
  const VER = _vh.toString(36);
  // Gateway (XTransformPort) ile açıldıysa göreli varlık URL'lerine param ekle —
  // aksi hâlde /assets/* istekleri gateway'den CRM'e düşer ve 404 olur.
  const gw = (p: string) => {
    const withVer = p + (p.includes('?') ? '&' : '?') + 'v=' + VER;
    return o.gwPort ? withVer + '&XTransformPort=' + encodeURIComponent(o.gwPort) : withVer;
  };
  const scripts = (o.scripts || []).map((s) => `<script src="${gw(s)}" defer></script>`).join('\n  ');
  const extraCss = (o.extraCss || []).map((s) => `<link rel="stylesheet" href="${gw(s)}">`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${gw(FAVICON)}">
<link rel="stylesheet" href="${gw('/assets/style.css')}">
  ${extraCss}
<script>document.documentElement.classList.add('js')</script>
</head>
<body${o.bodyClass ? ` class="${o.bodyClass}"` : ''}>
<div class="page">
${o.body}
</div>
<div id="toast" role="status" aria-live="polite"></div>
${MOTION_JS}
  ${scripts}
</body>
</html>`;
}

/** Gateway uyumlu varlık/görsel URL'i (XTransformPort). */
function assetUrl(p: string, gwPort?: string | null): string {
  return gwPort ? p + (p.includes('?') ? '&' : '?') + 'XTransformPort=' + encodeURIComponent(gwPort) : p;
}

/** Üyelik sayfası linki — gateway parametresiyle. */
function memberHref(gwPort?: string | null): string {
  return assetUrl('/uyelik', gwPort);
}

/** Apple tarzı logo (mark + kelime). */
function logoMark(href: string, word = true): string {
  return `<a class="logo" href="${esc(href)}" aria-label="GNC Randevu ana sayfa"><span class="logo-mark" aria-hidden="true">G</span>${word ? '<span class="logo-word">GNC Randevu</span>' : ''}</a>`;
}

function siteFooter(gwPort?: string | null): string {
  return `<footer class="ft">
  <div class="ft-in">
    <div class="ft-cols">
      <div class="ft-col">
        <h3>Keşfet</h3>
        <a href="/#isletmeler">Tüm işletmeler</a>
        <a href="/#harita">Haritada keşfet</a>
        <a href="/">Ana sayfa</a>
      </div>
      <div class="ft-col">
        <h3>Hesap</h3>
        <a href="${esc(memberHref(gwPort))}">Giriş / Kayıt</a>
        <a href="${esc(memberHref(gwPort))}">Randevularım</a>
        <a href="${esc(memberHref(gwPort))}">Bekleme durumum</a>
      </div>
      <div class="ft-col">
        <h3>GNC Randevu</h3>
        <p style="font-size:12px;color:var(--sub);line-height:1.5;margin:0">Berberden dişçiye, kuaförden spaya — yakınındaki işletmeler ve online randevular tek yerde.</p>
      </div>
    </div>
    <div class="ft-legal">
      <span class="fl">GNC Randevu — tüm işletmeler tek yerde</span><span aria-hidden="true">·</span><span class="fr">Türkçe · Mobil uyumlu</span>
    </div>
  </div>
</footer>`;
}

// ---------------------------------------------------------------- ANA SAYFA

export function homePage(baseDomain: string, gwPort?: string | null): string {
  const cfg = jsonIsland({ baseDomain });
  const chips: Array<[string, string]> = [
    ['', 'Tümü'],
    ['berber', 'Berber'],
    ['kuafor', 'Kuaför'],
    ['disci', 'Dişçi'],
    ['guzellik', 'Güzellik'],
    ['spa', 'Spa'],
    ['dovme', 'Dövme'],
  ];
  const chipHtml = chips
    .map(([v, l], i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-type="${v}" ${v ? '' : 'aria-pressed="true"'}>${l}</button>`)
    .join('');

  const body = `<header class="top">
  <div class="top-in">
    ${logoMark('/')}
    <nav class="nav-links" aria-label="Bölümler">
      <a href="#kesfet">Keşfet</a>
      <a href="#isletmeler">İşletmeler</a>
      <a href="#harita">Harita</a>
    </nav>
    <div class="nav-tools">
      <div class="search">
        <span class="s-ic" aria-hidden="true">${icon('search', 13)}</span>
        <input type="search" id="q" placeholder="İşletme veya hizmet ara" aria-label="İşletme ara" autocomplete="off">
      </div>
      <a class="member-btn" id="member-btn" href="${esc(memberHref(gwPort))}">Giriş</a>
    </div>
  </div>
</header>
<main>
  <section class="hero" aria-label="Tanıtım">
    <h1>Randevun, bir dokunuş uzağında.</h1>
    <p>Yakınındaki berber, kuaför, dişçi ve spa işletmelerini keşfet; hizmetini seç, uygun saati yakala.</p>
    <div class="hero-ctas">
      <a class="btn btn-primary" href="#isletmeler">Randevu Al</a>
      <a class="link-more" href="#kesfet">Keşfet ${icon('chevR', 14)}</a>
    </div>
    <button type="button" class="btn-link" id="geo-btn">${icon('pin', 15)} Konumuma göre en yakını bul ${icon('chevR', 14)}</button>
    <p class="loc-status" id="loc-status" role="status" aria-live="polite"></p>
  </section>

  <figure class="hero-shot reveal" aria-label="Bir salondan kare">
    <div class="hero-shot-media">
      <img class="hero-shot-img" src="${esc(assetUrl('/assets/img/hero-salon.jpg', gwPort))}" alt="Aydınlık ve minimal bir kuaför salonunun içi" width="1344" height="768" fetchpriority="high">
      <span class="hero-shot-fade" aria-hidden="true"></span>
      <figcaption class="hero-shot-cap">Şık Kuaför &amp; Berber Salonu · Kadıköy</figcaption>
    </div>
  </figure>

  <section class="features reveal-group" id="kesfet" aria-label="Öne çıkanlar">
    <div class="feature"><span class="feature-ic">${icon('bolt', 28)}</span><b>Saniyeler içinde</b><span>Hizmeti seç, takvimden günü ve saati yakala; randevun anında oluşur.</span></div>
    <div class="feature"><span class="feature-ic">${icon('user', 28)}</span><b>Üyeliksiz de olur</b><span>Adın ve telefonun yeterli — dilediğinde üye olup tüm randevularını tek ekranda gör.</span></div>
    <div class="feature"><span class="feature-ic">${icon('pin', 28)}</span><b>En yakını bul</b><span>Konumunu paylaş; mesafeleri görüp sana en uygun işletmeye git.</span></div>
  </section>

  <section id="isletmeler" aria-labelledby="biz-h" style="padding-top:64px">
    <div class="reveal">
      <h2 class="sec-h" id="biz-h">Yakınındaki işletmeler.</h2>
      <p class="sec-sub" style="margin-bottom:26px">Filtrele, ara, karşılaştır — sonra tek dokunuşla randevunu al.</p>
      <div class="filters-row">
        <div class="chips" id="chips" aria-label="İşletme türü filtresi">${chipHtml}</div>
        <label class="city-wrap"><span class="sr-only">Şehir filtresi</span><select id="city" aria-label="Şehir seç"><option value="">Tüm şehirler</option></select></label>
      </div>
    </div>
    <p class="count" id="count" role="status">İşletmeler yükleniyor…</p>
    <section class="grid" id="grid" aria-label="İşletme listesi" aria-live="polite">
      ${Array.from({ length: 8 })
        .map(
          () => `<div class="sk" aria-hidden="true"><div class="sc"></div><div class="sb"><div class="sk-line w60"></div><div class="sk-line w80"></div><div class="sk-line"></div></div></div>`
        )
        .join('')}
    </section>
    <noscript><p class="state-box">Bu site randevuları canlı göstermek için JavaScript kullanır — tarayıcında JavaScript'i etkinleştirip yenile.</p></noscript>
  </section>

  <section class="dark-section reveal" aria-label="Ustalık">
    <h2 class="sec-h">Ustalık, ayrıntıda gizlidir.</h2>
    <p class="sec-sub">Her işletmenin portföyü, ekibi ve çalışma saatleri kendi vitrin sayfasında — keşfetmeye devam et.</p>
    <a class="link-more" href="#isletmeler">Vitrinleri keşfet ${icon('chevR', 14)}</a>
    <img class="dark-img" src="${esc(assetUrl('/assets/img/craft-dark.jpg', gwPort))}" alt="Siyah zeminde berber makası ve tarak detay çekimi" loading="lazy" width="1344" height="768">
  </section>

  <section id="harita" style="padding-top:8px" aria-label="İşletme haritası">
    <div class="map-card reveal">
      <div class="map-head">
        <h2>Haritada işletmeler</h2>
        <button type="button" class="map-toggle" id="map-toggle" aria-expanded="true" aria-controls="biz-map">Haritayı gizle</button>
      </div>
      <div id="biz-map" class="biz-map" role="application" aria-label="İşletmelerin harita üzerinde konumları"></div>
      <p class="map-hint" id="map-hint">Konum izni verirsen konumun da haritada görünür, en yakın işletme mavi pinle vurgulanır.</p>
    </div>
  </section>
</main>
${siteFooter(gwPort)}`;

  const shell = pageShell({
    title: 'GNC Randevu — Yakınındaki Berber, Kuaför, Dişçi ve Spa İşletmeleri',
    desc: 'Konumuna göre en yakın berber, kuaför, dişçi, güzellik salonu, spa ve dövme stüdyolarını bul; online randevunu saniyeler içinde oluştur.',
    body,
    extraCss: ['/assets/leaflet/leaflet.css'],
    scripts: ['/assets/leaflet/leaflet.js', '/assets/home.js'],
    gwPort,
  });

  // cfg adasını <main> başına değil body başına koy: defer script'ten Önce tanımlı olsun
  return shell.replace('</main>', `<script id="page-cfg" type="application/json">${cfg}</script>\n</main>`);
}

// ---------------------------------------------------------------- DETAY SAYFASI

const DAY_TR: Array<[string, string]> = [
  ['mon', 'Pazartesi'],
  ['tue', 'Salı'],
  ['wed', 'Çarşamba'],
  ['thu', 'Perşembe'],
  ['fri', 'Cuma'],
  ['sat', 'Cumartesi'],
  ['sun', 'Pazar'],
];

export function detailPage(a: {
  provider: Json; services: Json[]; photos: Json[]; staff: Json[];
  reviews?: { items: Json[]; summary: Json } | null;
  homeUrl: string; gwPort?: string | null; embed?: boolean;
}): string {
  // vitrin (tur4): portföy + ekip — güvenli varsayılanlarla al (upstream uyumu)
  const photos: Json[] = Array.isArray(a.photos) ? a.photos : [];
  const staff: Json[] = Array.isArray(a.staff) ? a.staff : [];
  const p = a.provider;
  const meta = typeMeta(p.type);
  const wh = (p.workingHours && typeof p.workingHours === 'object') ? p.workingHours : {};

  const hoursRows = DAY_TR.map(([k, label]) => {
    const d = wh[k];
    const open = d && !d.closed && d.start && d.end;
    const val = open ? `${d.start} – ${d.end}` : '';
    return `<tr data-day="${k}"><td>${label}</td><td class="t-time${open ? '' : ' closed'}">${open ? val : 'Kapalı'}</td></tr>`;
  }).join('');

  const nSvc = a.services.length;
  const prices = a.services.map((s) => s.price).filter((x: unknown) => typeof x === 'number');
  const minP = prices.length ? Math.min(...prices) : null;

  // ---- değerlendirmeler (SSR) ----
  const revItems: Json[] = Array.isArray((a.reviews?.items as Json[] | undefined)) ? (a.reviews!.items as Json[]) : [];
  const revSum = a.reviews?.summary ?? {};
  const revCount = Number(revSum.count ?? 0) || 0;
  const revAvg = Number(revSum.average ?? 0) || 0;
  const revDist: Record<string, number> = (revSum.distribution && typeof revSum.distribution === 'object')
    ? (revSum.distribution as Record<string, number>) : {};
  const fmtAvg = revCount > 0 ? revAvg.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
  const ratingBadge = revCount > 0
    ? `<a class="rate-badge" href="#degerlendirmeler" aria-label="Ortalama puan ${fmtAvg} — ${revCount} değerlendirme">
        <span class="rate-badge-s" aria-hidden="true">★</span> <b>${fmtAvg}</b>
        <span class="rate-badge-c">${revCount} değerlendirme</span>
      </a>`
    : `<a class="rate-badge rate-new" href="#degerlendirmeler">Yeni — ilk değerlendiren sen ol</a>`;
  const starsOf = (r: number) => '★'.repeat(Math.max(0, Math.min(5, r))) + '☆'.repeat(Math.max(0, 5 - r));
  const fmtRevDate = (iso: unknown): string => {
    const d = new Date(String(iso || ''));
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  };
  const distRows = [5, 4, 3, 2, 1].map((star) => {
    const c = Number(revDist[String(star)] ?? 0) || 0;
    const pct = revCount > 0 ? Math.round((c / revCount) * 100) : 0;
    return `<div class="rev-bar-row" aria-label="${star} yıldız: ${c} değerlendirme">
      <span class="rev-bar-l">${star} ★</span>
      <span class="rev-bar"><i style="width:${pct}%"></i></span>
      <span class="rev-bar-v">${c}</span>
    </div>`;
  }).join('');
  const revCards = revItems.map((r) => {
    const rating = Math.max(1, Math.min(5, Number(r.rating) || 0));
    const reply = r.staffReply
      ? `<div class="rev-reply"><span class="rev-reply-t">İşletme yanıtı</span><p>${esc(r.staffReply)}</p></div>`
      : '';
    return `<article class="rev-item">
      <div class="rev-item-head">
        <span class="rev-avatar" aria-hidden="true">${esc(String(r.authorName || 'M').trim().charAt(0).toLocaleUpperCase('tr'))}</span>
        <div style="min-width:0;flex:1">
          <div class="rev-author">${esc(r.authorName)}</div>
          <div class="rev-meta"><span class="rev-stars" role="img" aria-label="5 üzerinden ${rating} puan">${starsOf(rating)}</span> <span class="rev-date">${esc(fmtRevDate(r.createdAt))}</span></div>
        </div>
      </div>
      ${r.comment ? `<p class="rev-text">${esc(r.comment)}</p>` : ''}
      ${reply}
    </article>`;
  }).join('');

  // ---- vitrin (tur5): kapak + altında başlık + hakkımızda + portföy + ekip + mobil CTA ----
  const tKey = TYPE_META[p.type] ? p.type : 'def';
  const phoneHref = p.phone ? 'tel:' + String(p.phone).replace(/\s+/g, '') : '';

  // HERO — Apple ürün sayfası düzeni: tam genişlik kapak, başlık görselin ALTINDA
  const heroSection = `
    <section class="bhero" aria-label="${esc(p.name)} tanıtımı">
      ${p.photo
        ? `<img class="bhero-img" src="${esc(p.photo)}" alt="${esc(p.name)} — kapak fotoğrafı" onerror="this.remove()">`
        : `<span class="bhero-glyph" aria-hidden="true">${icon(meta.icon, 96)}</span>`}
      <span class="bhero-ov" aria-hidden="true"></span>
    </section>
    <div class="bhead">
      <p class="bhead-type">${esc(meta.label)}${p.city ? ' · ' + esc(p.city) : ''}</p>
      <h1 class="bhead-title">${esc(p.name)}</h1>
      <div class="bhead-meta">
        ${ratingBadge}
        ${nSvc ? `<span>${nSvc} hizmet</span>` : ''}
        ${minP !== null ? `<span>min. ${(minP as number).toLocaleString('tr-TR')} ₺</span>` : ''}
        <span class="open-chip" id="open-now">Çalışma saatleri aşağıda</span>
      </div>
      ${p.address ? `<p class="bhead-addr">${esc(p.address)}</p>` : ''}
      <div class="bhead-actions">
        ${nSvc ? `<a class="btn btn-primary" href="#randevu">Randevu Al</a>` : ''}
        ${p.phone ? `<a class="btn-link" href="${esc(phoneHref)}">${icon('phone', 15)} Ara</a>` : ''}
      </div>
    </div>`;

  // HAKKIMIZDA — p.about doluysa
  const aboutText = String(p.about ?? '').trim();
  const aboutSection = aboutText
    ? `<section class="about-card reveal" aria-labelledby="about-h">
        <h2 class="section-title" id="about-h">Hakkımızda</h2>
        <p class="about-text">${esc(aboutText)}</p>
      </section>`
    : '';

  // PORTFÖY — fotoğraf galerisi + lightbox (foto verisi YALNIZ DOM'da;
  // JS'e JSON gömülmez — sayfa boyutunu ikiye katlamamak için)
  const PF_CATS: Record<string, string> = {
    kesim: 'Kesim', 'sac-boyama': 'Saç Boyama', sakal: 'Sakal', stil: 'Stil',
    salon: 'Salon', ekip: 'Ekip', diger: 'Diğer',
  };
  const pfCatOf = (ph: Json) => String(ph.category ?? '').trim();
  const pfItems = photos
    .map((ph, i) => {
      const cat = pfCatOf(ph);
      const catLabel = PF_CATS[cat] || null;
      const title = String(ph.title ?? '').trim();
      const cap = String(ph.caption ?? '').trim();
      const alt = title || 'Portföy fotoğrafı ' + (i + 1);
      return `<button type="button" class="pf-item" data-idx="${i}" data-cat="${esc(cat)}" data-title="${esc(title)}" data-cap="${esc(cap)}" aria-label="${esc(alt)}${catLabel ? ' — ' + esc(catLabel) : ''} — büyütmek için tıkla">
        <img src="${esc(ph.url)}" alt="${esc(alt)}" loading="lazy">
        <span class="pf-ov" aria-hidden="true"></span>
        ${title ? `<span class="pf-cap">${esc(title)}</span>` : ''}
        ${catLabel ? `<span class="pf-cat">${esc(catLabel)}</span>` : ''}
      </button>`;
    })
    .join('');
  const pfCats = [...new Set(photos.map(pfCatOf).filter(Boolean))];
  const pfChips = ['<button type="button" class="chip pf-chip on" data-cat="" aria-pressed="true">Tümü</button>']
    .concat(pfCats.map((c) => `<button type="button" class="chip pf-chip" data-cat="${esc(c)}">${esc(PF_CATS[c] || c)}</button>`))
    .join('');
  const portfoySection = photos.length
    ? `<section id="portfoy" class="reveal" aria-labelledby="pf-h">
        <h2 class="section-title" id="pf-h">Portföyümüz <span class="mini-note">${photos.length} fotoğraf</span></h2>
        <div class="pf-chips" role="group" aria-label="Portföy kategori filtresi">${pfChips}</div>
        <div class="pf-grid" id="pf-grid">${pfItems}</div>
        <p class="sr-only" role="status" aria-live="polite" id="pf-status"></p>
      </section>
      <div class="lbx" id="pf-lightbox" hidden role="dialog" aria-modal="true" aria-label="Portföy fotoğrafı görüntüleyici">
        <span class="lbx-count" id="lbx-count"></span>
        <button type="button" class="lbx-close" id="lbx-close" aria-label="Kapat">${icon('x', 18)}</button>
        <button type="button" class="lbx-nav lbx-prev" id="lbx-prev" aria-label="Önceki fotoğraf">${icon('chevL', 22)}</button>
        <figure class="lbx-fig">
          <img id="lbx-img" alt="">
          <figcaption class="lbx-cap"><b id="lbx-title"></b><span id="lbx-cap-t"></span></figcaption>
        </figure>
        <button type="button" class="lbx-nav lbx-next" id="lbx-next" aria-label="Sonraki fotoğraf">${icon('chevR', 22)}</button>
      </div>`
    : '';

  // EKİP — personel kartları (foto yoksa baş harf avatarı)
  const teamCards = staff
    .map((m) => {
      const name = String(m.name ?? '').trim();
      const initial = (name.charAt(0) || '?').toLocaleUpperCase('tr');
      return `<article class="team-card">
        ${m.photo ? `<img class="team-photo" src="${esc(m.photo)}" alt="${esc(name)}" loading="lazy" onerror="this.remove()">` : `<span class="team-photo team-initial" aria-hidden="true">${esc(initial)}</span>`}
        <h3 class="team-name">${esc(name)}</h3>
        ${m.title ? `<p class="team-title">${esc(m.title)}</p>` : ''}
        ${m.bio ? `<p class="team-bio">${esc(m.bio)}</p>` : ''}
      </article>`;
    })
    .join('');
  const teamSection = staff.length
    ? `<section id="ekip" class="reveal" aria-labelledby="team-h">
        <h2 class="section-title" id="team-h">Ekibimiz</h2>
        <div class="team-grid">${teamCards}</div>
      </section>`
    : '';

  // STICKY MOBİL CTA — yalnız mobilde görünür; embed modunda hiç basılmaz
  const mobileCta = !a.embed && (nSvc || p.phone)
    ? `<div class="mcta" id="mobile-cta" aria-label="Hızlı işlemler">
        ${p.phone ? `<a class="mcta-btn mcta-call" href="${esc(phoneHref)}">${icon('phone', 16)} Ara</a>` : ''}
        ${nSvc ? `<a class="mcta-btn mcta-book" href="#randevu">Randevu Al</a>` : ''}
      </div>`
    : '';

  const data = jsonIsland({
    provider: {
      slug: p.slug,
      name: p.name,
      type: p.type,
      address: p.address,
      city: p.city,
      district: p.district,
      phone: p.phone,
      workingHours: wh,
      lat: p.lat,
      lng: p.lng,
    },
    services: a.services.map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      price: s.price,
      currency: s.currency,
      category: s.category,
    })),
    cfg: { homeUrl: a.homeUrl },
  });

  const hasGeo = typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat as number) && !isNaN(p.lng as number);
  const latStr = hasGeo ? String(p.lat) : '';
  const lngStr = hasGeo ? String(p.lng) : '';
  const mapCard = hasGeo
    ? `<article class="dcard reveal">
        <div class="dbody">
          <h2 class="section-title" style="margin:0">Konum</h2>
          <div id="detail-map" class="detail-map" role="application" aria-label="${esc(p.name)} konum haritası"></div>
          <div class="dir-links">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${latStr},${lngStr}" target="_blank" rel="noopener">${icon('pin', 15)} Google Yol Tarifi</a>
            <a href="https://www.openstreetmap.org/?mlat=${latStr}&mlon=${lngStr}#map=17/${latStr}/${lngStr}" target="_blank" rel="noopener">${icon('arrowL', 15)} Haritada Aç</a>
          </div>
        </div>
      </article>`
    : '';

  const detailNavLinks = [
    nSvc ? '<a href="#randevu">Randevu Al</a>' : '',
    photos.length ? '<a href="#portfoy">Portföy</a>' : '',
    staff.length ? '<a href="#ekip">Ekip</a>' : '',
    '<a href="#degerlendirmeler">Değerlendirmeler</a>',
  ].filter(Boolean).join('\n      ');

  const body = `<header class="top">
  <div class="top-in">
    ${logoMark(a.homeUrl)}
    <nav class="nav-links" aria-label="Sayfa bölümleri">
      ${detailNavLinks}
    </nav>
    <div class="nav-tools">
      <a class="member-btn" id="member-btn" href="${esc(memberHref(a.gwPort))}">Giriş</a>
    </div>
  </div>
</header>
<main>
  <a class="crumb" href="${esc(a.homeUrl)}">${icon('arrowL', 14)} Tüm işletmeler</a>
  <div class="dwrap">
    ${heroSection}

    <div class="dhead">
      <article class="dcard reveal">
        <div class="dbody">
          <h2 class="section-title" style="margin:0">Çalışma Saatleri</h2>
          <table class="hours" aria-label="Çalışma saatleri">${hoursRows}</table>
        </div>
      </article>
      ${mapCard}
    </div>

    ${aboutSection}
    ${portfoySection}
    ${teamSection}

    <section aria-labelledby="svc-h" class="reveal">
      <h2 class="section-title" id="svc-h">Hizmetler${nSvc ? ` <span class="mini-note">${nSvc} hizmet</span>` : ''}</h2>
      ${
        nSvc
          ? `<div class="svc-list">${a.services
              .map(
                (s) => `<div class="svc">
          <span class="si" aria-hidden="true">${icon(meta.icon, 20)}</span>
          <div><div class="sn">${esc(s.name)}</div><div class="sc-cat">${esc(s.category || 'Hizmet')}</div></div>
          <div class="svc-meta"><div class="svc-dur">${esc(s.duration)} dk</div><div class="svc-price">${(s.price ?? 0).toLocaleString('tr-TR')} ₺</div></div>
          <button type="button" class="svc-pick" data-svc="${esc(s.id)}">Randevu Al ${icon('chevR', 14)}</button>
        </div>`
              )
              .join('')}</div>`
          : `<p class="hint">Bu işletme henüz hizmet eklememiş — yine de telefonla ulaşabilirsin.</p>`
      }
    </section>

    <section id="degerlendirmeler" class="reveal" aria-labelledby="rev-h">
      <h2 class="section-title" id="rev-h">Değerlendirmeler${revCount ? ` <span class="mini-note">${revCount} değerlendirme</span>` : ''}</h2>

      <div class="rev-card">
        <div class="rev-summary">
          ${
            revCount > 0
              ? `<div class="rev-avg">
            <span class="rev-avg-n">${fmtAvg}</span>
            <span class="rev-stars" role="img" aria-label="Ortalama ${fmtAvg} / 5">${starsOf(Math.round(revAvg))}</span>
            <span class="rev-avg-c">${revCount} değerlendirme</span>
          </div>
          <div class="rev-bars">${distRows}</div>`
              : `<p class="rev-empty">Bu işletme henüz değerlendirme almamış — randevundan sonra ilk puanı sen verebilirsin.</p>`
          }
        </div>
        <button type="button" class="btn btn-primary rev-open" id="rev-open">Değerlendir</button>
      </div>

      <form id="review-form" class="rev-form" hidden novalidate>
        <div style="display:grid;gap:14px">
          <div>
            <span class="f-label" id="rv-stars-l">Puanın *</span>
            <div class="rev-star-row" role="group" aria-labelledby="rv-stars-l" id="rv-stars">
              <button type="button" class="rev-star-btn" data-v="1" aria-label="1 yıldız">★</button>
              <button type="button" class="rev-star-btn" data-v="2" aria-label="2 yıldız">★★</button>
              <button type="button" class="rev-star-btn" data-v="3" aria-label="3 yıldız">★★★</button>
              <button type="button" class="rev-star-btn" data-v="4" aria-label="4 yıldız">★★★★</button>
              <button type="button" class="rev-star-btn" data-v="5" aria-label="5 yıldız">★★★★★</button>
            </div>
          </div>
          <div class="field">
            <label class="f-label" for="rv-comment">Yorumun <span class="mini-note">(opsiyonel, en fazla 1000 karakter)</span></label>
            <textarea id="rv-comment" maxlength="1000" placeholder="Deneyimini paylaş: hizmet, ilgi, temizlik…"></textarea>
          </div>
          <div class="field">
            <label class="f-label" for="rv-code">Randevu No <span class="mini-note">— randevu onay ekranındaki 8 karakterli kod</span></label>
            <input id="rv-code" type="text" placeholder="örn. 7BY3OH39" autocomplete="off" style="text-transform:uppercase;letter-spacing:1px">
          </div>
          <p class="form-err" id="rv-err" hidden></p>
          <button type="submit" class="btn btn-submit" id="rv-submit">Değerlendirmeyi Gönder</button>
          <p class="mini-note" style="text-align:center">Değerlendirmeler inceleme sonrası yayınlanır · tek randevu bir kez puanlanır</p>
        </div>
      </form>

      <div class="rev-done" id="rev-done" hidden>
        <span class="okmark" aria-hidden="true">${icon('check', 28)}</span>
        <h3 style="margin:6px 0 4px">Teşekkürler!</h3>
        <p id="rev-done-msg" class="sub">Değerlendirmen incelemeden sonra yayınlanacak.</p>
      </div>

      ${revCards ? `<div class="rev-list">${revCards}</div>` : ''}
    </section>

    ${
      nSvc
        ? `<section class="book-card reveal" id="randevu" aria-labelledby="book-h">
      <h2 class="section-title" id="book-h">Randevu Al</h2>

      <div class="field">
        <span class="f-eyebrow">1 · Hizmet</span>
        <label class="f-label" for="f-service">Hizmet seç</label>
        <select id="f-service"></select>
      </div>

      <div>
        <span class="f-eyebrow">2 · Tarih</span>
        <span class="f-label" id="dates-l">Tarih seç <span class="mini-note" style="font-weight:400">· önümüzdeki 14 gün</span></span>
        <div class="dates" id="dates" role="group" aria-labelledby="dates-l"></div>
      </div>

      <div>
        <span class="f-eyebrow">3 · Saat</span>
        <span class="f-label" id="slots-l">Saat seç</span>
        <button type="button" class="quick-slot" id="quick-slot" hidden aria-label="İlk uygun saati seç"></button>
        <div class="slots" id="slots" aria-live="polite" aria-labelledby="slots-l"></div>
        <button type="button" class="wl-teaser" id="wl-open">${icon('clock', 15)} Dolu mu? Bekleme listesine gir</button>
      </div>

      <p class="sumline" id="sumline" hidden></p>

      <form id="book-form" novalidate>
        <div style="display:grid;gap:14px">
          <span class="f-eyebrow">4 · Bilgilerin</span>
          <div class="field">
            <label class="f-label" for="f-name">Ad Soyad *</label>
            <input id="f-name" name="customerName" type="text" required minlength="2" placeholder="Örn. Ayşe Yılmaz" autocomplete="name">
          </div>
          <div class="field">
            <label class="f-label" for="f-phone">Telefon *</label>
            <input id="f-phone" name="customerPhone" type="tel" required placeholder="0555 111 22 33" autocomplete="tel" inputmode="tel">
          </div>
          <div class="field">
            <label class="f-label" for="f-note">Not (opsiyonel)</label>
            <textarea id="f-note" name="customerNote" placeholder="Eklemek istediğin bir şey var mı?"></textarea>
          </div>
          <input class="hp" id="f-web" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
          <p class="form-err" id="form-err" hidden></p>
          <p class="mini-note" id="member-note" hidden style="text-align:center;background:rgba(0,113,227,.07);border-radius:10px;padding:8px 12px;color:var(--blue);font-weight:500"></p>
          <button type="submit" class="btn btn-submit" id="submit-btn">Randevuyu Onayla</button>
          <p class="mini-note" style="text-align:center">Üyeliksiz · Onay sonrası WhatsApp'tan iletebilirsin</p>
        </div>
      </form>

      <div class="success" id="success" hidden>
        <span class="okmark" aria-hidden="true">${icon('check', 30)}</span>
        <h2>Randevun oluşturuldu.</h2>
        <p class="sub">İşletme randevunu aldı — durum: <b id="s-status">—</b></p>
        <div class="sumcard">
          <div class="sumrow"><span class="k">İşletme</span><span class="v" id="s-biz"></span></div>
          <div class="sumrow"><span class="k">Hizmet</span><span class="v" id="s-service"></span></div>
          <div class="sumrow"><span class="k">Tarih &amp; Saat</span><span class="v" id="s-when"></span></div>
          <div class="sumrow"><span class="k">Ad</span><span class="v" id="s-name"></span></div>
          <div class="sumrow"><span class="k">Telefon</span><span class="v" id="s-phone"></span></div>
          <div class="sumrow" id="s-price-row" hidden><span class="k">Fiyat</span><span class="v" id="s-price"></span></div>
          <div class="sumrow" id="s-code-row" hidden><span class="k">Randevu No</span><span class="v" id="s-code"></span></div>
        </div>
        <p class="mini-note" id="s-pending-note" hidden>Randevun işletme onayı bekliyor — onaylandığında bilgilendirilirsin.</p>
        <div class="s-actions">
          <a class="btn btn-wa" id="wa-link" target="_blank" rel="noopener" href="#">${icon('wa', 16)} WhatsApp'tan Onay Gönder</a>
          <a class="btn btn-ghost" id="s-ics-link" href="#" download hidden${a.embed ? ' target="_blank" rel="noopener"' : ''}>${icon('cal', 16)} Takvime ekle</a>
          <a class="btn btn-ghost s-appts${a.embed ? ' embed-hide' : ''}" id="s-appts-link" href="${esc(memberHref(a.gwPort))}" hidden>Randevularıma git ${icon('chevR', 14)}</a>
          <button type="button" class="btn btn-ghost" id="again-btn">${icon('calPlus', 16)} Yeni randevu al</button>
          <a class="btn btn-ghost s-home${a.embed ? ' embed-hide' : ''}" href="${esc(a.homeUrl)}">${icon('arrowL', 15)} Ana sayfaya dön</a>
        </div>
      </div>

      <div class="wl-box" id="waitlist-box" hidden>
        <p class="wl-title">Bekleme Listesi</p>
        <p class="wl-sub">İstediğin saat dolu mu? Bilgilerini bırak — bir randevu açılır açılmaz seni ararız.</p>
        <form id="waitlist-form" novalidate>
          <div style="display:grid;gap:14px">
            <div class="field">
              <label class="f-label" for="wl-name">Ad Soyad *</label>
              <input id="wl-name" type="text" required minlength="2" maxlength="120" placeholder="Örn. Ayşe Yılmaz" autocomplete="name">
            </div>
            <div class="field">
              <label class="f-label" for="wl-phone">Telefon *</label>
              <input id="wl-phone" type="tel" required placeholder="0555 111 22 33" autocomplete="tel" inputmode="tel">
            </div>
            <div class="wl-grid">
              <div class="field">
                <label class="f-label" for="wl-date">İstenen tarih *</label>
                <input id="wl-date" type="date" required>
              </div>
              <div class="field">
                <label class="f-label" for="wl-time">İstenen saat <span class="mini-note">(opsiyonel)</span></label>
                <input id="wl-time" type="time">
              </div>
            </div>
            <div class="field">
              <label class="f-label" for="wl-note">Not <span class="mini-note">(opsiyonel, en fazla 500 karakter)</span></label>
              <textarea id="wl-note" maxlength="500" placeholder="Örn. öğleden sonra olabilir, 14:00 sonrası da uyar..."></textarea>
            </div>
            <p class="form-err" id="wl-err" hidden></p>
            <button type="submit" class="btn btn-wl" id="wl-submit">Bekleme Listesine Gir</button>
            <p class="mini-note" style="text-align:center">Aynı güne yalnız bir bekleme kaydı · iptal olduğunda sizi ararız</p>
          </div>
        </form>
        <div class="wl-done" id="wl-done" hidden>
          <span class="okmark" aria-hidden="true">${icon('clock', 28)}</span>
          <h3>Bekleme listesine alındınız!</h3>
          <p class="sub" id="wl-done-msg">Randevu açılır açılmaz sizi arayacağız.</p>
          <p class="mini-note" style="text-align:center">Durumunu <a href="${esc(memberHref(a.gwPort))}">Bekleme Durumum</a> sorgusuyla takip edebilirsin.</p>
        </div>
      </div>
    </section>`
        : ''
    }
  </div>
</main>
${mobileCta}
${siteFooter(a.gwPort)}`;

  return pageShell({
    title: `${p.name} — Online Randevu | GNC Randevu`,
    desc: `${p.name} (${p.city}) online randevu: hizmetler, çalışma saatleri ve uygun saatler. Saniyeler içinde üyeliksiz randevu.`,
    body,
    bodyClass: a.embed ? 'embed' : undefined,
    extraCss: hasGeo ? ['/assets/leaflet/leaflet.css'] : undefined,
    scripts: hasGeo ? ['/assets/leaflet/leaflet.js', '/assets/detail.js'] : ['/assets/detail.js'],
    gwPort: a.gwPort,
  }).replace(
    '</main>',
    `<script id="page-data" type="application/json">${data}</script>\n</main>`
  );
}

// ---------------------------------------------------------------- HATA SAYFALARI

export function notFoundPage(
  slug?: string,
  gwPort?: string | null,
  homeUrl?: string | null,
  suggestions: Json[] = [],
  baseDomain?: string,
  q?: string
): string {
  const backHref = homeUrl || '/';
  const gwHidden = gwPort ? `<input type="hidden" name="XTransformPort" value="${esc(gwPort)}">` : '';
  const term = String(q || '').trim();
  const svcMatched = suggestions.some((b) => b._svcMatch);
  const suggHtml = suggestions.length
    ? `<div class="nf-sugg">
  <h2>${term && svcMatched ? `“${esc(term)}” için hizmet eşleşmeleri` : 'Belki şunları arıyorsun?'}</h2>
  ${term && svcMatched ? `<p class="nf-sub" style="margin:-4px 0 10px">Aradığın terim bir <b>hizmet</b> adında geçiyor — o hizmeti veren işletmeleri öne çıkardık.</p>` : ''}
  <div class="nf-grid">
    ${suggestions
      .map((b) => {
        const meta = typeMeta(String(b.type || ''));
        const loc = [b.district, b.city].filter(Boolean).join(' · ');
        const svcChip = b._svcMatch ? `<span class="nf-svc">${esc(b._svcMatch)} hizmeti var</span>` : '';
        const href = baseDomain
          ? `https://${esc(b.slug)}.${esc(baseDomain)}`
          : gwPort
            ? `/isletme/${encodeURIComponent(String(b.slug))}?XTransformPort=${encodeURIComponent(gwPort)}`
            : `/isletme/${encodeURIComponent(String(b.slug))}`;
        return `<a class="nf-item" href="${href}">
      <span class="nf-ic" aria-hidden="true">${icon(meta.icon, 20)}</span>
      <span style="min-width:0"><span class="nf-nm">${esc(b.name)}</span>${svcChip}${loc ? `<span class="nf-loc" style="display:block">${esc(loc)}</span>` : ''}</span>
    </a>`;
      })
      .join('')}
  </div>
</div>`
    : '';
  return pageShell({
    title: 'İşletme bulunamadı | GNC Randevu',
    desc: 'Aradığın işletme bulunamadı.',
    gwPort,
    body: `<header class="top"><div class="top-in">${logoMark(backHref)}</div></header>
<main><div class="center-page"><div class="center-card" style="max-width:560px">
  <h1>Aradığın sayfa bulunamadı.</h1>
  <p>${slug ? `"<b>${esc(slug)}</b>" adında kayıtlı bir işletme yok — adres yanlış yazılmış, işletme kaldırılmış ya da henüz eklenmemiş olabilir.` : 'Aradığın sayfa mevcut değil.'}</p>
  <form class="nf-search" action="${esc(backHref)}" method="get" role="search">
    ${gwHidden}
    <input type="search" name="q" placeholder="İşletme veya hizmet ara…" aria-label="İşletme veya hizmet ara"${term ? ` value="${esc(term)}"` : ''}>
    <button type="submit" class="btn btn-primary" style="padding:10px 20px">${icon('search', 15)} Ara</button>
  </form>
  <p class="nf-sub">Not: <b>işletme-adi</b> biçimindeki alt alan adları GNC Randevu sistemine ayrılmıştır; henüz işletme atanmamış adreslerde bu sayfa görünür.</p>
  ${suggHtml}
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
    <a class="btn btn-primary" href="${esc(backHref)}">Tüm işletmelere göz at</a>
  </div>
</div></div></main>
${siteFooter(gwPort)}`,
  });
}

export function serverErrorPage(msg: string, gwPort?: string | null): string {
  return pageShell({
    title: 'Bir sorun oluştu | GNC Randevu',
    desc: 'Beklenmeyen bir hata oluştu.',
    gwPort,
    body: `<header class="top"><div class="top-in">${logoMark('/')}</div></header>
<main><div class="center-page"><div class="center-card">
  <h1>Bir şeyler ters gitti.</h1>
  <p>${esc(msg)}</p>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px">
    <a class="btn btn-primary" href="/">Ana sayfaya dön</a>
    <a class="btn btn-ghost" href="javascript:location.reload()">Sayfayı yenile</a>
  </div>
</div></div></main>
${siteFooter(gwPort)}`,
  });
}

// ---------------------------------------------------------------- ÜYELİK SAYFASI

export function memberPage(baseDomain: string, gwPort?: string | null): string {
  const body = `<header class="top">
  <div class="top-in">
    ${logoMark('/')}
    <nav class="nav-links" aria-label="Sayfa bağlantıları">
      <a href="/#isletmeler">İşletmeler</a>
    </nav>
    <div class="nav-tools">
      <a class="member-btn" href="/#isletmeler">Randevu Al</a>
    </div>
  </div>
</header>
<main>
  <section class="mem-hero">
    <h1>Üyelik.</h1>
    <p>Üye ol; tüm işletmelerdeki randevularını tek ekrandan takip et, istediğinde iptal et. Üyeliksiz de randevu alabilirsin — üyelik isteğe bağlıdır.</p>
  </section>

  <div class="mem-wrap" id="mem-auth" hidden>
    <div class="mem-card">
      <div class="mem-tabs" role="tablist" aria-label="Giriş veya kayıt">
        <button type="button" class="mem-tab on" id="tab-login" role="tab" aria-selected="true">Giriş Yap</button>
        <button type="button" class="mem-tab" id="tab-register" role="tab" aria-selected="false">Kayıt Ol</button>
      </div>

      <form id="login-form" novalidate>
        <div style="display:grid;gap:14px">
          <div class="field">
            <label class="f-label" for="l-phone">Telefon</label>
            <input id="l-phone" type="tel" required placeholder="0555 111 22 33" autocomplete="tel" inputmode="tel">
          </div>
          <div class="field">
            <label class="f-label" for="l-pass">Şifre</label>
            <input id="l-pass" type="password" required placeholder="••••••" autocomplete="current-password">
          </div>
          <p class="form-err" id="l-err" hidden></p>
          <button type="submit" class="btn btn-submit">Giriş Yap</button>
          <p class="mini-note" style="text-align:center">Hesabın yok mu? <b>Kayıt Ol</b> sekmesine geç.</p>
        </div>
      </form>

      <form id="register-form" hidden novalidate>
        <div style="display:grid;gap:14px">
          <div class="field">
            <label class="f-label" for="r-name">Ad Soyad</label>
            <input id="r-name" type="text" required minlength="2" placeholder="Örn. Ayşe Yılmaz" autocomplete="name">
          </div>
          <div class="field">
            <label class="f-label" for="r-phone">Telefon</label>
            <input id="r-phone" type="tel" required placeholder="0555 111 22 33" autocomplete="tel" inputmode="tel">
          </div>
          <div class="field">
            <label class="f-label" for="r-email">E-posta (opsiyonel)</label>
            <input id="r-email" type="email" placeholder="ornek@posta.com" autocomplete="email">
          </div>
          <div class="field">
            <label class="f-label" for="r-pass">Şifre <span class="mini-note">(en az 6 karakter)</span></label>
            <input id="r-pass" type="password" required minlength="6" placeholder="••••••" autocomplete="new-password">
          </div>
          <p class="form-err" id="r-err" hidden></p>
          <button type="submit" class="btn btn-submit">Üye Ol</button>
          <p class="mini-note" style="text-align:center">Üyelikle randevuların profilinde saklanır — her işletmede ayrı bilgi girmen gerekmez.</p>
        </div>
      </form>
    </div>
  </div>

  <div class="mem-wrap" id="mem-logged" hidden>
    <div class="mem-card">
      <div class="mem-profile">
        <span class="mem-avatar" id="m-avatar" aria-hidden="true">A</span>
        <div class="mem-id" style="flex:1">
          <div class="n" id="m-name">—</div>
          <div class="p" id="m-phone">—</div>
          <div class="p" id="m-email" hidden></div>
        </div>
        <span class="st-badge st-onaylandi">Üye</span>
      </div>
      <div class="mem-actions">
        <button type="button" class="btn btn-ghost" id="logout-btn">Çıkış Yap</button>
        <a class="btn btn-primary" href="/">Randevu Al</a>
      </div>
      <div class="mem-danger">
        <button type="button" class="del-btn" id="delete-btn">Hesabımı Sil</button>
        <span class="mini-note">KVKK kapsamında üyeliğini ve tüm randevularını kalıcı olarak sil.</span>
      </div>
    </div>

    <h2 class="section-title" style="margin:26px 2px 8px;font-size:28px">Randevularım</h2>
    <div class="rem-pref" id="rem-pref" hidden>
      <button type="button" class="rem-row" id="rem-toggle" role="switch" aria-checked="true" aria-describedby="rem-note">
        <span class="rem-ic" aria-hidden="true">${icon('bell', 20)}</span>
        <span class="rem-txt">
          <b>Hatırlatıcılar</b>
          <span class="rem-sub" id="rem-state">Açık — randevu saatinden 2 saat önce hatırlatma alınır</span>
        </span>
        <span class="rem-sw" aria-hidden="true"><span class="rem-knob"></span></span>
      </button>
      <p class="rem-note" id="rem-note">Tercihin bu cihazda saklanır. "Takvime ekle" ile indirdiğin takvim dosyasına, açıkken randevu saatinden 2 saat önce çalan bir hatırlatma eklenir.</p>
    </div>
    <div id="appt-list" aria-live="polite"><div class="mem-card" style="text-align:center;color:var(--sub)"><span class="spin dark"></span> Randevuların yükleniyor…</div></div>

    <h2 class="section-title" style="margin:28px 2px 8px;font-size:28px">Damga Kartlarım</h2>
    <div id="sc-list" aria-live="polite"><div class="mem-card" style="text-align:center;color:var(--sub)"><span class="spin dark"></span> Damga kartların yükleniyor…</div></div>
  </div>

  <section class="wlq-wrap reveal" aria-labelledby="wlq-h">
    <h2 class="section-title" id="wlq-h" style="margin:0 0 8px;font-size:28px">Bekleme Durumum</h2>
    <div class="mem-card">
      <p class="mini-note" style="margin:0 0 12px">Dolu slot için bekleme listesine girdiysen, telefon numaranla durumunu sorgulayabilirsin — üye olman gerekmez.</p>
      <form id="wlq-form" novalidate>
        <div class="wlq-row">
          <input id="wlq-phone" type="tel" placeholder="0555 111 22 33" inputmode="tel" autocomplete="tel" aria-label="Telefon numarası">
          <button type="submit" class="btn btn-primary" style="width:auto;padding:12px 20px">${icon('search', 15)} Sorgula</button>
        </div>
        <p class="form-err" id="wlq-err" hidden></p>
      </form>
      <div id="wlq-result" aria-live="polite"></div>
    </div>
  </section>

  <div class="del-overlay" id="del-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="del-title">
    <div class="del-box">
      <h2 id="del-title">Hesabını silmek istediğine emin misin?</h2>
      <p>Bu işlem <b>geri alınamaz</b>: üyeliğin silinir ve tüm işletmelerdeki randevuların — iptal edilenler dahil — kalıcı olarak kaldırılır.</p>
      <p class="warn">Onay için hesap şifreni gir. Silme işleminden sonra aynı numarayla tekrar kayıt olabilirsin.</p>
      <div class="field">
        <label class="f-label" for="del-pass">Şifre teyidi</label>
        <input id="del-pass" type="password" autocomplete="current-password" placeholder="••••••">
      </div>
      <p class="form-err" id="del-err" hidden></p>
      <div class="del-actions">
        <button type="button" class="btn btn-ghost" id="del-cancel">Vazgeç</button>
        <button type="button" class="btn del-confirm" id="del-confirm">Hesabımı Kalıcı Olarak Sil</button>
      </div>
    </div>
  </div>
  <div class="del-overlay" id="rev-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="rev-ov-title">
    <div class="del-box">
      <h2 id="rev-ov-title">Randevunu Değerlendir</h2>
      <div class="rev-ov-summary" id="rev-ov-sum"></div>
      <div>
        <span class="f-label" id="rov-stars-l">Puanın *</span>
        <div class="rev-star-row" role="group" aria-labelledby="rov-stars-l" id="rov-stars">
          <button type="button" class="rev-star-btn" data-v="1" aria-label="1 yıldız">★</button>
          <button type="button" class="rev-star-btn" data-v="2" aria-label="2 yıldız">★★</button>
          <button type="button" class="rev-star-btn" data-v="3" aria-label="3 yıldız">★★★</button>
          <button type="button" class="rev-star-btn" data-v="4" aria-label="4 yıldız">★★★★</button>
          <button type="button" class="rev-star-btn" data-v="5" aria-label="5 yıldız">★★★★★</button>
        </div>
      </div>
      <div class="field">
        <label class="f-label" for="rov-comment">Yorumun <span class="mini-note">(opsiyonel, en fazla 1000 karakter)</span></label>
        <textarea id="rov-comment" maxlength="1000" placeholder="Deneyimini paylaş: hizmet, ilgi, temizlik…"></textarea>
      </div>
      <p class="form-err" id="rov-err" hidden></p>
      <div class="del-actions">
        <button type="button" class="btn btn-ghost" id="rov-cancel">Vazgeç</button>
        <button type="button" class="btn btn-submit" id="rov-send" style="border:none">Gönder</button>
      </div>
    </div>
  </div>
</main>
${siteFooter(gwPort)}`;

  const shell = pageShell({
    title: 'Üyelik — Randevularım | GNC Randevu',
    desc: 'GNC Randevu üyeliği: tüm işletmelerdeki randevularını tek ekrandan takip et, iptal et.',
    body,
    scripts: ['/assets/member.js'],
    gwPort,
  });
  const cfg = jsonIsland({ baseDomain });
  return shell.replace('</main>', `<script id="page-cfg" type="application/json">${cfg}</script>\n</main>`);
}

// ---------------------------------------------------------------- İSTEMCİ JS: ANA SAYFA

export const HOME_JS = `
(function () {
  'use strict';
  var cfgEl = document.getElementById('page-cfg');
  var CFG = cfgEl ? JSON.parse(cfgEl.textContent) : { baseDomain: '' };
  // Gateway (XTransformPort) uyumu: göreli API/link çağrılarına param ekle
  var GWPORT = new URLSearchParams(location.search).get('XTransformPort');
  function gwq(p) {
    if (!GWPORT) return p;
    return p + (p.indexOf('?') === -1 ? '?' : '&') + 'XTransformPort=' + encodeURIComponent(GWPORT);
  }
  // Arama kısayolu: '/' veya Ctrl/Cmd+K → odak; Esc → bırak (CRM topbar kbd ipucu muadili)
  var qEl = document.getElementById('q');
  if (qEl) {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        qEl.focus();
        try { qEl.select(); } catch (_) {}
      } else if (e.key === 'Escape' && e.target === qEl) {
        qEl.blur();
      }
    });
  }
  var TYPE = {
    berber: { label: 'Berber' },
    kuafor: { label: 'Kuaför' },
    disci: { label: 'Dişçi' },
    guzellik: { label: 'Güzellik' },
    spa: { label: 'Spa' },
    dovme: { label: 'Dövme' }
  };
  // ince SVG ikonlar (emoji yerine)
  var ICON = {
    search: '<svg width="38" height="38" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.7"/><path d="m10.5 10.5 3.3 3.3"/></svg>',
    bolt: '<svg width="38" height="38" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.8 1.6 3.4 9.2h3.5l-.9 5.2 5.5-7.7H7.9Z"/></svg>',
    store: '<svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.4 6.4 3.4 3h9.2l1 3.4"/><path d="M2.4 6.4c0 1.1.9 1.9 2 1.9s2-.8 2-1.9c0 1.1.9 1.9 2 1.9s2-.8 2-1.9c0 1.1.7 1.9 1.7 1.9s1.9-.8 1.9-1.9"/><path d="M4 9.4v4.1h8V9.4"/><path d="M7 13.5v-2.6h2v2.6"/></svg>',
    pin: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.9 6.4a4.9 4.9 0 1 0-9.8 0c0 1.5.7 2.8 1.6 3.8L8 13.8l3.3-3.6c.9-1 1.6-2.3 1.6-3.8Z"/><circle cx="8" cy="6.3" r="1.6"/></svg>',
    phone: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.4 2.7c.4-.5 1.1-.6 1.5-.1l1.2 1.4c.4.4.3 1-.1 1.4l-.8.8c-.2.2-.3.5-.1.8.4.7 1 1.4 1.7 2 .6.6 1.3 1.1 2 1.4.3.1.6.1.8-.2l.7-.7c.4-.4 1-.4 1.4 0l1.4 1.2c.5.4.5 1.1.1 1.5l-1 1c-.6.6-1.5.9-2.3.6-2.8-1-5.1-3.2-6.7-6.1-.4-.8-.3-1.7.3-2.4Z"/></svg>'
  };
  var state = { q: '', type: '', city: '' };
  var lastItems = [];
  var grid = document.getElementById('grid');
  var countEl = document.getElementById('count');
  var citySel = document.getElementById('city');
  var qInput = document.getElementById('q');
  var locStatus = document.getElementById('loc-status');

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtPrice(price, cur) {
    if (typeof price !== 'number') return '';
    var n = new Intl.NumberFormat('tr-TR').format(price);
    return cur && cur !== 'TRY' ? n + ' ' + cur : n + ' \\u20BA';
  }
  function fmtKm(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(km) + ' km';
  }
  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---- toast
  var toastTimer = null;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 4200);
  }

  // ---- harita (Leaflet + OpenStreetMap)
  var map = null, markerLayer = null, userMarker = null, nearestM = null, mapReady = false;
  var mapEl = document.getElementById('biz-map');

  function pinIcon(nearest) {
    var size = nearest ? [34, 34] : [26, 26];
    var html = '<div class="biz-pin' + (nearest ? ' pin-nearest' : '') + '"><span class="pin-dot"></span>' + (nearest ? '<span class="pin-star" aria-hidden="true"></span>' : '') + '</div>';
    return L.divIcon({ className: '', html: html, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2], popupAnchor: [0, -(size[1] / 2 + 6)] });
  }

  function popHtml(it) {
    var t = TYPE[it.type] || { label: 'İşletme' };
    var sub = esc(t.label) + (it.district ? ' · ' + esc(it.district) : '') + (it.city ? ' · ' + esc(it.city) : '');
    var dist = (typeof it._d === 'number') ? '<div class="pop-d">Sana ' + esc(fmtKm(it._d)) + '</div>' : '';
    return '<div class="biz-pop"><div class="pop-t">' + esc(it.name) + '</div><div class="pop-s">' + sub + '</div>' + dist +
      '<a class="pop-link" href="' + bizHref(it.slug) + '">Randevu Al ›</a></div>';
  }

  function initMap() {
    if (mapReady || !mapEl) return;
    if (typeof L === 'undefined') {
      // Leaflet yüklenemedi — harita bölümünü nazikçe gizle
      var mc = mapEl.closest('.map-card');
      if (mc) mc.style.display = 'none';
      return;
    }
    var hasGeoPts = lastItems.some(function (it) { return typeof it.lat === 'number' && typeof it.lng === 'number'; });
    map = L.map('biz-map', { scrollWheelZoom: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    mapReady = true;
    if (hasGeoPts) {
      map.fitBounds(L.latLngBounds(lastItems.filter(function (it) { return typeof it.lat === 'number'; }).map(function (it) { return [it.lat, it.lng]; })).pad(0.2));
    } else {
      map.setView([39.2, 35.2], 5.4);
    }
  }

  function updateMap(items) {
    if (!mapReady) { initMap(); if (!mapReady) return; }
    markerLayer.clearLayers();
    nearestM = null;
    var pts = [];
    var minD = null;
    for (var i = 0; i < items.length; i++) {
      var d = items[i]._d;
      if (typeof d === 'number' && (minD === null || d < minD)) minD = d;
    }
    items.forEach(function (it) {
      if (typeof it.lat !== 'number' || typeof it.lng !== 'number' || isNaN(it.lat) || isNaN(it.lng)) return;
      var isNearest = (minD !== null && it._d === minD);
      var m = L.marker([it.lat, it.lng], { icon: pinIcon(isNearest), title: it.name, alt: it.name });
      m.bindPopup(popHtml(it), { maxWidth: 260 });
      m.addTo(markerLayer);
      if (isNearest) nearestM = m;
      pts.push([it.lat, it.lng]);
    });
    if (!pts.length) {
      map.setView([39.2, 35.2], 5.4);
    } else if (pts.length === 1) {
      map.setView(pts[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(pts).pad(0.2));
    }
  }

  function setUserDot(la, ln) {
    if (!mapReady) return;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([la, ln], {
      icon: L.divIcon({ className: '', html: '<div class="user-dot" role="img" aria-label="Konumun"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false, keyboard: false
    }).addTo(map);
  }

  function zoomToNearest() {
    if (!mapReady || !nearestM) return;
    var target = nearestM.getLatLng();
    var pts = [];
    if (userMarker) pts.push([userMarker.getLatLng().lat, userMarker.getLatLng().lng]);
    pts.push([target.lat, target.lng]);
    map.fitBounds(L.latLngBounds(pts).pad(0.35), { animate: true });
    setTimeout(function () { nearestM.openPopup(); }, 450);
  }

  var mapToggle = document.getElementById('map-toggle');
  if (mapToggle) {
    mapToggle.addEventListener('click', function () {
      var collapsed = mapEl.style.display === 'none';
      mapEl.style.display = collapsed ? '' : 'none';
      mapToggle.textContent = collapsed ? 'Haritayı gizle' : 'Haritayı göster';
      mapToggle.setAttribute('aria-expanded', String(collapsed));
      if (collapsed && mapReady) setTimeout(function () { map.invalidateSize(); }, 80);
    });
  }

  function bizHref(slug) {
    var bd = CFG.baseDomain || '';
    var host = (typeof location !== 'undefined' && location.hostname) || '';
    // Gerçek subdomain dağıtımında (host = apex veya *.baseDomain) absolute link;
    // gateway/önizleme ortamında (host ≠ baseDomain) relative kal — yoksa
    // sandbox/preview'da çözülemeyen https://<slug>.<bd> linkleri oluşur.
    if (bd && (host === bd || host.indexOf('.' + bd) !== -1)) {
      return 'https://' + slug + '.' + bd;
    }
    return gwq('/isletme/' + encodeURIComponent(slug));
  }

  function cardHtml(it, i) {
    var t = TYPE[it.type] || { label: 'İşletme' };
    var tKey = TYPE[it.type] ? it.type : 'def';
    var svcs = it.services || [];
    var minP = null;
    for (var j = 0; j < svcs.length; j++) {
      if (typeof svcs[j].price === 'number' && (minP === null || svcs[j].price < minP)) minP = svcs[j].price;
    }
    var cover = it.photo
      ? '<img class="cphoto" src="' + esc(it.photo) + '" alt="' + esc(it.name) + '" loading="lazy" onerror="this.remove()">'
      : '<span class="phb ph-' + tKey + '" aria-hidden="true">' + ICON.store + '</span>';
    var dist = (typeof it._d === 'number') ? '<span class="dist">' + ICON.pin + ' ' + esc(fmtKm(it._d)) + '</span>' : '';
    var rate = (typeof it.ratingAvg === 'number' && it.ratingCount > 0)
      ? '<span class="rate-chip"><span class="s" aria-hidden="true">★</span>' +
        esc(it.ratingAvg.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })) +
        ' <span style="font-weight:600;opacity:.75">(' + it.ratingCount + ')</span></span>'
      : '';
    var tel = it.phone ? '<a class="tel-link" href="tel:' + esc(String(it.phone).replace(/\\s+/g, '')) + '" title="Ara">' + ICON.phone + ' ' + esc(it.phone) + '</a>' : '<span></span>';
    return '<article class="card" style="animation-delay:' + Math.min(i * 45, 400) + 'ms">' +
      '<a class="card-link" href="' + bizHref(it.slug) + '" aria-label="' + esc(it.name) + ' — detayları gör"><div class="cover">' + cover + '</div></a>' +
      '<div class="body">' +
      '<div class="row-top"><span class="badge b-' + tKey + '">' + esc(t.label) + '</span>' + rate + dist + '</div>' +
      '<h3 class="c-name"><a class="card-link" href="' + bizHref(it.slug) + '">' + esc(it.name) + '</a></h3>' +
      '<p class="c-loc">' + esc(it.city || '') + (it.district ? ' · ' + esc(it.district) : '') + '</p>' +
      (it.address ? '<p class="c-addr">' + esc(it.address) + '</p>' : '') +
      '<div class="c-meta"><span>' + svcs.length + ' hizmet</span>' + (minP !== null ? '<span aria-hidden="true">·</span><span class="minp">min. ' + esc(fmtPrice(minP)) + '</span>' : '') + '</div>' +
      '<div class="c-foot">' + tel + '<span class="go" aria-hidden="true">İncele ›</span></div>' +
      '</div></article>';
  }

  function skeleton(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="sk" aria-hidden="true"><div class="sc"></div><div class="sb"><div class="sk-line w60"></div><div class="sk-line w80"></div><div class="sk-line"></div></div></div>';
    return h;
  }

  function render(items) {
    if (!items.length) {
      grid.innerHTML = '<div class="state-box">' + ICON.search + '<p>Aramanla eşleşen işletme bulamadık.<br>Filtreleri temizleyip tekrar dene.</p><button type="button" class="btn btn-ghost" id="clear-filters">Filtreleri temizle</button></div>';
      var cb = document.getElementById('clear-filters');
      if (cb) cb.addEventListener('click', function () {
        state = { q: '', type: '', city: '' };
        qInput.value = ''; citySel.value = '';
        setChip('');
        load();
      });
      return;
    }
    grid.innerHTML = items.map(cardHtml).join('');
  }

  function setChip(type) {
    var chips = document.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute('data-type') === type;
      chips[i].classList.toggle('on', on);
      if (on) chips[i].setAttribute('aria-pressed', 'true'); else chips[i].removeAttribute('aria-pressed');
    }
  }

  function fillCities(cities) {
    var cur = state.city;
    citySel.innerHTML = '<option value="">Tüm şehirler</option>';
    for (var i = 0; i < cities.length; i++) {
      var o = document.createElement('option');
      o.value = cities[i]; o.textContent = cities[i];
      citySel.appendChild(o);
    }
    citySel.value = cur || '';
    if (citySel.value !== cur) { state.city = ''; }
  }

  function load() {
    countEl.textContent = 'İşletmeler yükleniyor…';
    grid.innerHTML = skeleton(8);
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.type) params.set('type', state.type);
    if (state.city) params.set('city', state.city);
    var qs = params.toString();
    fetch(gwq('/api/businesses' + (qs ? '?' + qs : '')), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) {
          countEl.textContent = '';
          grid.innerHTML = '<div class="state-box">' + ICON.bolt + '<p>' + esc(x.j && x.j.error ? x.j.error : 'İşletmeler yüklenemedi.') + '</p><button type="button" class="btn btn-primary" id="retry-btn">Tekrar dene</button></div>';
          var rb = document.getElementById('retry-btn');
          if (rb) rb.addEventListener('click', load);
          return;
        }
        lastItems = x.j.items || [];
        fillCities(x.j.cities || []);
        countEl.textContent = lastItems.length + ' işletme listeleniyor' + (state.q || state.type || state.city ? ' (filtreli)' : '');
        render(lastItems);
        initMap();
        updateMap(lastItems);
      })
      .catch(function () {
        countEl.textContent = '';
        grid.innerHTML = '<div class="state-box">' + ICON.bolt + '<p>Bağlantı hatası — internetini kontrol edip tekrar dene.</p><button type="button" class="btn btn-primary" id="retry-btn">Tekrar dene</button></div>';
        var rb2 = document.getElementById('retry-btn');
        if (rb2) rb2.addEventListener('click', load);
      });
  }

  // ---- arama (debounce)
  var qTimer = null;
  qInput.addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { state.q = qInput.value.trim(); load(); }, 350);
  });
  qInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { clearTimeout(qTimer); state.q = qInput.value.trim(); load(); }
  });

  // ---- tür çipleri
  document.getElementById('chips').addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    state.type = btn.getAttribute('data-type') || '';
    setChip(state.type);
    load();
  });

  // ---- şehir
  citySel.addEventListener('change', function () { state.city = citySel.value; load(); });

  // ---- konum: en yakını bul
  document.getElementById('geo-btn').addEventListener('click', function () {
    if (!navigator.geolocation) {
      locStatus.textContent = 'Tarayıcın konum desteği vermiyor — listeyi serbestçe inceleyebilirsin.';
      toast('Konum desteklenmiyor.', 'warn');
      return;
    }
    locStatus.innerHTML = '<span class="spin dark"></span> Konumun alınıyor…';
    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  });

  function onPos(pos) {
    var la = pos.coords.latitude, ln = pos.coords.longitude;
    var withD = 0;
    lastItems.forEach(function (it) {
      if (typeof it.lat === 'number' && typeof it.lng === 'number' && !isNaN(it.lat) && !isNaN(it.lng)) {
        it._d = haversine(la, ln, it.lat, it.lng);
        withD++;
      } else {
        it._d = null;
      }
    });
    if (!withD) {
      locStatus.textContent = 'İşletmelerin harita konumu henüz eklenmemiş — mesafe sıralaması yapılamadı.';
      toast('İşletme konum bilgisi henüz yok.', 'warn');
      return;
    }
    var sorted = lastItems.slice().sort(function (a, b) {
      return (a._d === null ? 1e12 : a._d) - (b._d === null ? 1e12 : b._d);
    });
    render(sorted);
    initMap();
    updateMap(sorted);
    setUserDot(la, ln);
    var nearest = sorted[0];
    locStatus.innerHTML = 'En yakın işletme: <b>' + esc(nearest.name) + '</b> (' + esc(fmtKm(nearest._d)) + ') — haritada mavi pinle işaretlendi.';
    toast('En yakın işletme: ' + nearest.name, 'ok');
    zoomToNearest();
  }

  function onErr() {
    locStatus.textContent = 'Konum izni alınamadı — listeyi serbestçe inceleyebilirsin.';
    toast('Konum izni olmadan mesafe hesaplanamıyor.', 'warn');
  }

  // ---- üyelik butonu etiketi (girişliyse üye adını göster)
  (function () {
    var btn = document.getElementById('member-btn');
    if (!btn) return;
    var a = null;
    try { a = JSON.parse(localStorage.getItem('gnc_member') || 'null'); } catch (_) {}
    if (!a || !a.token) return;
    fetch(gwq('/api/member/me'), { headers: { accept: 'application/json', authorization: 'Bearer ' + a.token } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok && x.j && x.j.member) {
          btn.textContent = String(x.j.member.name || '').trim().split(/\s+/)[0];
          btn.classList.add('logged');
          btn.setAttribute('aria-label', 'Üyelik — ' + x.j.member.name);
        } else {
          try { localStorage.removeItem('gnc_member'); } catch (_) {}
        }
      })
      .catch(function () {});
  })();

  // ?q= ile gelindiyse (örn. 404 arama formu → /?q=manikür) arama kutusunu doldurup filtreli başlat
  var urlQ = new URLSearchParams(location.search).get('q');
  if (urlQ && urlQ.trim()) {
    state.q = urlQ.trim();
    if (qInput) qInput.value = state.q;
  }

  load();
})();
`;

// ---------------------------------------------------------------- İSTEMCİ JS: DETAY

export const DETAIL_JS = `
(function () {
  'use strict';
  var dataEl = document.getElementById('page-data');
  if (!dataEl) return;
  var D = JSON.parse(dataEl.textContent);
  var P = D.provider, SVCS = D.services, CFG = D.cfg;
  // Gateway (XTransformPort) uyumu: göreli API çağrılarına param ekle
  var GWPORT = new URLSearchParams(location.search).get('XTransformPort');
  function gwq(p) {
    if (!GWPORT) return p;
    return p + (p.indexOf('?') === -1 ? '?' : '&') + 'XTransformPort=' + encodeURIComponent(GWPORT);
  }
  var $ = function (s) { return document.querySelector(s); };
  var state = { serviceId: SVCS.length ? SVCS[0].id : null, date: null, time: null };
  // 🔁 Tekrar planlama (Randevularım → "Tekrar planla"): ?tekrar=1&service=<id>
  // Hizmet önceden seçilir, tarih/saat BOŞ başlar (kullanıcı yeni tarihi seçer)
  var URLP = new URLSearchParams(location.search);
  var replanSvc = URLP.get('service') || '';
  var isReplan = URLP.get('tekrar') === '1';

  // ---- telefon görüntü maskeleme: "05329999999" → "0532 999 99 99"
  // Yalnızca input görüntüsü; gönderilen değer sunucu tarafında normalize edilir.
  // 0 ile başlamayan / 11 haneden uzun (örn. +90…) girişlere dokunulmaz.
  function maskTrPhone(input) {
    var d = String(input.value || '').replace(/\D/g, '');
    if (!d || d.charAt(0) !== '0' || d.length > 11) return;
    var out = d;
    if (d.length > 9) out = d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9);
    else if (d.length > 7) out = d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7);
    else if (d.length > 4) out = d.slice(0, 4) + ' ' + d.slice(4);
    input.value = out;
  }
  var fPhoneEl = $('#f-phone');
  if (fPhoneEl) fPhoneEl.addEventListener('input', function () { maskTrPhone(fPhoneEl); });

  var DAYS_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  var MON_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtPrice(price, cur) {
    if (typeof price !== 'number') return '';
    var n = new Intl.NumberFormat('tr-TR').format(price);
    return cur && cur !== 'TRY' ? n + ' ' + cur : n + ' \\u20BA';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // 🔔 hatırlatıcı tercihi (localStorage; /uyelik sayfasındaki toggle ile aynı
  // anahtar) — kapalıysa ICS linkine &alarm=0 eklenir (VALARM yazılmaz)
  function remindersOn() {
    try { return (localStorage.getItem('gnc_reminders') || 'on') !== 'off'; } catch (_) { return true; }
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 4200);
  }

  // ---- bugünü vurgula + "şu anda açık/kapalı"
  (function () {
    var map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    var now = new Date();
    var key = map[now.getDay()];
    var row = document.querySelector('.hours tr[data-day="' + key + '"]');
    if (row) {
      row.classList.add('today');
      var td = row.querySelector('td.t-time');
      if (td && !td.querySelector('.today-pill')) {
        var pill = document.createElement('span');
        pill.className = 'today-pill';
        pill.textContent = 'Bugün';
        td.appendChild(pill);
      }
    }
    var el = document.getElementById('open-now');
    if (el && P.workingHours) {
      var wh = P.workingHours[key];
      if (wh && wh.start && wh.end && !wh.closed) {
        var p2 = function (s) { var a = String(s).split(':'); return (+a[0]) * 60 + (+a[1]); };
        var cur = now.getHours() * 60 + now.getMinutes();
        var open = cur >= p2(wh.start) && cur < p2(wh.end);
        el.textContent = open ? 'Şu anda açık' : 'Şu anda kapalı';
        el.className = 'open-chip ' + (open ? 'on' : 'off');
      }
    }
  })();

  // ---- değerlendirme formu (⭐) — hizmet olsun olmasın çalışır
  (function () {
    var openBtn = document.getElementById('rev-open');
    var form = document.getElementById('review-form');
    if (!openBtn || !form) return;
    var errEl = document.getElementById('rv-err');
    var doneEl = document.getElementById('rev-done');
    var doneMsg = document.getElementById('rev-done-msg');
    var rating = 0;
    var starBtns = form.querySelectorAll('.rev-star-btn');
    for (var si = 0; si < starBtns.length; si++) {
      (function (b) {
        b.addEventListener('click', function () {
          rating = parseInt(b.getAttribute('data-v'), 10) || 0;
          for (var k = 0; k < starBtns.length; k++) {
            var on = parseInt(starBtns[k].getAttribute('data-v'), 10) <= rating;
            starBtns[k].classList.toggle('on', on);
            starBtns[k].setAttribute('aria-pressed', String(on));
          }
          if (errEl) errEl.hidden = true;
        });
      })(starBtns[si]);
    }
    openBtn.addEventListener('click', function () {
      form.hidden = false;
      openBtn.hidden = true;
      try { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      toast('Önce puanını seç, sonra randevu numaranı gir.', 'ok');
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (errEl) errEl.hidden = true;
      if (!rating) {
        if (errEl) { errEl.textContent = 'Lütfen puanını seç (1-5 yıldız).'; errEl.hidden = false; }
        return;
      }
      var code = (document.getElementById('rv-code').value || '').trim();
      if (!code) {
        if (errEl) { errEl.textContent = 'Randevu numaranı gir — randevu onay ekranındaki 8 karakterli kod.'; errEl.hidden = false; }
        return;
      }
      var comment = (document.getElementById('rv-comment').value || '').trim();
      var btn = document.getElementById('rv-submit');
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Gönderiliyor…';
      // üye girişliyse token hem başlıkta hem gövdede taşınır (proxy iletir)
      var mtok = null;
      try { mtok = (JSON.parse(localStorage.getItem('gnc_member') || 'null') || {}).token || null; } catch (_) {}
      var headers = { 'content-type': 'application/json' };
      if (mtok) headers['authorization'] = 'Bearer ' + mtok;
      fetch(gwq('/api/reviews'), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          providerSlug: P.slug,
          rating: rating,
          comment: comment,
          appointmentCode: code,
          memberToken: mtok || undefined
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          btn.disabled = false;
          btn.textContent = 'Değerlendirmeyi Gönder';
          if (x.ok && x.j && x.j.ok) {
            form.hidden = true;
            if (doneMsg && x.j.message) doneMsg.textContent = x.j.message;
            if (doneEl) {
              doneEl.hidden = false;
              try { doneEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            }
            toast('Değerlendirmen alındı — teşekkürler!', 'ok');
          } else {
            if (errEl) { errEl.textContent = (x.j && x.j.error) || 'Değerlendirme gönderilemedi — lütfen tekrar dene.'; errEl.hidden = false; }
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Değerlendirmeyi Gönder';
          if (errEl) { errEl.textContent = 'Bağlantı hatası — lütfen tekrar dene.'; errEl.hidden = false; }
        });
    });
  })();

  // ---- hizmet select
  var selSvc = $('#f-service');
  var datesEl = $('#dates'), slotsEl = $('#slots'), sumEl = $('#sumline');
  var form = $('#book-form'), successEl = $('#success'), errEl = $('#form-err');

  function svcById(id) {
    for (var i = 0; i < SVCS.length; i++) if (SVCS[i].id === id) return SVCS[i];
    return null;
  }

  // hizmet yoksa randevu bölümü hiç basılmaz — sadece bugün vurgusu yapılmış olabilir
  if (!SVCS.length || !selSvc || !form || !datesEl || !slotsEl) {
    if (slotsEl) slotsEl.innerHTML = '<p class="hint">Bu işletme henüz hizmet eklememiş — randevu için telefonda ulaşabilirsin.</p>';
    return;
  }
  if (!errEl || !successEl || !sumEl) return;

  if (SVCS.length) {
    selSvc.innerHTML = SVCS.map(function (s) {
      var lbl = s.name + ' · ' + s.duration + ' dk · ' + fmtPrice(s.price, s.currency);
      return '<option value="' + esc(s.id) + '">' + esc(lbl) + '</option>';
    }).join('');
    // tekrar planlama: URL'deki hizmet geçerliyse onu önceden seç
    if (isReplan && replanSvc && svcById(replanSvc)) state.serviceId = replanSvc;
    selSvc.value = state.serviceId;
    if (isReplan && state.serviceId !== replanSvc) isReplan = false; // geçersiz hizmet → normal akış
  }

  // ---- 14 günlük tarih gridı
  function buildDates() {
    var today = new Date();
    var firstIso = '';
    var html = '';
    for (var i = 0; i < 14; i++) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      var iso = isoOf(d);
      if (i === 0) firstIso = iso;
      // tekrar planlamada tarih otomatik seçilmez — kullanıcı seçer
      var on = (!isReplan && i === 0);
      html += '<button type="button" class="date-btn' + (on ? ' on' : '') + '" data-date="' + iso + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="dw">' + DAYS_TR[d.getDay()] + '</span><span class="dn">' + d.getDate() + ' ' + MON_TR[d.getMonth()] + '</span></button>';
    }
    datesEl.innerHTML = html;
    state.date = isReplan ? null : firstIso;
    datesEl.addEventListener('click', function (e) {
      var b = e.target.closest('.date-btn');
      if (!b) return;
      var bs = datesEl.querySelectorAll('.date-btn');
      for (var i = 0; i < bs.length; i++) { bs[i].classList.remove('on'); bs[i].setAttribute('aria-pressed', 'false'); }
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      state.date = b.getAttribute('data-date');
      state.time = null;
      loadSlots();
    });
  }

  // ---- slotlar + "İlk uygun saat" hızlı seçimi
  var quickBtn = document.getElementById('quick-slot');
  var quickTime = null;
  function setQuick(available, label) {
    if (!quickBtn) return;
    quickTime = available ? String(available) : null;
    if (quickTime && !state.time) {
      quickBtn.textContent = 'İlk uygun saat: ' + (label || quickTime);
      quickBtn.hidden = false;
    } else {
      quickBtn.hidden = true;
    }
  }
  if (quickBtn) quickBtn.addEventListener('click', function () {
    if (!quickTime) return;
    var btns = slotsEl.querySelectorAll('.slot');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent === quickTime && !btns[i].disabled) { btns[i].click(); return; }
    }
    // buton bulunamazsa (nadir) doğrudan seç
    state.time = quickTime;
    updateSummary();
    quickBtn.hidden = true;
  });

  function loadSlots() {
    hideErr();
    closeWaitlist(); // ⏳ yeni yükleme — otomatik açılan bekleme bölümünü kapat
    if (!state.serviceId || !state.date) return;
    slotsEl.innerHTML = '<div class="slotload"><span class="spin dark"></span> Uygun saatler yükleniyor…</div>';
    fetch(gwq('/api/businesses/' + encodeURIComponent(P.slug) + '/slots?date=' + state.date + '&serviceId=' + encodeURIComponent(state.serviceId)), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) {
          slotsEl.innerHTML = '<p class="hint err-txt">' + esc(x.j && x.j.error ? x.j.error : 'Saatler yüklenemedi.') + '</p>';
          return;
        }
        renderSlots(x.j.slots || []);
        setQuick(x.j.nextAvailable, x.j.nextAvailableLabel);
      })
      .catch(function () {
        slotsEl.innerHTML = '<p class="hint err-txt">Bağlantı hatası — <a href="#" id="slot-retry">tekrar dene</a>.</p>';
        var rt = document.getElementById('slot-retry');
        if (rt) rt.addEventListener('click', function (e) { e.preventDefault(); loadSlots(); });
      });
  }

  function renderSlots(slots) {
    if (!slots.length) {
      slotsEl.innerHTML = '<p class="hint">Bu tarihte saat aralığı bulunamadı — işletme kapalı olabilir, başka bir gün dene.</p>';
      openWaitlist(true); // ⏳ slot yok — bekleme listesi alternatifini göster
      updateSummary();
      return;
    }
    slotsEl.innerHTML = '';
    var anyFree = false;
    slots.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.textContent = s.time;
      if (s.available) {
        anyFree = true;
        b.addEventListener('click', function () {
          var olds = slotsEl.querySelectorAll('.slot.on');
          for (var i = 0; i < olds.length; i++) olds[i].classList.remove('on');
          b.classList.add('on');
          state.time = s.time;
          if (quickBtn) quickBtn.hidden = true; // saat seçildi — hızlı buton gereksiz
          hideErr();
          updateSummary();
        });
      } else {
        b.disabled = true;
        b.title = 'Dolu';
      }
      slotsEl.appendChild(b);
    });
    if (!anyFree) {
      var p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Bu günün tüm saatleri dolu — lütfen başka bir tarih seç.';
      slotsEl.appendChild(p);
      openWaitlist(true); // ⏳ tüm saatler dolu — bekleme listesi alternatifini göster
    }
    updateSummary();
  }

  function updateSummary() {
    var s = svcById(state.serviceId);
    if (!s || !state.date || !state.time) { sumEl.hidden = true; return; }
    var dp = state.date.split('-');
    sumEl.innerHTML = '🧾 <b>' + esc(s.name) + '</b> · ' + esc(dp[2] + '.' + dp[1] + '.' + dp[0]) + ' <b>' + esc(state.time) + '</b>' + (typeof s.price === 'number' ? ' · ' + esc(fmtPrice(s.price, s.currency)) : '');
    sumEl.hidden = false;
  }

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    errEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    toast(msg, 'err');
  }
  function hideErr() { errEl.hidden = true; }

  // ---- hizmet seçilince
  selSvc.addEventListener('change', function () {
    state.serviceId = selSvc.value;
    state.time = null;
    loadSlots();
  });

  // ---- listedeki "Randevu Al" butonları
  document.querySelectorAll('.svc-pick').forEach(function (b) {
    b.addEventListener('click', function () {
      selSvc.value = b.getAttribute('data-svc');
      selSvc.dispatchEvent(new Event('change'));
      document.getElementById('randevu').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Hizmet seçildi — tarih ve saat seç.', 'ok');
    });
  });

  // ---- gönderim
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideErr();
    var name = $('#f-name').value.trim();
    var phone = $('#f-phone').value.trim();
    var note = $('#f-note').value.trim();
    var hp = $('#f-web').value; // honeypot — boş kalmalı

    if (!SVCS.length) return showErr('Bu işletmede seçilebilir hizmet yok.');
    if (!state.date) return showErr('Lütfen bir tarih seç.');
    if (!state.time) return showErr('Lütfen bir saat seç.');
    if (name.length < 2) return showErr('Lütfen adını yaz (en az 2 harf).');
    if (phone.replace(/\\D/g, '').length < 10) return showErr('Geçerli bir telefon numarası gir (örn. 0555 111 22 33).');

    var btn = $('#submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Gönderiliyor…';

    // üye girişliyse randevuyu hesaba bağla: token gövdede taşınır
    // (backend memberToken → memberId FK yazar; misafirde alan yok, akış aynı)
    var mtok = null;
    try { mtok = (JSON.parse(localStorage.getItem('gnc_member') || 'null') || {}).token || null; } catch (_) {}

    fetch(gwq('/api/book'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerSlug: P.slug,
        serviceId: state.serviceId,
        staffId: null,
        date: state.date,
        time: state.time,
        customerName: name,
        customerPhone: phone,
        customerEmail: '',
        customerNote: note,
        website: hp,
        memberToken: mtok || undefined
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        btn.disabled = false;
        btn.textContent = 'Randevuyu Onayla';
        if (x.ok && x.j && x.j.success && x.j.data) {
          showSuccess(x.j.data);
        } else {
          showErr((x.j && x.j.error) || 'Randevu oluşturulamadı — lütfen tekrar dene.');
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Randevuyu Onayla';
        showErr('Bağlantı hatası — lütfen tekrar dene.');
      });
  });

  function showSuccess(d) {
    $('#s-biz').textContent = d.providerName || P.name;
    $('#s-service').textContent = d.serviceName || '';
    $('#s-when').textContent = (d.date || '') + ' ' + (d.time || '');
    $('#s-name').textContent = d.customerName || '';
    $('#s-phone').textContent = d.customerPhone || '';
    if (typeof d.price === 'number') {
      $('#s-price').textContent = fmtPrice(d.price, d.currency);
      $('#s-price-row').hidden = false;
    }
    if (d.appointmentCode) {
      $('#s-code').textContent = d.appointmentCode;
      $('#s-code-row').hidden = false;
      // 📅 takvime ekle — randevu koduyla ICS indir (hatırlatıcı tercihi kapalıysa alarm'sız)
      var icsL = document.getElementById('s-ics-link');
      if (icsL) {
        var icsH = gwq('/api/appointments/ics?code=' + encodeURIComponent(d.appointmentCode));
        if (!remindersOn()) icsH += '&alarm=0';
        icsL.href = icsH;
        icsL.hidden = false;
      }
    } else {
      var icsL0 = document.getElementById('s-ics-link');
      if (icsL0) icsL0.hidden = true;
    }
    if (d.status) {
      $('#s-status').textContent = d.status === 'onaylandi' ? 'Onaylandı'
        : d.status === 'beklemede' ? 'Onay bekliyor' : d.status;
    }
    var pendNote = $('#s-pending-note');
    if (pendNote) pendNote.hidden = d.status === 'onaylandi';
    // üye girişliyse "Randevularıma git" kısayolunu göster (→ /uyelik)
    var apptLink = document.getElementById('s-appts-link');
    if (apptLink) {
      var ma = null;
      try { ma = JSON.parse(localStorage.getItem('gnc_member') || 'null'); } catch (_) {}
      apptLink.hidden = !(ma && ma.token);
    }
    var wa = $('#wa-link');
    if (d.whatsappLink) {
      wa.href = d.whatsappLink;
      wa.style.display = '';
    } else {
      wa.style.display = 'none';
    }
    form.hidden = true;
    sumEl.hidden = true;
    successEl.hidden = false;
    successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Randevun oluşturuldu!', 'ok');
  }

  // ---- yeni randevu
  var again = document.getElementById('again-btn');
  if (again) again.addEventListener('click', function () {
    successEl.hidden = true;
    form.hidden = false;
    $('#f-name').value = '';
    $('#f-phone').value = '';
    $('#f-note').value = '';
    state.time = null;
    loadSlots();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (SVCS.length) {
    buildDates();
    if (isReplan) {
      // 🔁 tekrar planlama: saatler henüz yüklenmez (tarih yok) — kullanıcıya rehber göster
      var rs = svcById(state.serviceId) || {};
      slotsEl.innerHTML = '<p class="hint">Tekrar planlama: <b>' + esc(rs.name || 'Hizmet') + '</b> seçili — tarih ve saat seç.</p>';
      var replanTarget = document.getElementById('randevu');
      if (replanTarget) replanTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Tekrar planlama — hizmet hazır: ' + (rs.name || '') + '. Tarih ve saat seç.', 'ok');
    } else {
      loadSlots();
    }
  } else {
    slotsEl.innerHTML = '<p class="hint">Bu işletme henüz hizmet eklememiş.</p>';
  }

  // ---- konum haritası
  var dMapEl = document.getElementById('detail-map');
  if (dMapEl && typeof L !== 'undefined' && typeof P.lat === 'number' && typeof P.lng === 'number') {
    var dMap = L.map('detail-map', { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları'
    }).addTo(dMap);
    var dSize = [26, 26];
    var dIcon = L.divIcon({ className: '', html: '<div class="biz-pin"><span class="pin-dot"></span></div>', iconSize: dSize, iconAnchor: [13, 13], popupAnchor: [0, -19] });
    var dM = L.marker([P.lat, P.lng], { icon: dIcon }).addTo(dMap);
    dM.bindPopup('<div class="biz-pop"><div class="pop-t">' + esc(P.name) + '</div><div class="pop-s">' + esc(P.city || '') + (P.district ? ' · ' + esc(P.district) : '') + '</div></div>', { maxWidth: 240 });
    dMap.setView([P.lat, P.lng], 15);
    dM.openPopup();
    setTimeout(function () { dMap.invalidateSize(); }, 120);
  }

  // ---- üye prefill: girişli üyenin adı/telefonu forma otomatik dolar
  function fmtPhoneMem(d) {
    d = String(d || '').replace(/\\D/g, '');
    if (d.length === 12 && d.slice(0, 2) === '90') d = '0' + d.slice(2);
    if (d.length === 11) return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9);
    return d;
  }
  function onMember(m) {
    var n = document.getElementById('f-name'), p = document.getElementById('f-phone');
    if (n && !n.value) n.value = m.name || '';
    if (p && !p.value) p.value = fmtPhoneMem(m.phone);
    var note = document.getElementById('member-note');
    if (note) {
      note.textContent = (m.name || '') + ' olarak randevu alıyorsun — üyeliksiz de devam edebilirsin.';
      note.hidden = false;
    }
  }

  // ---- ⏳ bekleme listesi (dolu slot alternatifi — Fresha/Booksy waitlist)
  var wlBox = document.getElementById('waitlist-box');
  var wlDone = document.getElementById('wl-done');
  var wlAuto = false; // bölüm otomatik (slot yok/dolu) mı açıldı
  function openWaitlist(auto) {
    if (!wlBox) return;
    wlAuto = !!auto;
    wlBox.hidden = false;
    if (wlDone) wlDone.hidden = true;
    // randevu formundaki mevcut seçimleri bekleme formuna taşı (boşsa)
    var nm = document.getElementById('f-name'), ph = document.getElementById('f-phone');
    var wn = document.getElementById('wl-name'), wp = document.getElementById('wl-phone');
    if (nm && wn && !wn.value) wn.value = nm.value;
    if (ph && wp && !wp.value) wp.value = ph.value;
    var wd = document.getElementById('wl-date');
    if (wd && state.date && !wd.value) wd.value = state.date;
    var wt = document.getElementById('wl-time');
    if (wt && state.time && !wt.value) wt.value = state.time;
    try { wlBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
  }
  function closeWaitlist() {
    if (!wlBox || wlBox.hidden) return;
    if (wlAuto) { wlBox.hidden = true; wlAuto = false; } // manuel açılan kalsın
  }
  var wlOpenBtn = document.getElementById('wl-open');
  if (wlOpenBtn) wlOpenBtn.addEventListener('click', function () {
    openWaitlist(false);
    toast('Bilgilerini bırak — randevu açılır açılmaz seni arayalım.', 'ok');
  });
  var wlForm = document.getElementById('waitlist-form');
  if (wlForm) {
    var wlPhoneEl = document.getElementById('wl-phone');
    if (wlPhoneEl) wlPhoneEl.addEventListener('input', function () { maskTrPhone(wlPhoneEl); });
    var wlDateEl = document.getElementById('wl-date');
    if (wlDateEl) wlDateEl.min = isoOf(new Date()); // istenen tarih en erken bugün
    function wlShowErr(msg) {
      var el = document.getElementById('wl-err');
      if (el) { el.textContent = msg; el.hidden = false; }
      toast(msg, 'err');
    }
    wlForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var el = document.getElementById('wl-err');
      if (el) el.hidden = true;
      var name = (document.getElementById('wl-name').value || '').trim();
      var phone = (document.getElementById('wl-phone').value || '').trim();
      var date = (wlDateEl ? wlDateEl.value : '') || '';
      var time = (document.getElementById('wl-time').value || '').trim();
      var note = (document.getElementById('wl-note').value || '').trim();
      if (name.length < 2) return wlShowErr('Lütfen adını yaz (en az 2 harf).');
      if (phone.replace(/\\D/g, '').length < 10) return wlShowErr('Geçerli bir telefon numarası gir (örn. 0555 111 22 33).');
      if (!date) return wlShowErr('İstediğin tarihi seç.');
      var svc = svcById(state.serviceId);
      var btn = document.getElementById('wl-submit');
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Ekleniyor…';
      // üye girişliyse bekleme kaydı hesaba bağlanır (memberId FK)
      var mtok = null;
      try { mtok = (JSON.parse(localStorage.getItem('gnc_member') || 'null') || {}).token || null; } catch (_) {}
      var headers = { 'content-type': 'application/json' };
      if (mtok) headers['authorization'] = 'Bearer ' + mtok;
      fetch(gwq('/api/waitlist'), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          providerSlug: P.slug,
          customerName: name,
          customerPhone: phone,
          serviceName: svc ? svc.name : '',
          preferredDate: date,
          preferredSlot: time || undefined,
          note: note || undefined
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          btn.disabled = false;
          btn.textContent = 'Bekleme Listesine Gir';
          if (x.ok && x.j && x.j.ok) {
            wlForm.hidden = true;
            var m = document.getElementById('wl-done-msg');
            if (m && x.j.message) m.textContent = x.j.message;
            if (wlDone) {
              wlDone.hidden = false;
              try { wlDone.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            }
            toast('Bekleme listesine alındın!', 'ok');
          } else {
            wlShowErr((x.j && x.j.error) || 'Bekleme listesine eklenemedi — lütfen tekrar dene.');
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Bekleme Listesine Gir';
          wlShowErr('Bağlantı hatası — lütfen tekrar dene.');
        });
    });
  }

  // ---- üyelik butonu etiketi (girişliyse üye adını göster + prefill)
  (function () {
    var btn = document.getElementById('member-btn');
    var a = null;
    try { a = JSON.parse(localStorage.getItem('gnc_member') || 'null'); } catch (_) {}
    if (!a || !a.token) return;
    fetch(gwq('/api/member/me'), { headers: { accept: 'application/json', authorization: 'Bearer ' + a.token } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok && x.j && x.j.member) {
          if (btn) {
            btn.textContent = '👤 ' + String(x.j.member.name || '').trim().split(/\\s+/)[0];
            btn.classList.add('logged');
            btn.setAttribute('aria-label', 'Üyelik — ' + x.j.member.name);
          }
          onMember(x.j.member);
        } else {
          try { localStorage.removeItem('gnc_member'); } catch (_) {}
        }
      })
      .catch(function () {});
  })();
})();

/* ═══ Vitrin (tur4): portföy kategori filtresi + lightbox ═══
   Ayrı IIFE — üstteki akışın erken return'lerinden (hizmeti olmayan işletme)
   bağımsız çalışır. Foto verisi JS'e GÖMİLMEZ: pf-item img'lerinin src'si
   ve data-* öznitelikleri DOM'dan okunur (sayfa boyutu ikiye katlanmaz). */
(function () {
  'use strict';
  var pfGrid = document.getElementById('pf-grid');
  var lbxEl = document.getElementById('pf-lightbox');
  if (!pfGrid || !lbxEl) return;
  var lbxImg = document.getElementById('lbx-img');
  var lbxTitle = document.getElementById('lbx-title');
  var lbxCapT = document.getElementById('lbx-cap-t');
  var lbxCount = document.getElementById('lbx-count');
  var lbxClose = document.getElementById('lbx-close');
  var lbxPrev = document.getElementById('lbx-prev');
  var lbxNext = document.getElementById('lbx-next');
  var pfStatus = document.getElementById('pf-status');

  // ---- kategori filtre çipleri (Tümü / Kesim / Saç Boyama / …)
  var pfChips = document.querySelectorAll('.pf-chip');
  for (var ci = 0; ci < pfChips.length; ci++) {
    (function (chip) {
      chip.addEventListener('click', function () {
        var cat = chip.getAttribute('data-cat') || '';
        for (var k = 0; k < pfChips.length; k++) {
          var on = pfChips[k] === chip;
          pfChips[k].classList.toggle('on', on);
          if (on) pfChips[k].setAttribute('aria-pressed', 'true');
          else pfChips[k].removeAttribute('aria-pressed');
        }
        var items = pfGrid.querySelectorAll('.pf-item');
        var vis = 0;
        for (var i = 0; i < items.length; i++) {
          var show = cat === '' || items[i].getAttribute('data-cat') === cat;
          items[i].hidden = !show;
          if (show) vis++;
        }
        if (pfStatus) pfStatus.textContent = vis + ' fotoğraf gösteriliyor';
      });
    })(pfChips[ci]);
  }

  // ---- lightbox (yalnız görünür (filtrelenmiş) fotoğrafları gez)
  function pf__visible() {
    var items = pfGrid.querySelectorAll('.pf-item');
    var out = [];
    for (var i = 0; i < items.length; i++) if (!items[i].hidden) out.push(items[i]);
    return out;
  }
  var lbx__cur = -1;
  var lbx__lastFocus = null;
  function lbx__show(idx) {
    var items = pf__visible();
    if (!items.length) return;
    lbx__cur = ((idx % items.length) + items.length) % items.length;
    var it = items[lbx__cur];
    var img = it.querySelector('img');
    lbxImg.setAttribute('src', img ? img.getAttribute('src') : '');
    lbxImg.setAttribute('alt', img ? (img.getAttribute('alt') || '') : '');
    var t = it.getAttribute('data-title') || '';
    var c = it.getAttribute('data-cap') || '';
    lbxTitle.textContent = t;
    lbxTitle.style.display = t ? '' : 'none';
    lbxCapT.textContent = c;
    lbxCapT.style.display = c ? '' : 'none';
    lbxCount.textContent = (lbx__cur + 1) + ' / ' + items.length;
    var many = items.length > 1;
    lbxPrev.disabled = !many;
    lbxNext.disabled = !many;
  }
  function lbx__open(item) {
    lbx__lastFocus = item;
    lbx__show(pf__visible().indexOf(item));
    lbxEl.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    try { lbxClose.focus(); } catch (_) {}
  }
  function lbx__close() {
    lbxEl.hidden = true;
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    lbxImg.setAttribute('src', '');
    if (lbx__lastFocus && document.contains(lbx__lastFocus)) {
      try { lbx__lastFocus.focus(); } catch (_) {}
    }
  }
  pfGrid.addEventListener('click', function (e) {
    var it = e.target && e.target.closest ? e.target.closest('.pf-item') : null;
    if (it) lbx__open(it);
  });
  if (lbxClose) lbxClose.addEventListener('click', lbx__close);
  if (lbxPrev) lbxPrev.addEventListener('click', function () { lbx__show(lbx__cur - 1); });
  if (lbxNext) lbxNext.addEventListener('click', function () { lbx__show(lbx__cur + 1); });
  lbxEl.addEventListener('click', function (e) { if (e.target === lbxEl) lbx__close(); });
  document.addEventListener('keydown', function (e) {
    if (lbxEl.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); lbx__close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); lbx__show(lbx__cur - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); lbx__show(lbx__cur + 1); }
  });
})();
`;

// ---------------------------------------------------------------- İSTEMCİ JS: ÜYELİK

export const MEMBER_JS = `
(function () {
  'use strict';
  var GWPORT = new URLSearchParams(location.search).get('XTransformPort');
  function gwq(p) {
    if (!GWPORT) return p;
    return p + (p.indexOf('?') === -1 ? '?' : '&') + 'XTransformPort=' + encodeURIComponent(GWPORT);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var MON_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtPhone(d) {
    d = String(d || '').replace(/\\D/g, '');
    if (d.length === 12 && d.slice(0, 2) === '90') d = '0' + d.slice(2);
    if (d.length === 11) return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9);
    return d;
  }
  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    return d.getDate() + ' ' + MON_TR[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtPrice(price, cur) {
    if (typeof price !== 'number') return '';
    var n = new Intl.NumberFormat('tr-TR').format(price);
    return cur && cur !== 'TRY' ? n + ' ' + cur : n + ' \\u20BA';
  }
  var toastTimer = null;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 4200);
  }

  var LS_KEY = 'gnc_member';
  // ---- telefon görüntü maskeleme: "05329999999" → "0532 999 99 99"
  // Yalnızca input görüntüsü; gönderilen değer sunucuda normalize edilir.
  // 0 ile başlamayan / 11 haneden uzun (örn. +90…) girişlere dokunulmaz.
  function maskTrPhone(input) {
    var d = String(input.value || '').replace(/\\D/g, '');
    if (!d || d.charAt(0) !== '0' || d.length > 11) return;
    var out = d;
    if (d.length > 9) out = d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9);
    else if (d.length > 7) out = d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7);
    else if (d.length > 4) out = d.slice(0, 4) + ' ' + d.slice(4);
    input.value = out;
  }
  ['l-phone', 'r-phone'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { maskTrPhone(el); });
  });
  function readAuth() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      return v && v.token ? v : null;
    } catch (_) { return null; }
  }
  function saveAuth(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (_) {} }
  function clearAuth() { try { localStorage.removeItem(LS_KEY); } catch (_) {} }

  // ---- 🔔 hatırlatıcı tercihi (localStorage — bu tur için istemci tarafı çözüm:
  // şemada üye tercih modeli yok ve şemaya dokunulamıyor). Tercih kapalıysa
  // "📅 Takvime ekle" linkine &alarm=0 eklenir → ICS'e VALARM bloğu yazılmaz.
  var REM_KEY = 'gnc_reminders';
  function remindersOn() {
    try { return (localStorage.getItem(REM_KEY) || 'on') !== 'off'; } catch (_) { return true; }
  }
  function setReminders(on) {
    try { localStorage.setItem(REM_KEY, on ? 'on' : 'off'); } catch (_) {}
  }
  function renderRemPref() {
    var row = document.getElementById('rem-toggle');
    if (!row) return;
    var on = remindersOn();
    row.setAttribute('aria-checked', String(on));
    var st = document.getElementById('rem-state');
    if (st) st.textContent = on
      ? 'Açık — randevu saatinden 2 saat önce hatırlatma alınır'
      : 'Kapalı — hatırlatma alınmaz, istediğin an açabilirsin';
  }

  // "📅 Takvime ekle" indirme linki (3002 same-origin proxy'si)
  function icsHref(code) {
    var h = gwq('/api/appointments/ics?code=' + encodeURIComponent(code));
    if (!remindersOn()) h += '&alarm=0';
    return h;
  }

  var authEl = document.getElementById('mem-auth');
  var loggedEl = document.getElementById('mem-logged');
  var listEl = document.getElementById('appt-list');

  function showTab(which) {
    var tL = document.getElementById('tab-login'), tR = document.getElementById('tab-register');
    var fL = document.getElementById('login-form'), fR = document.getElementById('register-form');
    var isLogin = which === 'login';
    tL.classList.toggle('on', isLogin); tR.classList.toggle('on', !isLogin);
    tL.setAttribute('aria-selected', String(isLogin)); tR.setAttribute('aria-selected', String(!isLogin));
    fL.hidden = !isLogin; fR.hidden = isLogin;
  }
  document.getElementById('tab-login').addEventListener('click', function () { showTab('login'); });
  document.getElementById('tab-register').addEventListener('click', function () { showTab('register'); });

  function showErr(id, msg) {
    var el = document.getElementById(id);
    el.textContent = msg; el.hidden = false;
  }
  function hideErr(id) { document.getElementById(id).hidden = true; }

  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.innerHTML = busy ? '<span class="spin"></span> ' + label : label;
  }

  // ---- durum render
  function renderLogged(member) {
    authEl.hidden = true;
    loggedEl.hidden = false;
    document.getElementById('m-avatar').textContent = (member.name || 'A').trim().charAt(0).toLocaleUpperCase('tr');
    document.getElementById('m-name').textContent = member.name || '';
    document.getElementById('m-phone').textContent = fmtPhone(member.phone);
    var em = document.getElementById('m-email');
    if (member.email) { em.textContent = member.email; em.hidden = false; } else { em.hidden = true; }
    var rp = document.getElementById('rem-pref');
    if (rp) { renderRemPref(); rp.hidden = false; }
    loadAppointments();
    loadStampCards();
  }
  function renderAuth() {
    loggedEl.hidden = true;
    authEl.hidden = false;
    var rp2 = document.getElementById('rem-pref');
    if (rp2) rp2.hidden = true;
    showTab('login');
  }

  // ---- 🎟️ damga kartlarım (sadakat — "N hizmet al → 1 ücretsiz")
  // Yalnız üye girişliyken görünür (bölüm #mem-logged içinde). Kartlar
  // aktif damga programı olan işletmeler için döner; damga basma işlemi
  // randevu tamamlandığında / admin panelinden yapılır.
  function renderStampCards(items) {
    var wrap = document.getElementById('sc-list');
    if (!wrap) return;
    if (!items || !items.length) {
      wrap.innerHTML = '<div class="mem-card empty-box">Henüz damga kartın yok.<br>Damga programı olan işletmelerden hizmet aldıkça kartın burada birikir.</div>';
      return;
    }
    wrap.innerHTML = items.map(function (c) {
      var req = Number(c.requiredStamps) || 10;
      var st = Math.max(0, Math.min(Number(c.stamps) || 0, req));
      var dots = '';
      for (var i = 0; i < req; i++) {
        dots += '<span class="sc-dot ' + (i < st ? 'full' : 'empty') + '" aria-hidden="true">' + (i < st ? '✓' : '·') + '</span>';
      }
      var kalan = Math.max(req - st, 0);
      var reward = kalan > 0
        ? '<b>' + kalan + ' damga kaldı</b> → ödül: ' + esc(c.rewardDescription)
        : '<b>Ödül hakkın doğdu!</b> Sıradaki ziyaretinde ' + esc(c.rewardDescription) + ' seni bekliyor.';
      return '<div class="mem-card sc-card">' +
        '<div class="sc-top"><span class="sc-biz">' + esc(c.providerName) + '</span>' +
        (Number(c.redeemedCount) > 0 ? '<span class="sc-won">' + c.redeemedCount + ' ödül kazandın</span>' : '') +
        '</div>' +
        '<div class="sc-dots" role="img" aria-label="' + st + ' / ' + req + ' damga dolu">' + dots + '</div>' +
        '<p class="sc-reward">' + reward + '</p>' +
        '</div>';
    }).join('');
  }
  function loadStampCards() {
    var wrap = document.getElementById('sc-list');
    if (!wrap) return;
    var a = readAuth();
    if (!a) return; // bölüm zaten girişte gizli (#mem-logged)
    fetch(gwq('/api/stampcard'), { headers: { accept: 'application/json', authorization: 'Bearer ' + a.token } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) {
          // sessiz düşük profil — kartlar kritik değil, hata kartı basma
          wrap.innerHTML = '<div class="mem-card empty-box">Damga kartları şu anda alınamadı. <button type="button" class="btn btn-ghost" id="sc-retry" style="margin-top:8px">Tekrar dene</button></div>';
          var rb = document.getElementById('sc-retry');
          if (rb) rb.addEventListener('click', loadStampCards);
          return;
        }
        renderStampCards(x.j.items || []);
      })
      .catch(function () {
        wrap.innerHTML = '<div class="mem-card empty-box">Damga kartları şu anda alınamadı. <button type="button" class="btn btn-ghost" id="sc-retry" style="margin-top:8px">Tekrar dene</button></div>';
        var rb2 = document.getElementById('sc-retry');
        if (rb2) rb2.addEventListener('click', loadStampCards);
      });
  }

  // ---- randevularım
  var ST = {
    beklemede: { label: 'Onay bekliyor', cls: 'st-beklemede' },
    onaylandi: { label: 'Onaylandı', cls: 'st-onaylandi' },
    tamamlandi: { label: 'Tamamlandı', cls: 'st-tamamlandi' },
    gelmedi: { label: 'Gelmedi', cls: 'st-gelmedi' },
    iptal: { label: 'İptal edildi', cls: 'st-iptal' }
  };
  function loadAppointments() {
    listEl.innerHTML = '<div class="mem-card" style="text-align:center;color:var(--sub)"><span class="spin dark"></span> Randevuların yükleniyor…</div>';
    var a = readAuth();
    if (!a) { renderAuth(); return; }
    fetch(gwq('/api/member/appointments'), { headers: { accept: 'application/json', authorization: 'Bearer ' + a.token } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.status === 401 || (x.j && x.j.error && String(x.j.error).indexOf('Oturum') === 0)) { clearAuth(); renderAuth(); return; }
        if (!x.ok) {
          listEl.innerHTML = '<div class="mem-card empty-box">' + esc((x.j && x.j.error) || 'Randevular yüklenemedi.') + '<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">Tekrar dene</button></div>';
          var rb = document.getElementById('appt-retry');
          if (rb) rb.addEventListener('click', loadAppointments);
          return;
        }
        renderAppointments(x.j.items || []);
      })
      .catch(function () {
        listEl.innerHTML = '<div class="mem-card empty-box">Bağlantı hatası — internetini kontrol et.<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">Tekrar dene</button></div>';
        var rb2 = document.getElementById('appt-retry');
        if (rb2) rb2.addEventListener('click', loadAppointments);
      });
  }

  function bizHref(slug) {
    var base = (document.getElementById('page-cfg') || {}).textContent;
    var bd = '';
    try { bd = base ? (JSON.parse(base).baseDomain || '') : ''; } catch (_) {}
    var host = location.hostname || '';
    // absolute yalnız gerçek subdomain dağıtımında; gateway/önizlemede relative
    if (bd && (host === bd || host.indexOf('.' + bd) !== -1)) {
      return 'https://' + slug + '.' + bd;
    }
    return gwq('/isletme/' + encodeURIComponent(slug));
  }

  // href sonuna query param ekler (XTransformPort zaten varsa & ile, yoksa ? ile)
  function withParams(href, extra) {
    return href + (href.indexOf('?') === -1 ? '?' : '&') + extra;
  }

  // ---- iptal edilen randevuların kısa süreli yerel kaydı ----
  // API aktif randevuları döndürür (iptal olanlar sunucuda filtrelenir); iptal
  // edilenler 30 gün boyunca burada tutulur ki "🔁 Tekrar planla" kısayolu
  // kart üzerinde görünsün. Aynı işletme+hizmete yeni randevu alınca kayıt düşer.
  var CANCELLED_KEY = 'gnc_cancelled_appts';
  var CANCELLED_TTL = 30 * 24 * 3600 * 1000;
  function loadCancelled() {
    try {
      var v = JSON.parse(localStorage.getItem(CANCELLED_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }
  function saveCancelled(v) {
    try { localStorage.setItem(CANCELLED_KEY, JSON.stringify(v.slice(0, 20))); } catch (_) {}
  }
  function rememberCancelled(item) {
    if (!item || !item.id || !item.providerSlug) return; // işletme bilgisi yoksa kart bağlanamaz — kaydetme
    var list = loadCancelled().filter(function (c) { return c.id !== item.id; });
    list.unshift({
      id: item.id, code: item.code, providerName: item.providerName, providerSlug: item.providerSlug,
      serviceId: item.serviceId, serviceName: item.serviceName, staffName: item.staffName,
      price: item.price, currency: item.currency, date: item.date, cancelledAt: Date.now()
    });
    saveCancelled(list);
  }

  var lastItems = [];

  function apptCard(it, cancelledMode) {
    var st = cancelledMode ? ST.iptal : (ST[it.status] || { label: it.status, cls: 'st-gelmedi' });
    var cancellable = !cancelledMode && (it.status === 'beklemede' || it.status === 'onaylandi') && new Date(it.date).getTime() > Date.now();
    // İptal edilen randevu → aynı işletme/hizmete tekrar planlama kısayolu
    var replan = '';
    if (cancelledMode && it.providerSlug) {
      replan = '<button type="button" class="appt-replan" data-slug="' + esc(it.providerSlug) + '" data-svc="' + esc(it.serviceId || '') + '" aria-label="' + esc(it.providerName || '') + ' — ' + esc(it.serviceName || 'aynı hizmet') + ' için yeni randevu al">Tekrar planla</button>';
    }
    // ⭐ Değerlendirme: tamamlanmış ya da tarihi geçmiş + henüz değerlendirilmemiş
    // (iptal/reddedildi randevular API'de zaten listelenmez)
    var reviewable = !cancelledMode && !it.reviewed && it.providerSlug &&
      (it.status === 'tamamlandi' || new Date(it.date).getTime() < Date.now());
    var reviewBtn = reviewable
      ? '<button type="button" class="appt-review" data-id="' + esc(it.id) + '" data-slug="' + esc(it.providerSlug) + '" data-biz="' + esc(it.providerName || '') + '" data-svc="' + esc(it.serviceName || 'Hizmet') + '" data-when="' + esc(fmtWhen(it.date)) + '" data-code="' + esc(it.code || '') + '" aria-label="' + esc(it.providerName || '') + ' — ' + esc(it.serviceName || 'hizmet') + ' randevusunu değerlendir">Değerlendir</button>'
      : '';
    // 📅 Takvime ekle: aktif randevuların ICS dosyası. İptal kartında
    // gösterilmez (iptal randevuyu takvime eklemek anlamsız — orada "Tekrar
    // planla" kısayolu öne çıkar; sunucu yine de STATUS:CANCELLED üretir).
    var icsBtn = (!cancelledMode && it.code)
      ? '<a class="appt-ics" href="' + esc(icsHref(it.code)) + '" download aria-label="' + esc(it.providerName || '') + ' — ' + esc(it.serviceName || 'randevu') + ' takvim dosyasını (.ics) indir">Takvime ekle</a>'
      : '';
    return '<div class="appt">' +
      '<div class="appt-main">' +
      '<div class="appt-biz"><a href="' + esc(bizHref(it.providerSlug || '')) + '" style="color:inherit;text-decoration:none">' + esc(it.providerName) + '</a></div>' +
      '<div class="appt-svc">' + esc(it.serviceName || 'Hizmet') + (it.staffName ? ' · ' + esc(it.staffName) : '') + (!cancelledMode && typeof it.price === 'number' && it.price > 0 ? ' · ' + esc(fmtPrice(it.price, it.currency)) : '') + '</div>' +
      '<div class="appt-when">' + esc(fmtWhen(it.date)) + (cancelledMode ? ' <span style="color:var(--sub);font-weight:400">(iptal edildi)</span>' : '') + '</div>' +
      '<div class="appt-code" style="margin-top:3px">No: ' + esc(it.code) + '</div>' +
      '</div>' +
      '<div style="display:grid;gap:8px;justify-items:end">' +
      '<span class="st-badge ' + st.cls + '">' + esc(st.label) + '</span>' +
      (cancellable ? '<button type="button" class="appt-cancel" data-id="' + esc(it.id) + '" data-code="' + esc(it.code) + '">İptal Et</button>' : '') +
      replan +
      reviewBtn +
      icsBtn +
      '</div></div>';
  }

  function renderAppointments(items) {
    if (!items.length && !loadCancelled().length) {
      listEl.innerHTML = '<div class="mem-card empty-box">Henüz randevun yok.<br><span style="font-size:.85rem">Bir işletme seçip saniyeler içinde randevu alabilirsin.</span><br><a class="btn btn-primary" style="margin-top:12px" href="/">İşletmelere göz at</a></div>';
      return;
    }
    // iptal kayıtlarını tazele: süresi geçen ve yeniden planlananları at
    var cancelled = loadCancelled().filter(function (c) {
      if (!c.cancelledAt || Date.now() - c.cancelledAt > CANCELLED_TTL) return false;
      var rebooked = items.some(function (it) { return it.providerSlug === c.providerSlug && it.serviceId === c.serviceId; });
      return !rebooked;
    });
    saveCancelled(cancelled);
    lastItems = items;
    listEl.innerHTML = items.map(function (it) { return apptCard(it, false); })
      .concat(cancelled.slice(0, 5).map(function (c) { return apptCard(c, true); }))
      .join('');
    listEl.querySelectorAll('.appt-cancel').forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-code');
        if (!confirm('Randevu No ' + code + ' iptal edilsin mi? Bu işlem geri alınamaz.')) return;
        b.disabled = true; b.textContent = 'İptal ediliyor…';
        cancelAppointment(b.getAttribute('data-id'));
      });
    });
    // 🔁 Tekrar planla: aynı işletmenin randevu formuna taşı, hizmeti önceden seç
    // (tarih boş bırakılır — kullanıcı yeni tarihi/saati kendisi seçer)
    listEl.querySelectorAll('.appt-replan').forEach(function (b) {
      b.addEventListener('click', function () {
        var slug = b.getAttribute('data-slug');
        var svc = b.getAttribute('data-svc');
        if (!slug) return;
        var extra = 'tekrar=1' + (svc ? '&service=' + encodeURIComponent(svc) : '');
        location.href = withParams(bizHref(slug), extra);
      });
    });
    // ⭐ Değerlendir: overlay formunu bu randevu için aç (appointmentId önceden dolu)
    listEl.querySelectorAll('.appt-review').forEach(function (b) {
      b.addEventListener('click', function () {
        openRevOverlay({
          id: b.getAttribute('data-id') || '',
          slug: b.getAttribute('data-slug') || '',
          biz: b.getAttribute('data-biz') || '',
          svc: b.getAttribute('data-svc') || '',
          when: b.getAttribute('data-when') || '',
          code: b.getAttribute('data-code') || ''
        });
      });
    });
  }

  // ---- ⭐ değerlendirme overlay (Randevularım → Değerlendir)
  var revOverlay = document.getElementById('rev-overlay');
  var revTarget = null;
  var revRating = 0;
  function openRevOverlay(t) {
    if (!revOverlay) return;
    revTarget = t;
    revRating = 0;
    var sum = document.getElementById('rev-ov-sum');
    if (sum) {
      sum.innerHTML = '<b>' + esc(t.biz) + '</b><span>' + esc(t.svc) + ' · ' + esc(t.when) + ' · No: ' + esc(t.code) + '</span>';
    }
    var stars = document.querySelectorAll('#rov-stars .rev-star-btn');
    for (var i = 0; i < stars.length; i++) { stars[i].classList.remove('on'); stars[i].setAttribute('aria-pressed', 'false'); }
    var cm = document.getElementById('rov-comment');
    if (cm) cm.value = '';
    hideErr('rov-err');
    revOverlay.hidden = false;
  }
  function closeRevOverlay() { if (revOverlay) revOverlay.hidden = true; revTarget = null; }
  (function () {
    if (!revOverlay) return;
    var stars = document.querySelectorAll('#rov-stars .rev-star-btn');
    for (var i = 0; i < stars.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          revRating = parseInt(b.getAttribute('data-v'), 10) || 0;
          for (var k = 0; k < stars.length; k++) {
            var on = parseInt(stars[k].getAttribute('data-v'), 10) <= revRating;
            stars[k].classList.toggle('on', on);
            stars[k].setAttribute('aria-pressed', String(on));
          }
          hideErr('rov-err');
        });
      })(stars[i]);
    }
    var cancelBtn = document.getElementById('rov-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeRevOverlay);
    revOverlay.addEventListener('click', function (e) { if (e.target === revOverlay) closeRevOverlay(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !revOverlay.hidden) closeRevOverlay();
    });
    var sendBtn = document.getElementById('rov-send');
    if (sendBtn) sendBtn.addEventListener('click', function () {
      var a = readAuth();
      if (!a) { closeRevOverlay(); renderAuth(); return; }
      if (!revTarget || !revTarget.id || !revTarget.slug) return;
      hideErr('rov-err');
      if (!revRating) return showErr('rov-err', 'Lütfen puanını seç (1-5 yıldız).');
      var comment = (document.getElementById('rov-comment').value || '').trim();
      setBusy(sendBtn, true, 'Gönderiliyor…');
      // üye akışı: Bearer token + appointmentId (kod alanına gerek yok)
      fetch(gwq('/api/reviews'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + a.token },
        body: JSON.stringify({
          providerSlug: revTarget.slug,
          rating: revRating,
          comment: comment,
          appointmentId: revTarget.id
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          setBusy(sendBtn, false, 'Gönder');
          if (x.ok && x.j && x.j.ok) {
            closeRevOverlay();
            toast('Teşekkürler! Değerlendirmen incelemeden sonra yayınlanacak.', 'ok');
            loadAppointments();
          } else {
            showErr('rov-err', (x.j && x.j.error) || 'Değerlendirme gönderilemedi — tekrar dene.');
          }
        })
        .catch(function () {
          setBusy(sendBtn, false, 'Gönder');
          showErr('rov-err', 'Bağlantı hatası — tekrar dene.');
        });
    });
  })();

  // ---- 🔔 hatırlatıcı toggle: tercih localStorage'a yazılır; kartlardaki
  // "📅 Takvime ekle" linkleri alarm parametresine göre yeniden çizilir.
  (function () {
    var row = document.getElementById('rem-toggle');
    if (!row) return;
    row.addEventListener('click', function () {
      var on = !remindersOn();
      setReminders(on);
      renderRemPref();
      toast(on
        ? 'Hatırlatıcılar açıldı — randevudan 2 saat önce hatırlatma alırsın.'
        : 'Hatırlatıcılar kapatıldı.', 'ok');
      if (lastItems.length || loadCancelled().length) renderAppointments(lastItems);
    });
  })();

  function cancelAppointment(id) {
    var a = readAuth();
    if (!a) { renderAuth(); return; }
    var item = null;
    for (var i = 0; i < lastItems.length; i++) { if (lastItems[i].id === id) { item = lastItems[i]; break; } }
    fetch(gwq('/api/member/appointments/' + encodeURIComponent(id) + '/cancel'), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: 'Bearer ' + a.token },
      body: '{}'
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) {
          rememberCancelled(item || { id: id });
          toast('Randevu iptal edildi. Tekrar planlamak ister misin?', 'ok');
          loadAppointments();
        } else {
          toast((x.j && x.j.error) || 'İptal edilemedi.', 'err');
          loadAppointments();
        }
      })
      .catch(function () {
        toast('Bağlantı hatası — tekrar dene.', 'err');
        loadAppointments();
      });
  }

  // ---- giriş
  document.getElementById('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideErr('l-err');
    var phone = document.getElementById('l-phone').value.trim();
    var pass = document.getElementById('l-pass').value;
    if (phone.replace(/\\D/g, '').length < 10) return showErr('l-err', 'Geçerli bir telefon numarası gir.');
    if (!pass) return showErr('l-err', 'Şifreni gir.');
    var btn = this.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Giriliyor…');
    fetch(gwq('/api/member/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: phone, password: pass })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        setBusy(btn, false, 'Giriş Yap');
        if (x.ok && x.j && x.j.token) {
          saveAuth({ token: x.j.token, member: x.j.member });
          toast('Hoş geldin, ' + (x.j.member.name || '') + '!', 'ok');
          renderLogged(x.j.member);
        } else {
          showErr('l-err', (x.j && x.j.error) || 'Giriş yapılamadı.');
        }
      })
      .catch(function () { setBusy(btn, false, 'Giriş Yap'); showErr('l-err', 'Bağlantı hatası — tekrar dene.'); });
  });

  // ---- kayıt
  document.getElementById('register-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideErr('r-err');
    var name = document.getElementById('r-name').value.trim();
    var phone = document.getElementById('r-phone').value.trim();
    var email = document.getElementById('r-email').value.trim();
    var pass = document.getElementById('r-pass').value;
    if (name.length < 2) return showErr('r-err', 'Adını yaz (en az 2 harf).');
    if (phone.replace(/\\D/g, '').length < 10) return showErr('r-err', 'Geçerli bir telefon numarası gir.');
    if (pass.length < 6) return showErr('r-err', 'Şifre en az 6 karakter olmalı.');
    var btn = this.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Kaydediliyor…');
    fetch(gwq('/api/member/register'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name, phone: phone, email: email, password: pass })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        setBusy(btn, false, 'Üye Ol');
        if (x.ok && x.j && x.j.token) {
          saveAuth({ token: x.j.token, member: x.j.member });
          toast('Üyeliğin oluşturuldu!', 'ok');
          renderLogged(x.j.member);
        } else {
          showErr('r-err', (x.j && x.j.error) || 'Kayıt oluşturulamadı.');
        }
      })
      .catch(function () { setBusy(btn, false, 'Üye Ol'); showErr('r-err', 'Bağlantı hatası — tekrar dene.'); });
  });

  // ---- çıkış
  document.getElementById('logout-btn').addEventListener('click', function () {
    clearAuth();
    toast('Çıkış yapıldı. Görüşürüz!', 'ok');
    renderAuth();
  });

  // ---- KVKK: hesap silme (self-servis)
  var delOverlay = document.getElementById('del-overlay');
  var delOpenBtn = document.getElementById('delete-btn');
  var delPass = document.getElementById('del-pass');
  var delConfirm = document.getElementById('del-confirm');
  var delCancelBtn = document.getElementById('del-cancel');
  function openDel() {
    if (!delOverlay) return;
    delOverlay.hidden = false;
    hideErr('del-err');
    if (delPass) delPass.value = '';
    setTimeout(function () { try { delPass.focus(); } catch (_) {} }, 60);
  }
  function closeDel() { if (delOverlay) delOverlay.hidden = true; }
  if (delOpenBtn) delOpenBtn.addEventListener('click', openDel);
  if (delCancelBtn) delCancelBtn.addEventListener('click', closeDel);
  if (delOverlay) delOverlay.addEventListener('click', function (e) { if (e.target === delOverlay) closeDel(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && delOverlay && !delOverlay.hidden) closeDel();
  });
  if (delConfirm) delConfirm.addEventListener('click', function () {
    var a = readAuth();
    if (!a) { renderAuth(); return; }
    var pass = delPass ? delPass.value : '';
    if (!pass) return showErr('del-err', 'Onay için şifreni gir.');
    setBusy(delConfirm, true, 'Siliniyor…');
    fetch(gwq('/api/member/me'), {
      method: 'DELETE',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: 'Bearer ' + a.token },
      body: JSON.stringify({ password: pass })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        setBusy(delConfirm, false, 'Hesabımı Kalıcı Olarak Sil');
        if (x.ok && x.j && x.j.ok) {
          closeDel();
          clearAuth();
          toast('Hesabın ve tüm randevuların kalıcı olarak silindi. İyi günler!', 'ok');
          renderAuth();
        } else {
          showErr('del-err', (x.j && x.j.error) || 'Hesap silinemedi — tekrar dene.');
        }
      })
      .catch(function () {
        setBusy(delConfirm, false, 'Hesabımı Kalıcı Olarak Sil');
        showErr('del-err', 'Bağlantı hatası — tekrar dene.');
      });
  });

  // ---- ⏳ bekleme durumum (telefonla sorgu — üyeliksiz de çalışır)
  (function () {
    var qForm = document.getElementById('wlq-form');
    if (!qForm) return;
    var phoneEl = document.getElementById('wlq-phone');
    var errEl = document.getElementById('wlq-err');
    var resEl = document.getElementById('wlq-result');
    if (phoneEl) phoneEl.addEventListener('input', function () { maskTrPhone(phoneEl); });
    var ST_WL = {
      waiting: { label: 'Sıradasınız', cls: 'wl-st-waiting' },
      notified: { label: 'Aranacağınızı bildirdik', cls: 'wl-st-notified' },
      booked: { label: 'Randevunuz oluşturuldu', cls: 'wl-st-booked' }
    };
    // preferredDate floating local (T00:00) saklanır — günü ISO'dan çöz (TZ kaymasız)
    function fmtDay(iso) {
      var dpart = String(iso || '').split('T')[0];
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dpart)) return String(iso || '');
      var a = dpart.split('-');
      return a[2] + '.' + a[1] + '.' + a[0];
    }
    function wlqErr(msg) { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } }
    qForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (errEl) errEl.hidden = true;
      var phone = (phoneEl ? phoneEl.value : '').trim();
      if (phone.replace(/\\D/g, '').length < 10) return wlqErr('Geçerli bir telefon numarası gir (örn. 0555 111 22 33).');
      if (resEl) resEl.innerHTML = '<div class="mem-card" style="text-align:center;color:var(--sub)"><span class="spin dark"></span> Bekleme kayıtların sorgulanıyor…</div>';
      fetch(gwq('/api/waitlist?phone=' + encodeURIComponent(phone)), { headers: { accept: 'application/json' } })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) {
            if (resEl) resEl.innerHTML = '';
            return wlqErr((x.j && x.j.error) || 'Sorgu yapılamadı — tekrar dene.');
          }
          var items = (x.j && x.j.items) || [];
          if (!resEl) return;
          if (!items.length) {
            resEl.innerHTML = '<div class="mem-card empty-box">Bu numaraya ait aktif bekleme kaydı yok.<br><span style="font-size:.85rem">Dolu bir slot için işletme sayfasındaki "Dolu mu? Bekleme listesine gir" ile listeye girebilirsin.</span></div>';
            return;
          }
          resEl.innerHTML = items.map(function (w) {
            var st = ST_WL[w.status] || ST_WL.waiting;
            return '<div class="wl-card">' +
              '<div class="wl-card-main">' +
              '<div class="wl-card-biz">' + esc(w.providerName) + '</div>' +
              '<div class="wl-card-svc">' + esc(w.serviceName || 'Hizmet') + ' · ' + esc(fmtDay(w.preferredDate)) + (w.preferredSlot ? ' · ' + esc(w.preferredSlot) : '') + '</div>' +
              '</div>' +
              '<span class="wl-st ' + st.cls + '">' + esc(st.label) + '</span>' +
              '</div>';
          }).join('');
        })
        .catch(function () {
          if (resEl) resEl.innerHTML = '';
          wlqErr('Bağlantı hatası — tekrar dene.');
        });
    });
    // üye girişliyse telefonu önceden doldur
    var a = readAuth();
    if (a && a.member && phoneEl && !phoneEl.value) phoneEl.value = fmtPhone(a.member.phone);
  })();

  // ---- başlat: token varsa profil yoksa auth göster
  (function init() {
    var a = readAuth();
    if (!a) { renderAuth(); return; }
    fetch(gwq('/api/member/me'), { headers: { accept: 'application/json', authorization: 'Bearer ' + a.token } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok && x.j && x.j.member) {
          renderLogged(x.j.member);
        } else {
          clearAuth();
          renderAuth();
        }
      })
      .catch(function () { renderAuth(); });
  })();
})();
`;
