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

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  berber: { label: 'Berber', emoji: '💈' },
  kuafor: { label: 'Kuaför', emoji: '✂️' },
  disci: { label: 'Dişçi', emoji: '🦷' },
  guzellik: { label: 'Güzellik', emoji: '💄' },
  spa: { label: 'Spa', emoji: '🧖' },
  dovme: { label: 'Dövme', emoji: '🎨' },
};

function typeMeta(type: string) {
  return TYPE_META[type] || { label: 'İşletme', emoji: '🏪' };
}

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c2334d"/><stop offset=".55" stop-color="#8c2740"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs><rect width="100" height="100" rx="26" fill="url(#g)"/><text x="50" y="70" font-family="Arial,Helvetica,sans-serif" font-size="56" font-weight="800" fill="#fff" text-anchor="middle">G</text></svg>'
  );

// ---------------------------------------------------------------- Ortak CSS

export const STYLE_CSS = `
:root{
  --bg:#f6eef0;--ink:#2b211b;--muted:#8a7160;
  --brand:#c2334d;--amber:#b45309;--green:#0d8a63;--pink:#be185d;--teal:#0f766e;
  --glass:rgba(255,255,255,.58);--glass-strong:rgba(255,255,255,.72);--glass-weak:rgba(255,255,255,.42);
  --glass-border:rgba(255,255,255,.72);--glass-border-soft:rgba(255,255,255,.5);
  --line:rgba(94,52,40,.14);
  --brand-soft:rgba(194,51,77,.12);--amber-soft:rgba(180,83,9,.13);--green-soft:rgba(13,138,99,.13);
  --pink-soft:rgba(190,24,93,.12);--teal-soft:rgba(15,118,110,.12);
  --shadow:0 8px 30px rgba(70,26,36,.12);--shadow-lg:0 18px 46px rgba(70,26,36,.20);
  --blur:blur(16px) saturate(170%);
  --radius:18px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;
  color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;min-height:100vh;
  background:
    radial-gradient(1100px 720px at 6% -8%, rgba(194,51,77,.20), transparent 62%),
    radial-gradient(950px 640px at 102% -4%, rgba(232,128,79,.18), transparent 58%),
    radial-gradient(900px 720px at 50% 118%, rgba(13,138,99,.16), transparent 62%),
    radial-gradient(760px 520px at 96% 78%, rgba(15,118,110,.13), transparent 58%),
    radial-gradient(620px 440px at -6% 82%, rgba(190,24,93,.10), transparent 60%),
    linear-gradient(180deg,#fbf5f0 0%,#f3e9e6 100%);
  background-attachment:fixed;
}
img{max-width:100%}
a{color:var(--brand)}
:focus-visible{outline:3px solid rgba(194,51,77,.35);outline-offset:2px;border-radius:6px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* ---- sayfa iskeleti: sticky footer ---- */
.page{min-height:100vh;min-height:100svh;display:flex;flex-direction:column}
main{flex:1 0 auto;width:100%;max-width:1200px;margin:0 auto;padding:0 16px 56px}
.wrap-wide{max-width:1200px;margin:0 auto;padding:0 16px}

/* ---- sticky header: buğu camı (CRM topbar bg-background/80 backdrop-blur) ---- */
header.top{
  position:sticky;top:0;z-index:50;
  background:rgba(255,255,255,.55);
  backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);
  border-bottom:1px solid rgba(255,255,255,.62);
  box-shadow:0 4px 26px rgba(70,26,36,.08);
}
.top-in{max-width:1200px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.logo{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:1.15rem;letter-spacing:-.022em;white-space:nowrap;text-decoration:none;color:#5a1f2e;background:linear-gradient(120deg,#7a2233 0%,#b03452 46%,#0f766e 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.logo::before{content:"G";display:inline-flex;align-items:center;justify-content:center;flex:none;width:33px;height:33px;border-radius:11px;background:linear-gradient(135deg,#c2334d 0%,#8c2740 52%,#0f766e 100%);color:#fff;font-size:.95rem;font-weight:800;letter-spacing:0;-webkit-text-fill-color:#fff;box-shadow:0 5px 14px rgba(140,39,64,.38),inset 0 1px 0 rgba(255,255,255,.35)}
.search{flex:1 1 240px;max-width:540px;min-width:200px;position:relative;margin-left:auto}
.search input{width:100%;padding:13px 52px 13px 44px;border-radius:999px;border:1.5px solid rgba(255,255,255,.92);background:rgba(255,255,255,.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font:inherit;font-size:.97rem;font-weight:500;transition:border-color .2s,box-shadow .2s,background .2s;color:var(--ink);box-shadow:0 10px 30px rgba(70,26,36,.16),inset 0 1px 0 rgba(255,255,255,.9)}
.search input::placeholder{color:#a98a79;font-weight:500}
.search input:focus{outline:none;border-color:rgba(194,51,77,.6);background:#fff;box-shadow:0 0 0 4px rgba(194,51,77,.16),0 12px 32px rgba(70,26,36,.2)}
.search .s-ic{position:absolute;left:16px;top:50%;transform:translateY(-50%);opacity:.6;font-size:1.02rem;pointer-events:none}
.s-kbd{position:absolute;right:16px;top:50%;transform:translateY(-50%);font:inherit;font-size:.68rem;font-weight:700;color:#a98a79;background:rgba(94,52,40,.07);border:1px solid rgba(94,52,40,.16);border-bottom-width:2px;border-radius:6px;padding:2px 8px;pointer-events:none}

/* ---- hero: CRM panoları gibi koyu gradient + cam küreler ---- */
.hero{
  margin:22px 0 10px;padding:40px 30px;border-radius:26px;color:#fff;position:relative;overflow:hidden;
  background:linear-gradient(130deg,#380f1a 0%,#5b1424 42%,#123a33 100%);
  border:1px solid rgba(255,255,255,.18);
  box-shadow:0 26px 60px rgba(43,15,27,.42),inset 0 1px 0 rgba(255,255,255,.22);
}
.hero::before{
  content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(430px 280px at 86% 14%, rgba(244,114,182,.36), transparent 66%),
    radial-gradient(390px 250px at 10% 92%, rgba(45,212,191,.30), transparent 62%),
    radial-gradient(320px 210px at 58% 128%, rgba(251,191,36,.24), transparent 62%);
}
.hero::after{content:"📍";position:absolute;right:18px;bottom:-14px;font-size:6rem;opacity:.16;transform:rotate(-12deg);z-index:1}
.hero>*{position:relative;z-index:2}
.hero h1{font-size:clamp(1.5rem,4.2vw,2.35rem);font-weight:800;letter-spacing:-.025em;line-height:1.16;text-shadow:0 2px 14px rgba(0,0,0,.25);text-wrap:balance}
.hero h1 em{font-style:normal;color:#ffb3c0}
.hero p{margin-top:10px;color:rgba(255,255,255,.84);max-width:58ch;font-size:.98rem}
.hero .btn-geo{margin-top:18px}
.loc-status{margin-top:10px;font-size:.88rem;color:rgba(255,255,255,.78);font-weight:600;min-height:1.3em}
.hero-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.hero-chip{
  display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;
  background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.16);
  color:rgba(255,255,255,.94);font-size:.8rem;font-weight:700;letter-spacing:.015em;
  transition:background .2s
}
.hero-chip:hover{background:rgba(255,255,255,.18)}

/* ---- butonlar ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:pointer;font:inherit;font-weight:700;border-radius:999px;padding:12px 22px;transition:transform .15s ease,box-shadow .2s ease,background .2s ease,text-decoration:none;color:var(--ink)}
.btn:active{transform:scale(.97)}
.btn-geo{background:linear-gradient(120deg,var(--brand),#e8804f);color:#fff;box-shadow:0 10px 26px rgba(194,51,77,.4),inset 0 1px 0 rgba(255,255,255,.28);font-size:1rem;letter-spacing:.01em}
.btn-geo:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(194,51,77,.48)}
.btn-geo:disabled{opacity:.6;cursor:wait;transform:none}
.btn-wa{background:linear-gradient(120deg,#0d8a63,#10b981);color:#fff;box-shadow:0 8px 20px rgba(13,138,99,.34)}
.btn-wa:hover{transform:translateY(-2px)}
.btn-ghost{background:rgba(255,255,255,.5);border:1.5px solid rgba(255,255,255,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(70,26,36,.08)}
.btn-ghost:hover{border-color:rgba(194,51,77,.5);color:var(--brand);background:rgba(255,255,255,.75)}

/* ---- filtre çipleri: cam çipler ---- */
.filters-row{display:flex;gap:12px;align-items:center;margin:14px 0 4px}
.chips{display:flex;gap:8px;overflow-x:auto;padding:6px 2px;flex:1;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
.chip{flex:0 0 auto;padding:8px 16px;border-radius:999px;border:1.5px solid rgba(255,255,255,.72);background:rgba(255,255,255,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:inherit;font-weight:600;font-size:.88rem;cursor:pointer;transition:all .15s ease;color:#5d4a3d;box-shadow:0 3px 12px rgba(70,26,36,.07)}
.chip:hover{border-color:rgba(194,51,77,.5);color:var(--brand);transform:translateY(-1px);background:rgba(255,255,255,.72)}
.chip.on{background:var(--brand);border-color:rgba(194,51,77,.4);color:#fff;box-shadow:0 6px 16px rgba(194,51,77,.34)}
.city-wrap select{padding:9px 34px 9px 14px;border-radius:999px;border:1.5px solid rgba(255,255,255,.72);background:rgba(255,255,255,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:inherit;font-size:.88rem;font-weight:600;color:#5d4a3d;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2393796a' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;box-shadow:0 3px 12px rgba(70,26,36,.07)}
.city-wrap select:focus{outline:none;border-color:rgba(194,51,77,.5);box-shadow:0 0 0 4px rgba(194,51,77,.14)}
.count{margin:10px 2px 14px;font-size:.86rem;color:var(--muted);font-weight:600}

/* ---- kart grid: buğu camı kartlar ---- */
.grid{display:grid;gap:1.25rem;grid-template-columns:1fr}
@media(min-width:600px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:960px){.grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:1280px){.grid{grid-template-columns:repeat(4,1fr)}}
.card{
  position:relative;display:flex;flex-direction:column;
  background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);
  border:1px solid var(--glass-border);border-radius:var(--radius);overflow:hidden;
  box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.65);transition:transform .2s ease,box-shadow .25s ease;animation:rise .4s ease both
}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.card:hover{transform:translateY(-5px);box-shadow:var(--shadow-lg),inset 0 1px 0 rgba(255,255,255,.65)}
.cover{position:relative;height:150px;flex:none}
.cover::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.16),transparent 42%)}
.phb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:3.2rem}
.cphoto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ph-berber{background:linear-gradient(135deg,#5b3a21,#a06a33)}
.ph-kuafor{background:linear-gradient(135deg,#c2334d,#e8804f)}
.ph-disci{background:linear-gradient(135deg,#0d8a63,#3ccf9a)}
.ph-guzellik{background:linear-gradient(135deg,#b0326e,#e8804f)}
.ph-spa{background:linear-gradient(135deg,#0f766e,#2dd4bf)}
.ph-dovme{background:linear-gradient(135deg,#33281f,#6b4f3a)}
.ph-def{background:linear-gradient(135deg,#b45309,#e8804f)}
.card .body{padding:16px;display:flex;flex-direction:column;gap:7px;flex:1}
.row-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:.73rem;font-weight:700;letter-spacing:.01em;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.b-berber{background:rgba(180,83,9,.15);color:#92400e}
.b-kuafor{background:rgba(194,51,77,.13);color:var(--brand)}
.b-disci{background:rgba(13,138,99,.14);color:#065f46}
.b-guzellik{background:rgba(190,24,93,.13);color:var(--pink)}
.b-spa{background:rgba(15,118,110,.13);color:var(--teal)}
.b-dovme{background:rgba(68,64,60,.12);color:#44403c}
.b-def{background:rgba(109,86,71,.12);color:#6d5647}
.dist{margin-left:auto;font-size:.73rem;font-weight:800;color:#067a57;background:rgba(13,138,99,.15);padding:3px 9px;border-radius:999px;font-variant-numeric:tabular-nums;white-space:nowrap}
.c-name{font-size:1.04rem;font-weight:800;letter-spacing:-.01em;line-height:1.3}
.card-link{color:inherit;text-decoration:none}
.card-link::after{content:"";position:absolute;inset:0;z-index:1}
.c-loc{font-size:.83rem;color:var(--muted);font-weight:600}
.c-addr{font-size:.83rem;color:#8a7466}
.c-meta{font-size:.84rem;color:#5d4a3d;font-weight:600;display:flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums}
.c-meta .minp{color:var(--brand);font-weight:800}
.c-foot{margin-top:auto;padding-top:9px;border-top:1px dashed var(--line);display:flex;align-items:center;justify-content:space-between;gap:8px}
.tel-link{position:relative;z-index:2;font-size:.83rem;font-weight:700;color:#5d4a3d;text-decoration:none;font-variant-numeric:tabular-nums}
.tel-link:hover{color:var(--brand)}
.go{font-size:.83rem;font-weight:800;color:var(--brand);white-space:nowrap;transition:transform .2s}
.card:hover .go{transform:translateX(3px)}

/* ---- skeleton / boş / hata ---- */
.sk{border-radius:var(--radius);background:var(--glass-weak);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border-soft);overflow:hidden;box-shadow:var(--shadow)}
.sk .sc{height:150px;background:linear-gradient(90deg,rgba(255,255,255,.35) 25%,rgba(255,255,255,.65) 50%,rgba(255,255,255,.35) 75%);background-size:200% 100%;animation:sh 1.2s infinite}
.sk .sb{padding:16px;display:grid;gap:10px}
.sk-line{height:12px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.35) 25%,rgba(255,255,255,.65) 50%,rgba(255,255,255,.35) 75%);background-size:200% 100%;animation:sh 1.2s infinite}
.sk-line.w60{width:60%}.sk-line.w80{width:80%}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
.state-box{grid-column:1/-1;text-align:center;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:var(--radius);box-shadow:var(--shadow);padding:40px 20px}
.state-box .big{font-size:2.6rem;display:block;margin-bottom:10px}
.state-box p{color:#6d5647;margin-bottom:16px}

/* ---- sticky footer: koyu buğu camı ---- */
footer.ft{margin-top:auto;background:linear-gradient(180deg,rgba(24,14,11,.92),rgba(15,9,7,.95));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f0e0cd;padding:24px 16px calc(24px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(255,255,255,.12)}
.ft-in{max-width:1200px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:space-between;font-size:.88rem}
.ft-in .fl{font-weight:700}
.ft-in .fr{opacity:.75}

/* ---- toast: cam koyu ---- */
#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(18px);background:rgba(30,18,14,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.14);color:#fff;padding:11px 18px;border-radius:12px;font-size:.9rem;font-weight:600;opacity:0;pointer-events:none;transition:all .25s ease;z-index:100;max-width:92vw;text-align:center;box-shadow:0 12px 34px rgba(0,0,0,.32)}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#toast.ok{background:rgba(11,107,78,.92)}
#toast.warn{background:rgba(146,64,14,.92)}
#toast.err{background:rgba(155,29,49,.92)}

/* ---- spinner ---- */
.spin{width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;animation:rot .7s linear infinite;display:inline-block;flex:none;vertical-align:-3px}
.spin.dark{border-color:rgba(194,51,77,.25);border-top-color:var(--brand)}
@keyframes rot{to{transform:rotate(360deg)}}

/* ============================================================ DETAY SAYFA */
.crumb{display:inline-flex;align-items:center;gap:6px;margin:20px 0 4px;font-size:.88rem;font-weight:700;color:#6d5647;text-decoration:none;transition:color .15s;background:rgba(255,255,255,.42);border:1px solid rgba(255,255,255,.6);padding:6px 13px;border-radius:999px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.crumb:hover{color:var(--brand);background:rgba(255,255,255,.68)}
.dwrap{display:grid;gap:1.5rem;margin-top:10px}
@media(min-width:900px){.dhead{grid-template-columns:1.25fr 1fr}}
.dhead{display:grid;gap:1.5rem;align-items:start}
.dcard{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:20px;box-shadow:var(--shadow);overflow:hidden}
.dcover{position:relative;height:230px}
.dbody{padding:24px;display:grid;gap:10px}
.dtitle{font-size:clamp(1.35rem,3vw,1.85rem);font-weight:800;letter-spacing:-.018em;line-height:1.22;background:linear-gradient(120deg,#241016,#5a1f2e 70%,#0d4a44);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.dloc{font-size:.92rem;color:#6d5647;font-weight:600}
.daddr{font-size:.9rem;color:#8a7466}
.dcontact{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.tel-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;background:rgba(13,138,99,.14);border:1px solid rgba(13,138,99,.18);color:#065f46;font-weight:800;text-decoration:none;font-size:.9rem;transition:all .15s;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.tel-btn:hover{background:var(--green);color:#fff;transform:translateY(-1px)}
.open-chip{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:999px;font-weight:800;font-size:.9rem;background:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.7);color:#6d5647;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.open-chip.on{background:rgba(13,138,99,.14);border-color:rgba(13,138,99,.18);color:#065f46}
.open-chip.off{background:rgba(180,83,9,.13);border-color:rgba(180,83,9,.18);color:#92400e}
.mini-note{font-size:.82rem;color:var(--muted)}
.hours{width:100%;border-collapse:collapse}
.hours td{padding:9px 14px;border-bottom:1px dashed var(--line);font-size:.9rem}
.hours tr:last-child td{border-bottom:none}
.hours td:first-child{font-weight:600;color:#5d4a3d}
.hours td.t-time{text-align:right;font-variant-numeric:tabular-nums;color:#5d4a3d}
.hours tr.today td{background:rgba(194,51,77,.10);color:var(--brand);font-weight:800}
.hours tr.today td:first-child{border-radius:8px 0 0 8px}
.hours tr.today td.t-time{border-radius:0 8px 8px 0}
.hours tr.today td.t-time{color:var(--brand)}
.today-pill{display:inline-block;margin-left:8px;background:var(--brand);color:#fff;font-size:.66rem;font-weight:800;padding:2px 8px;border-radius:999px;vertical-align:1px}
.closed{color:#b3a294;font-style:italic;font-weight:500!important}

.section-title{font-size:1.2rem;font-weight:800;margin:6px 0 14px;display:flex;align-items:center;gap:8px}
.svc-list{display:grid;gap:10px;max-height:430px;overflow-y:auto;padding:2px 8px 2px 2px}
.svc{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid rgba(255,255,255,.65);border-radius:14px;background:rgba(255,255,255,.42);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:all .15s}
.svc:hover{border-color:rgba(194,51,77,.45);background:rgba(255,255,255,.75);box-shadow:var(--shadow)}
.svc .si{flex:none;width:38px;height:38px;border-radius:12px;background:rgba(194,51,77,.12);display:flex;align-items:center;justify-content:center;font-size:1.1rem}
.svc .sn{font-weight:700;font-size:.94rem}
.svc .sc-cat{font-size:.74rem;color:var(--muted);font-weight:600}
.svc-meta{margin-left:auto;text-align:right;font-variant-numeric:tabular-nums;flex:none}
.svc-dur{font-size:.76rem;color:var(--muted);font-weight:600;white-space:nowrap}
.svc-price{font-weight:800;color:var(--brand);font-size:.95rem;white-space:nowrap}
.svc-pick{flex:none;border:1.5px solid rgba(194,51,77,.35);background:rgba(255,255,255,.5);border-radius:999px;padding:7px 13px;font:inherit;font-size:.78rem;font-weight:800;color:var(--brand);cursor:pointer;transition:all .15s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.svc-pick:hover{background:var(--brand);color:#fff;border-color:var(--brand)}

/* ---- randevu formu: cam panel ---- */
.book-card{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:20px;box-shadow:var(--shadow);padding:24px;display:grid;gap:18px;scroll-margin-top:80px}
.f-label{font-size:.85rem;font-weight:800;color:#5d4a3d;display:block;margin-bottom:7px}
.field input,.field select,.field textarea{padding:11px 14px;border-radius:12px;border:1.5px solid rgba(255,255,255,.78);background:rgba(255,255,255,.6);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:inherit;font-size:.94rem;width:100%;transition:border-color .2s,box-shadow .2s,background .2s;color:var(--ink)}
.field textarea{resize:vertical;min-height:70px}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:rgba(194,51,77,.55);background:rgba(255,255,255,.85);box-shadow:0 0 0 4px rgba(194,51,77,.14)}
.hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important}
.dates{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
@media(min-width:640px){.dates{grid-template-columns:repeat(7,1fr)}}
.date-btn{padding:8px 4px;border-radius:12px;border:1.5px solid rgba(255,255,255,.72);background:rgba(255,255,255,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;text-align:center;font:inherit;transition:all .15s;color:var(--ink)}
.date-btn:hover{border-color:rgba(194,51,77,.5);transform:translateY(-1px);background:rgba(255,255,255,.75)}
.date-btn.on{background:var(--brand);border-color:rgba(194,51,77,.4);color:#fff;box-shadow:0 6px 16px rgba(194,51,77,.34)}
.date-btn .dw{display:block;font-size:.7rem;opacity:.75;font-weight:600}
.date-btn .dn{display:block;font-weight:800;font-size:.84rem;white-space:nowrap}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;max-height:250px;overflow-y:auto;padding:2px}
.slot{padding:10px 0;border-radius:10px;border:1.5px solid rgba(255,255,255,.72);background:rgba(255,255,255,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font:inherit;font-weight:700;font-size:.9rem;cursor:pointer;font-variant-numeric:tabular-nums;transition:all .15s;color:var(--ink)}
.slot:hover:not(:disabled){border-color:rgba(194,51,77,.5);color:var(--brand);background:rgba(255,255,255,.78)}
.slot.on{background:var(--brand);color:#fff;border-color:rgba(194,51,77,.4);box-shadow:0 5px 14px rgba(194,51,77,.34)}
.slot:disabled{opacity:.38;cursor:not-allowed;text-decoration:line-through;background:rgba(255,255,255,.28);border-color:rgba(255,255,255,.4)}
.hint{font-size:.88rem;color:var(--muted);padding:10px 2px}
.err-txt{color:var(--brand);font-weight:700}
.slotload{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:.88rem;font-weight:600;padding:8px 2px}
.sumline{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;background:rgba(180,83,9,.13);border:1px solid rgba(180,83,9,.16);color:#92400e;padding:11px 15px;border-radius:12px;font-size:.88rem;font-weight:700;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.sumline[hidden]{display:none}
.form-err{background:rgba(194,51,77,.12);border:1px solid rgba(194,51,77,.16);color:var(--brand);font-weight:700;font-size:.88rem;padding:11px 14px;border-radius:12px}
.form-err[hidden]{display:none}
.btn-submit{width:100%;background:linear-gradient(120deg,var(--brand),#d97706);color:#fff;font-size:1rem;padding:14px;letter-spacing:.01em;box-shadow:0 10px 26px rgba(194,51,77,.36),inset 0 1px 0 rgba(255,255,255,.26)}
.btn-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 28px rgba(194,51,77,.42)}
.btn-submit:disabled{opacity:.65;cursor:wait;transform:none}

/* ---- başarı ekranı ---- */
.success{display:grid;gap:16px;text-align:center;padding:14px 6px}
.success[hidden]{display:none}
.okmark{width:66px;height:66px;border-radius:50%;background:rgba(13,138,99,.15);border:1.5px solid rgba(13,138,99,.25);color:var(--green);font-size:2.1rem;display:flex;align-items:center;justify-content:center;margin:0 auto;animation:pop .45s ease;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
@keyframes pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
.success h2{font-size:1.4rem;font-weight:800}
.success .sub{color:#6d5647;font-size:.92rem}
.sumcard{display:grid;text-align:left;background:rgba(255,255,255,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.72);border-radius:16px;padding:4px 18px;box-shadow:0 4px 16px rgba(70,26,36,.07)}
.sumrow{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px dashed var(--line);font-size:.9rem;align-items:baseline}
.sumrow:last-child{border-bottom:none}
.sumrow .k{color:var(--muted);font-weight:600;flex:none}
.sumrow .v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;word-break:break-word}
.s-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}

/* ---- sayfa düzeyi hata / 404 ---- */
.center-page{min-height:70vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:30px 16px}
.center-card{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:22px;box-shadow:var(--shadow);padding:44px 30px;max-width:480px}
.center-card .big{font-size:3rem;display:block;margin-bottom:12px}
.center-card h1{font-size:1.4rem;margin-bottom:10px}
.center-card p{color:#6d5647;margin-bottom:20px}

/* ---- scrollbars ---- */
.svc-list::-webkit-scrollbar,.slots::-webkit-scrollbar,.chips::-webkit-scrollbar{width:8px;height:8px}
.svc-list::-webkit-scrollbar-thumb,.slots::-webkit-scrollbar-thumb,.chips::-webkit-scrollbar-thumb{background:rgba(194,51,77,.30);border-radius:8px}
.svc-list::-webkit-scrollbar-thumb:hover,.slots::-webkit-scrollbar-thumb:hover,.chips::-webkit-scrollbar-thumb:hover{background:rgba(194,51,77,.48)}
.svc-list,.slots,.chips{scrollbar-width:thin;scrollbar-color:rgba(194,51,77,.30) transparent}

/* ---- telefon dar ekran ---- */
@media(max-width:520px){
  .hero{padding:28px 18px}
  .top-in{gap:8px}
  .search{order:3;flex:1 1 100%;max-width:none}
  .s-kbd{display:none}
  .dbody,.book-card{padding:18px}
  .dates{grid-template-columns:repeat(4,1fr)}
  .biz-map{height:300px}
}

/* ---- harita (Leaflet + OSM) ---- */
.map-card{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:16px;padding:14px 14px 12px;margin:18px 0;box-shadow:var(--shadow)}
.map-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 10px}
.map-head h2{font-size:1.02rem;color:var(--ink);margin:0}
.map-toggle{border:1.5px solid rgba(255,255,255,.75);background:rgba(255,255,255,.5);color:#8a5a3b;border-radius:999px;padding:5px 12px;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.map-toggle:hover{background:rgba(255,255,255,.8);border-color:rgba(194,51,77,.4)}
.biz-map{height:380px;border-radius:12px;border:1px solid rgba(255,255,255,.7);z-index:0;background:#e8e0d4;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.map-hint{font-size:.78rem;color:#8a7160;margin:8px 2px 0}
.biz-pin{width:32px;height:32px;border-radius:50%;background:#fff;border:2.5px solid var(--brand);display:grid;place-items:center;font-size:16px;line-height:1;box-shadow:0 3px 8px rgba(0,0,0,.28);cursor:pointer;transition:transform .15s}
.biz-pin:hover{transform:scale(1.12)}
.biz-pin.pin-nearest{width:46px;height:46px;font-size:23px;border-color:#118a4e;background:#eafff2;box-shadow:0 0 0 7px rgba(17,138,78,.18),0 4px 10px rgba(0,0,0,.32)}
.biz-pin .pin-star{position:absolute;top:-14px;right:-12px;font-size:14px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}
.user-dot{width:18px;height:18px;border-radius:50%;background:#1e88e5;border:3px solid #fff;box-shadow:0 0 0 9px rgba(30,136,229,.22),0 2px 6px rgba(0,0,0,.3)}
.biz-pop{font-family:inherit}
.biz-pop .pop-t{font-weight:800;color:#3f2416;font-size:.92rem}
.biz-pop .pop-s{font-size:.78rem;color:#8a7160;margin:2px 0 4px}
.biz-pop .pop-d{font-size:.8rem;font-weight:700;color:#118a4e}
.biz-pop .pop-link{display:inline-block;margin-top:7px;font-size:.82rem;font-weight:700;color:var(--brand);text-decoration:none;border-bottom:2px solid rgba(194,51,77,.25)}
.biz-pop .pop-link:hover{color:#a02145}
.detail-map{height:260px;border-radius:12px;border:1px solid rgba(255,255,255,.7);z-index:0;margin-top:12px}
.dir-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.dir-links a{display:inline-flex;align-items:center;gap:5px;font-size:.8rem;font-weight:700;color:#8a5a3b;background:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.75);border-radius:999px;padding:6px 13px;text-decoration:none;transition:all .15s;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.dir-links a:hover{background:rgba(255,255,255,.85);transform:translateY(-1px)}
/* leaflet kontrolleri tema uyumu */
.leaflet-bar a,.leaflet-control-attribution{font-family:inherit}
.leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.82)!important}

/* ---- erişilebilirlik: hareket azaltma ---- */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
  html{scroll-behavior:auto}
}

/* ---- backdrop-filter desteklemeyen tarayıcılar: düz yüzey ---- */
@supports not ((backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px))){
  header.top,footer.ft{background:#fbf5f0}
  .card,.dcard,.book-card,.map-card,.state-box,.center-card,.rev-card,.rev-item,.rev-form,.rev-done,.wl-box,.wl-done,.wl-card,.sc-card{background:#ffffff}
  .sk{background:#f7efe9}
  .search input,.field input,.field select,.field textarea,.chip,.city-wrap select,.date-btn,.slot,.svc,.sumcard,.tel-btn,.open-chip,.map-toggle,.dir-links a,.sumline,.form-err,.btn-ghost,.crumb{background:#ffffff}
  #toast{background:#2b211b}
}

/* ---- değerlendirmeler (review) — amber yıldızlar, mobil öncelikli ---- */
.rate-badge{display:inline-flex;align-items:center;gap:7px;margin:8px 0 2px;padding:7px 14px;border-radius:999px;background:var(--amber-soft);border:1px solid rgba(245,158,11,.35);color:var(--amber);font-weight:700;font-size:.88rem;text-decoration:none;transition:transform .15s,box-shadow .15s}
.rate-badge:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(180,83,9,.18)}
.rate-badge .rate-badge-s{font-size:1rem;line-height:1}
.rate-badge b{font-size:1.02rem;letter-spacing:-.02em}
.rate-badge .rate-badge-c{font-weight:600;color:#a06a2c;font-size:.8rem}
.rate-badge.rate-new{background:var(--green-soft);border-color:rgba(13,138,99,.3);color:var(--green);font-size:.82rem}
.rate-chip{display:inline-flex;align-items:center;gap:4px;font-size:.74rem;font-weight:800;color:#b45309;background:var(--amber-soft);border:1px solid rgba(245,158,11,.3);border-radius:999px;padding:3px 9px;white-space:nowrap}
.rate-chip .s{color:#f59e0b}
.rev-card{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:var(--radius);padding:20px 18px;margin:12px 0 16px;box-shadow:var(--shadow);display:grid;gap:16px}
.rev-summary{display:grid;gap:14px}
.rev-avg{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.rev-avg-n{font-size:2.3rem;font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--ink)}
.rev-stars{color:#f59e0b;letter-spacing:3px;font-size:1.05rem;text-shadow:0 1px 0 rgba(255,255,255,.6)}
.rev-avg-c{color:var(--muted);font-size:.85rem;font-weight:600}
.rev-bars{display:grid;gap:6px}
.rev-bar-row{display:grid;grid-template-columns:38px 1fr 24px;align-items:center;gap:10px;font-size:.78rem;color:var(--muted)}
.rev-bar{display:block;height:9px;border-radius:99px;background:rgba(94,52,40,.10);overflow:hidden}
.rev-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.rev-bar-v{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#8a6a3f}
.rev-empty{color:var(--muted);font-size:.92rem;margin:0}
.rev-form{background:var(--glass-strong);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:var(--radius);padding:20px 18px;margin:0 0 16px;box-shadow:var(--shadow)}
.rev-star-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.rev-star-btn{font:inherit;font-size:1.1rem;letter-spacing:2px;padding:9px 12px;border-radius:12px;border:1.5px solid rgba(255,255,255,.8);background:rgba(255,255,255,.6);color:#c9b7a7;cursor:pointer;transition:all .15s;line-height:1}
.rev-star-btn:hover{border-color:rgba(245,158,11,.5);color:#f59e0b;transform:translateY(-1px)}
.rev-star-btn.on{background:linear-gradient(180deg,rgba(251,191,36,.22),rgba(245,158,11,.14));border-color:rgba(245,158,11,.65);color:#f59e0b;box-shadow:0 4px 14px rgba(180,83,9,.15)}
.rev-done{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid rgba(13,138,99,.3);border-radius:var(--radius);padding:22px 18px;margin:0 0 16px;box-shadow:var(--shadow);text-align:center}
.rev-done .okmark{font-size:2rem}
.rev-done .sub{color:var(--muted);font-size:.9rem}
.rev-list{display:grid;gap:12px}
.rev-item{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:16px;padding:16px 16px 14px;box-shadow:var(--shadow)}
.rev-item-head{display:flex;gap:10px;align-items:center}
.rev-avatar{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:.95rem;color:#fff;background:linear-gradient(135deg,#f59e0b,#d97706);box-shadow:0 4px 10px rgba(180,83,9,.25)}
.rev-author{font-weight:700;font-size:.95rem}
.rev-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}
.rev-date{font-variant-numeric:tabular-nums}
.rev-text{margin:10px 2px 0;font-size:.92rem;line-height:1.6;color:#4a352a;white-space:pre-line;overflow-wrap:anywhere}
.rev-reply{margin:12px 0 0;background:rgba(94,52,40,.06);border-left:3px solid #f59e0b;border-radius:0 12px 12px 0;padding:10px 12px}
.rev-reply-t{display:block;font-size:.72rem;font-weight:800;color:#8a6a3f;letter-spacing:.02em;margin-bottom:3px}
.rev-reply p{margin:0;font-size:.85rem;color:#5c4636;line-height:1.55}
.appt-review{border:1.5px solid rgba(245,158,11,.5);background:rgba(255,255,255,.6);color:#b45309;border-radius:999px;padding:7px 14px;font-size:.8rem;font-weight:700;cursor:pointer;transition:all .15s}
.appt-review:hover{background:var(--amber-soft);transform:translateY(-1px)}
.rev-ov-summary{background:rgba(94,52,40,.05);border-radius:12px;padding:10px 12px;font-size:.84rem;color:#5d4436;display:grid;gap:2px}
.rev-ov-summary b{font-size:.9rem}
/* geniş ekranda özet kartı yan yana (mobilde tek kolon) */
@media (min-width:720px){
  .rev-card{grid-template-columns:1fr auto;align-items:center}
  .rev-summary{grid-template-columns:auto 1fr;gap:26px;align-items:center}
  .rev-bars{min-width:220px}
}

/* ---- üyelik (Giriş / Kayıt + Randevularım) ---- */
.member-btn{white-space:nowrap}
.member-btn.logged{border-color:rgba(13,138,99,.45);color:var(--green);background:var(--green-soft)}
.mem-hero{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:var(--radius);padding:26px 24px;margin:18px 0;box-shadow:var(--shadow);text-align:center}
.mem-hero h1{font-size:1.5rem;font-weight:800;letter-spacing:-.4px;margin:4px 0 6px}
.mem-hero p{color:var(--muted);font-size:.92rem;max-width:520px;margin:0 auto}
.mem-card{background:var(--glass-strong);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:var(--radius);padding:22px;box-shadow:var(--shadow);margin:16px 0}
.mem-tabs{display:flex;gap:8px;background:rgba(255,255,255,.5);border:1px solid var(--glass-border-soft);border-radius:999px;padding:4px;margin:0 auto 18px;max-width:340px}
.mem-tab{flex:1;border:none;background:transparent;color:var(--muted);font-weight:700;font-size:.9rem;padding:9px 10px;border-radius:999px;cursor:pointer;transition:all .18s}
.mem-tab.on{background:#fff;color:var(--brand);box-shadow:0 2px 10px rgba(70,26,36,.12)}
.mem-wrap{max-width:440px;margin:0 auto}
.mem-profile{display:flex;align-items:center;gap:14px}
.mem-avatar{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--brand),#e8804f);color:#fff;display:grid;place-items:center;font-size:1.3rem;font-weight:800;flex:none;box-shadow:0 4px 14px rgba(194,51,77,.35)}
.mem-id{min-width:0}
.mem-id .n{font-weight:800;font-size:1.05rem}
.mem-id .p{color:var(--muted);font-size:.85rem;overflow:hidden;text-overflow:ellipsis}
.mem-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.appt{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:16px;padding:14px 16px;margin:10px 0;box-shadow:var(--shadow);display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.appt-main{flex:1;min-width:200px}
.appt-biz{font-weight:800;font-size:.98rem}
.appt-svc{color:var(--muted);font-size:.84rem;margin:2px 0}
.appt-when{font-weight:700;font-size:.86rem;color:#5d4436}
.st-badge{display:inline-block;font-size:.74rem;font-weight:800;padding:4px 11px;border-radius:999px;white-space:nowrap}
.st-beklemede{background:var(--amber-soft);color:var(--amber)}
.st-onaylandi{background:var(--green-soft);color:var(--green)}
.st-tamamlandi{background:var(--teal-soft);color:var(--teal)}
.st-gelmedi{background:rgba(120,120,120,.14);color:#6b6b6b}
.st-iptal{background:var(--brand-soft);color:var(--brand)}
.appt-cancel{border:1.5px solid rgba(194,51,77,.4);background:rgba(255,255,255,.6);color:var(--brand);border-radius:999px;padding:7px 14px;font-size:.8rem;font-weight:700;cursor:pointer;transition:all .15s}
.appt-cancel:hover{background:var(--brand-soft)}
.appt-replan{border:1.5px solid rgba(13,138,99,.4);background:rgba(255,255,255,.6);color:var(--green);border-radius:999px;padding:7px 14px;font-size:.8rem;font-weight:700;cursor:pointer;transition:all .15s}
.appt-replan:hover{background:var(--green-soft);transform:translateY(-1px)}
.appt-code{font-size:.72rem;color:var(--muted);font-family:ui-monospace,monospace}
/* 📅 takvime ekle — ICS indirme (stone/toprak tonu; dokunma hedefi ≥44px) */
.appt-ics{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;border:1.5px solid rgba(93,68,54,.38);background:rgba(255,255,255,.6);color:#5d4436;border-radius:999px;padding:7px 16px;font-size:.8rem;font-weight:700;cursor:pointer;transition:all .15s;text-decoration:none;white-space:nowrap}
.appt-ics:hover{background:rgba(93,68,54,.09);border-color:rgba(93,68,54,.55);transform:translateY(-1px);color:#5d4436}
.empty-box{text-align:center;padding:26px 18px;color:var(--muted)}

/* ---- 🔔 hatırlatıcı tercihi (localStorage) — satır tamamlık dokunma hedefi ---- */
.rem-pref{margin:14px 0 4px}
.rem-row{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1.5px solid var(--glass-border);border-radius:16px;padding:10px 16px;cursor:pointer;font:inherit;text-align:left;transition:background .15s;box-shadow:var(--shadow)}
.rem-row:hover{background:rgba(255,255,255,.8)}
.rem-ic{font-size:1.25rem;flex:none}
.rem-txt{flex:1;min-width:0}
.rem-txt b{display:block;font-size:.92rem}
.rem-sub{display:block;font-size:.78rem;color:var(--muted)}
.rem-sw{flex:none;width:46px;height:28px;border-radius:999px;background:rgba(94,52,40,.18);border:1.5px solid var(--glass-border);position:relative;transition:background .18s}
.rem-knob{position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(70,26,36,.25);transition:transform .18s}
.rem-row[aria-checked="true"] .rem-sw{background:var(--green)}
.rem-row[aria-checked="true"] .rem-knob{transform:translateX(18px)}
.rem-note{font-size:.74rem;color:var(--muted);margin:6px 4px 0}

/* ---- KVKK: hesap silme (kırmızı outline + confirm diyalogu) ---- */
.mem-danger{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px dashed var(--line)}
.del-btn{border:1.5px solid rgba(194,51,77,.45);background:transparent;color:var(--brand);border-radius:999px;padding:8px 16px;font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;transition:all .15s}
.del-btn:hover{background:var(--brand-soft)}
.del-overlay{position:fixed;inset:0;z-index:90;background:rgba(30,18,14,.46);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px}
.del-overlay[hidden]{display:none}
.del-box{background:#fff;border-radius:20px;box-shadow:var(--shadow-lg);padding:24px;max-width:430px;width:100%;display:grid;gap:12px}
.del-box h2{font-size:1.12rem;font-weight:800;letter-spacing:-.01em}
.del-box p{font-size:.9rem;color:#6d5647}
.del-box .warn{background:var(--brand-soft);border:1px solid rgba(194,51,77,.2);border-radius:10px;padding:10px 12px;font-weight:600;color:var(--brand)}
.del-confirm{background:var(--brand);color:#fff;border:none;box-shadow:0 8px 20px rgba(194,51,77,.34)}
.del-confirm:hover:not(:disabled){transform:translateY(-1px)}
.del-confirm:disabled{opacity:.65;cursor:wait}
.del-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:2px}

/* ---- hızlı seçim: ilk uygun saat (yeşil tema) ---- */
.quick-slot{display:inline-flex;align-items:center;gap:8px;margin-bottom:10px;padding:9px 16px;border-radius:999px;border:1.5px solid rgba(13,138,99,.35);background:var(--green-soft);color:var(--green);font:inherit;font-size:.85rem;font-weight:800;cursor:pointer;transition:all .15s}
.quick-slot:hover{background:var(--green);border-color:var(--green);color:#fff;transform:translateY(-1px)}
.quick-slot[hidden]{display:none}

/* ---- 404: hata sayfası arama + öneriler ---- */
.nf-search{display:flex;gap:8px;max-width:420px;margin:16px auto 4px}
.nf-search input{flex:1;min-width:0;border:1.5px solid var(--glass-border);background:rgba(255,255,255,.75);border-radius:999px;padding:10px 16px;font-size:.9rem;color:var(--ink)}
.nf-search input:focus{outline:none;border-color:rgba(194,51,77,.5)}
.nf-sub{font-size:.8rem;color:#8a7160;margin-top:10px}
.nf-sugg{margin-top:20px;text-align:left}
.nf-sugg h2{font-size:.95rem;color:var(--ink);margin:0 0 10px;text-align:center}
.nf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.nf-item{display:flex;gap:9px;align-items:center;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--glass-border);border-radius:14px;padding:10px 12px;text-decoration:none;transition:all .15s;box-shadow:0 3px 12px rgba(70,26,36,.08)}
.nf-item:hover{transform:translateY(-2px);background:rgba(255,255,255,.85);box-shadow:var(--shadow)}
.nf-ic{font-size:1.25rem;flex:none}
.nf-nm{font-weight:700;font-size:.84rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nf-svc{display:inline-block;margin-top:3px;font-size:.7rem;font-weight:800;color:var(--green);background:var(--green-soft);border-radius:999px;padding:2px 8px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nf-loc{font-size:.72rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---- ⏳ bekleme listesi (waitlist) — amber vurgu, mobil öncelikli ---- */
.wl-teaser{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 15px;border-radius:999px;border:1.5px dashed rgba(180,83,9,.45);background:var(--amber-soft);color:var(--amber);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;transition:all .15s;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.wl-teaser:hover{background:rgba(180,83,9,.2);transform:translateY(-1px)}
.wl-box{margin-top:20px;padding-top:18px;border-top:2px dashed rgba(180,83,9,.28)}
.wl-box[hidden]{display:none}
.wl-title{display:flex;align-items:center;gap:8px;font-size:1.02rem;font-weight:800;color:var(--ink);margin:0 0 4px}
.wl-sub{font-size:.85rem;color:var(--muted);margin:0 0 14px}
.wl-grid{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:520px){.wl-grid{grid-template-columns:1fr 1fr}}
.btn-wl{width:100%;background:linear-gradient(120deg,#b45309,#d97706);color:#fff;font-size:.98rem;padding:13px;letter-spacing:.01em;box-shadow:0 10px 26px rgba(180,83,9,.34),inset 0 1px 0 rgba(255,255,255,.26)}
.btn-wl:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 28px rgba(180,83,9,.42)}
.btn-wl:disabled{opacity:.65;cursor:wait;transform:none}
.wl-done{display:grid;gap:10px;text-align:center;padding:16px 6px 6px}
.wl-done[hidden]{display:none}
.wl-done .okmark{background:rgba(180,83,9,.15);border-color:rgba(180,83,9,.28);color:var(--amber)}
.wl-done h3{font-size:1.2rem;font-weight:800}
.wl-done .sub{color:#6d5647;font-size:.92rem}
.wlq-row{display:flex;gap:10px;flex-wrap:wrap}
.wlq-row input{flex:1;min-width:200px;border:1.5px solid var(--glass-border);background:rgba(255,255,255,.75);border-radius:12px;padding:11px 14px;font:inherit;font-size:.92rem;color:var(--ink)}
.wlq-row input:focus{outline:none;border-color:rgba(180,83,9,.5)}
.wl-card{display:flex;justify-content:space-between;align-items:center;gap:12px;background:rgba(255,255,255,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.72);border-radius:14px;padding:12px 14px;margin-top:10px;box-shadow:0 3px 12px rgba(70,26,36,.07)}
.wl-card-main{min-width:0}
.wl-card-biz{font-weight:800;font-size:.92rem;color:var(--ink)}
.wl-card-svc{font-size:.8rem;color:var(--muted);margin-top:2px}
.wl-st{flex:none;border-radius:999px;padding:6px 12px;font-size:.76rem;font-weight:800;white-space:nowrap}
.wl-st-waiting{background:var(--amber-soft);color:var(--amber)}
.wl-st-notified,.wl-st-booked{background:var(--green-soft);color:var(--green)}

/* ---- 🎟️ damga kartları — amber vurgu, mobil öncelikli ---- */
.sc-card{position:relative}
.sc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sc-biz{font-weight:800;font-size:.98rem;color:var(--ink)}
.sc-dots{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 10px}
.sc-dot{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:1rem;font-weight:800;flex:none;box-sizing:border-box}
.sc-dot.full{background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;box-shadow:0 3px 10px rgba(180,83,9,.32);border:1.5px solid rgba(180,83,9,.5)}
.sc-dot.empty{background:rgba(255,255,255,.55);border:2px dashed rgba(120,113,108,.5);color:transparent}
.sc-reward{margin:0;font-size:.84rem;font-weight:600;color:#92400e;background:var(--amber-soft);border:1px solid rgba(180,83,9,.22);border-radius:12px;padding:9px 13px}
.sc-won{flex:none;display:inline-block;font-size:.72rem;font-weight:800;background:var(--green-soft);color:var(--green);border-radius:999px;padding:4px 11px;white-space:nowrap}`;

// ---------------------------------------------------------------- Ortak sayfa parçaları

function pageShell(o: { title: string; desc: string; body: string; scripts?: string[]; extraCss?: string[]; gwPort?: string | null }): string {
  // Sürüm parametresi: CSS/JS içeriğinin djb2 özeti — içerik değişince URL değişir,
  // tarayıcı/heuristik önbellek eski stili servis edemez (cache-busting).
  let _vh = 5381;
  const _verSrc = STYLE_CSS + '\u0000' + HOME_JS + '\u0000' + DETAIL_JS;
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
<link rel="icon" href="${gw(FAVICON)}">
<link rel="stylesheet" href="${gw('/assets/style.css')}">
  ${extraCss}
</head>
<body>
<div class="page">
${o.body}
</div>
<div id="toast" role="status" aria-live="polite"></div>
  ${scripts}
</body>
</html>`;
}

function siteFooter(): string {
  return `<footer class="ft">
  <div class="ft-in">
    <span class="fl">GNC Randevu — tüm işletmeler tek yerde</span>
    <span class="fr">Randevun bir dokunuş uzağında · Türkçe · Mobil uyumlu</span>
  </div>
</footer>`;
}

// ---------------------------------------------------------------- ANA SAYFA

export function homePage(baseDomain: string, gwPort?: string | null): string {
  const cfg = jsonIsland({ baseDomain });
  const chips: Array<[string, string]> = [
    ['', 'Tümü'],
    ['berber', '💈 Berber'],
    ['kuafor', '✂️ Kuaför'],
    ['disci', '🦷 Dişçi'],
    ['guzellik', '💄 Güzellik'],
    ['spa', '🧖 Spa'],
    ['dovme', '🎨 Dövme'],
  ];
  const chipHtml = chips
    .map(([v, l], i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-type="${v}" ${v ? '' : 'aria-pressed="true"'}>${l}</button>`)
    .join('');

  const body = `<header class="top">
  <div class="top-in">
    <a class="logo" href="/">GNC Randevu</a>
    <div class="search">
      <span class="s-ic" aria-hidden="true">🔍</span>
      <input type="search" id="q" placeholder="İşletme, hizmet veya şehir ara…" aria-label="İşletme ara" autocomplete="off">
      <kbd class="s-kbd" aria-hidden="true">/</kbd>
    </div>
    <a class="btn btn-ghost member-btn" style="padding:8px 16px;font-size:.85rem;flex:none" id="member-btn" href="${gwPort ? '/uyelik?XTransformPort=' + encodeURIComponent(gwPort) : '/uyelik'}">👤 Giriş / Kayıt</a>
  </div>
</header>
<main>
  <section class="hero" aria-label="Tanıtım">
    <h1>Berberden dişçiye, kuaförden spaya — <em>yakınındaki tüm işletmeler</em> burada</h1>
    <p>Konumunu paylaş, en yakın işletmeyi bul; hizmeti seç, uygun saati yakala, randevunu saniyeler içinde oluştur. Üyeliksiz de olur — üye olursan randevuların tek ekranda.</p>
    <div class="hero-chips" aria-hidden="true">
      <span class="hero-chip">⚡ Saniyeler içinde randevu</span>
      <span class="hero-chip">🪪 Üyeliksiz de mümkün</span>
      <span class="hero-chip">👤 Üye ol — randevuların cebinde</span>
      <span class="hero-chip">🧭 Konuma göre en yakın</span>
    </div>
    <button type="button" class="btn btn-geo" id="geo-btn">📍 Konumuma göre en yakını bul</button>
    <p class="loc-status" id="loc-status" role="status" aria-live="polite"></p>
  </section>

  <div class="filters-row">
    <div class="chips" id="chips" aria-label="İşletme türü filtresi">${chipHtml}</div>
    <label class="city-wrap"><span class="sr-only">Şehir filtresi</span><select id="city" aria-label="Şehir seç"><option value="">Tüm şehirler</option></select></label>
  </div>

  <section class="map-card" aria-label="İşletme haritası">
    <div class="map-head">
      <h2>🗺️ Haritada işletmeler</h2>
      <button type="button" class="map-toggle" id="map-toggle" aria-expanded="true" aria-controls="biz-map">Haritayı gizle</button>
    </div>
    <div id="biz-map" class="biz-map" role="application" aria-label="İşletmelerin harita üzerinde konumları"></div>
    <p class="map-hint" id="map-hint">💡 Konum izni verirsen 📍 senin konumun da haritada görünür, en yakın işletme ⭐ ile vurgulanır.</p>
  </section>

  <p class="count" id="count" role="status">İşletmeler yükleniyor…</p>
  <section class="grid" id="grid" aria-label="İşletme listesi" aria-live="polite">
    ${Array.from({ length: 8 })
      .map(
        () => `<div class="sk" aria-hidden="true"><div class="sc"></div><div class="sb"><div class="sk-line w60"></div><div class="sk-line w80"></div><div class="sk-line"></div></div></div>`
      )
      .join('')}
  </section>
  <noscript><p class="state-box">🙏 Bu site randevuları canlı göstermek için JavaScript kullanır — tarayıcında JavaScript'i etkinleştirip yenile.</p></noscript>
</main>
${siteFooter()}`;

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
  provider: Json; services: Json[]; reviews?: { items: Json[]; summary: Json } | null;
  homeUrl: string; gwPort?: string | null;
}): string {
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
  // başlık yakınında puan rozeti
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
      ? `<div class="rev-reply"><span class="rev-reply-t">💬 İşletme yanıtı</span><p>${esc(r.staffReply)}</p></div>`
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
    ? `<article class="dcard">
        <div class="dbody">
          <h2 class="section-title" style="margin:0">🗺️ Konum</h2>
          <div id="detail-map" class="detail-map" role="application" aria-label="${esc(p.name)} konum haritası"></div>
          <div class="dir-links">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${latStr},${lngStr}" target="_blank" rel="noopener">🧭 Google Yol Tarifi</a>
            <a href="https://www.openstreetmap.org/?mlat=${latStr}&mlon=${lngStr}#map=17/${latStr}/${lngStr}" target="_blank" rel="noopener">🗺️ Haritada Aç</a>
          </div>
        </div>
      </article>`
    : '';

  const body = `<header class="top">
  <div class="top-in">
    <a class="logo" href="${esc(a.homeUrl)}">GNC Randevu</a>
    <a class="btn btn-ghost member-btn" style="padding:8px 16px;font-size:.85rem;margin-left:auto" id="member-btn" href="${a.gwPort ? '/uyelik?XTransformPort=' + encodeURIComponent(a.gwPort) : '/uyelik'}">👤 Giriş / Kayıt</a>
    <a class="btn btn-ghost" style="padding:8px 16px;font-size:.85rem" href="${esc(a.homeUrl)}">← Tüm işletmeler</a>
  </div>
</header>
<main>
  <a class="crumb" href="${esc(a.homeUrl)}"><span aria-hidden="true">←</span> Tüm işletmeler</a>
  <div class="dwrap">
    <div class="dhead">
      <article class="dcard">
        <div class="dcover">
          <span class="phb ph-${esc(p.type)}" aria-hidden="true">${meta.emoji}</span>
          ${p.photo ? `<img class="cphoto" src="${esc(p.photo)}" alt="${esc(p.name)}" onerror="this.remove()">` : ''}
        </div>
        <div class="dbody">
          <div class="row-top">
            <span class="badge b-${esc(p.type)}">${meta.emoji} ${esc(meta.label)}</span>
            ${nSvc ? `<span class="badge b-def">🧾 ${nSvc} hizmet</span>` : ''}
            ${minP !== null ? `<span class="badge b-def">min. ${(minP as number).toLocaleString('tr-TR')} ₺</span>` : ''}
          </div>
          <h1 class="dtitle">${esc(p.name)}</h1>
          ${ratingBadge}
          <p class="dloc">📍 ${esc(p.city)}${p.district ? ' · ' + esc(p.district) : ''}</p>
          ${p.address ? `<p class="daddr">${esc(p.address)}</p>` : ''}
          <div class="dcontact">
            ${p.phone ? `<a class="tel-btn" href="tel:${esc(String(p.phone).replace(/\s+/g, ''))}">📞 ${esc(p.phone)}</a>` : ''}
            <span class="open-chip" id="open-now">⏰ Çalışma saatleri aşağıda</span>
          </div>
        </div>
      </article>
      <article class="dcard">
        <div class="dbody">
          <h2 class="section-title" style="margin:0">🕒 Çalışma Saatleri</h2>
          <table class="hours" aria-label="Çalışma saatleri">${hoursRows}</table>
        </div>
      </article>
      ${mapCard}
    </div>

    <section aria-labelledby="svc-h">
      <h2 class="section-title" id="svc-h">💇 Hizmetler${nSvc ? ` <span class="badge b-kuafor">${nSvc}</span>` : ''}</h2>
      ${
        nSvc
          ? `<div class="svc-list">${a.services
              .map(
                (s) => `<div class="svc">
          <span class="si" aria-hidden="true">${meta.emoji}</span>
          <div><div class="sn">${esc(s.name)}</div><div class="sc-cat">${esc(s.category || 'Hizmet')}</div></div>
          <div class="svc-meta"><div class="svc-dur">⏱ ${esc(s.duration)} dk</div><div class="svc-price">${(s.price ?? 0).toLocaleString('tr-TR')} ₺</div></div>
          <button type="button" class="svc-pick" data-svc="${esc(s.id)}">Randevu Al</button>
        </div>`
              )
              .join('')}</div>`
          : `<p class="hint">Bu işletme henüz hizmet eklememiş — yine de telefonla ulaşabilirsin.</p>`
      }
    </section>

    <section id="degerlendirmeler" aria-labelledby="rev-h">
      <h2 class="section-title" id="rev-h">⭐ Değerlendirmeler${revCount ? ` <span class="badge b-kuafor">${revCount}</span>` : ''}</h2>

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
              : `<p class="rev-empty">Bu işletme henüz değerlendirme almamış — randevundan sonra ilk puanı sen verebilirsin. ⭐</p>`
          }
        </div>
        <button type="button" class="btn btn-geo rev-open" id="rev-open">⭐ Değerlendir</button>
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
          <button type="submit" class="btn btn-submit" id="rv-submit">⭐ Değerlendirmeyi Gönder</button>
          <p class="mini-note" style="text-align:center">Değerlendirmeler inceleme sonrası yayınlanır · tek randevu bir kez puanlanır</p>
        </div>
      </form>

      <div class="rev-done" id="rev-done" hidden>
        <span class="okmark" aria-hidden="true">🙏</span>
        <h3 style="margin:6px 0 4px">Teşekkürler!</h3>
        <p id="rev-done-msg" class="sub">Değerlendirmen incelemeden sonra yayınlanacak.</p>
      </div>

      ${revCards ? `<div class="rev-list">${revCards}</div>` : ''}
    </section>

    ${
      nSvc
        ? `<section class="book-card" id="randevu" aria-labelledby="book-h">
      <h2 class="section-title" id="book-h" style="margin:0">📅 Randevu Al</h2>

      <div class="field">
        <label class="f-label" for="f-service">Hizmet seç</label>
        <select id="f-service"></select>
      </div>

      <div>
        <span class="f-label" id="dates-l">Tarih seç <span class="mini-note" style="font-weight:600">· önümüzdeki 14 gün</span></span>
        <div class="dates" id="dates" role="group" aria-labelledby="dates-l"></div>
      </div>

      <div>
        <span class="f-label" id="slots-l">Saat seç</span>
        <button type="button" class="quick-slot" id="quick-slot" hidden aria-label="İlk uygun saati seç"></button>
        <div class="slots" id="slots" aria-live="polite" aria-labelledby="slots-l"></div>
        <button type="button" class="wl-teaser" id="wl-open">⏳ Dolu mu? Bekleme listesine gir</button>
      </div>

      <p class="sumline" id="sumline" hidden></p>

      <form id="book-form" novalidate>
        <div style="display:grid;gap:14px">
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
          <p class="mini-note" id="member-note" hidden style="text-align:center;background:var(--green-soft);border-radius:10px;padding:8px 12px;color:var(--green);font-weight:700"></p>
          <button type="submit" class="btn btn-submit" id="submit-btn">✅ Randevuyu Onayla</button>
          <p class="mini-note" style="text-align:center">Üyeliksiz · Onay sonrası WhatsApp'tan iletebilirsin</p>
        </div>
      </form>

      <div class="success" id="success" hidden>
        <span class="okmark" aria-hidden="true">✅</span>
        <h2>Randevun oluşturuldu!</h2>
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
        <p class="mini-note" id="s-pending-note" hidden>⏳ Randevun işletme onayı bekliyor — onaylandığında bilgilendirilirsin.</p>
        <div class="s-actions">
          <a class="btn btn-wa" id="wa-link" target="_blank" rel="noopener" href="#">💬 WhatsApp'tan Onay Gönder</a>
          <a class="btn btn-ghost" id="s-ics-link" href="#" download hidden>📅 Takvime ekle</a>
          <a class="btn btn-ghost" id="s-appts-link" href="${a.gwPort ? '/uyelik?XTransformPort=' + encodeURIComponent(a.gwPort) : '/uyelik'}" hidden>📅 Randevularıma git →</a>
          <button type="button" class="btn btn-ghost" id="again-btn">➕ Yeni randevu al</button>
          <a class="btn btn-ghost" href="${esc(a.homeUrl)}">🏠 Ana sayfaya dön</a>
        </div>
      </div>

      <div class="wl-box" id="waitlist-box" hidden>
        <p class="wl-title">⏳ Bekleme Listesi</p>
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
            <button type="submit" class="btn btn-wl" id="wl-submit">⏳ Bekleme Listesine Gir</button>
            <p class="mini-note" style="text-align:center">Aynı güne yalnız bir bekleme kaydı · iptal olduğunda sizi ararız</p>
          </div>
        </form>
        <div class="wl-done" id="wl-done" hidden>
          <span class="okmark" aria-hidden="true">⏳</span>
          <h3>Bekleme listesine alındınız!</h3>
          <p class="sub" id="wl-done-msg">Randevu açılır açılmaz sizi arayacağız.</p>
          <p class="mini-note" style="text-align:center">Durumunu <a href="${a.gwPort ? '/uyelik?XTransformPort=' + encodeURIComponent(a.gwPort) : '/uyelik'}">Bekleme Durumum</a> sorgusuyla takip edebilirsin.</p>
        </div>
      </div>
    </section>`
        : ''
    }
  </div>
</main>
${siteFooter()}`;

  return pageShell({
    title: `${p.name} — Online Randevu | GNC Randevu`,
    desc: `${p.name} (${p.city}) online randevu: hizmetler, çalışma saatleri ve uygun saatler. Saniyeler içinde üyeliksiz randevu.`,
    body,
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
  <h2>${term && svcMatched ? `“${esc(term)}” için hizmet eşleşmeleri 👀` : 'Belki şunları arıyorsun? 👀'}</h2>
  ${term && svcMatched ? `<p class="nf-sub" style="margin:-4px 0 10px">🔎 Aradığın terim bir <b>hizmet</b> adında geçiyor — o hizmeti veren işletmeleri öne çıkardık.</p>` : ''}
  <div class="nf-grid">
    ${suggestions
      .map((b) => {
        const meta = typeMeta(String(b.type || ''));
        const loc = [b.district, b.city].filter(Boolean).join(' · ');
        const svcChip = b._svcMatch ? `<span class="nf-svc">${meta.emoji} ${esc(b._svcMatch)} hizmeti var</span>` : '';
        const href = baseDomain
          ? `https://${esc(b.slug)}.${esc(baseDomain)}`
          : gwPort
            ? `/isletme/${encodeURIComponent(String(b.slug))}?XTransformPort=${encodeURIComponent(gwPort)}`
            : `/isletme/${encodeURIComponent(String(b.slug))}`;
        return `<a class="nf-item" href="${href}">
      <span class="nf-ic" aria-hidden="true">${meta.emoji}</span>
      <span style="min-width:0"><span class="nf-nm">${esc(b.name)}</span>${svcChip}${loc ? `<span class="nf-loc" style="display:block">📍 ${esc(loc)}</span>` : ''}</span>
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
    body: `<header class="top"><div class="top-in"><a class="logo" href="${esc(backHref)}">GNC Randevu</a></div></header>
<main><div class="center-page"><div class="center-card" style="max-width:560px">
  <span class="big" aria-hidden="true">🧭</span>
  <h1>Aradığın işletmeyi bulamadık</h1>
  <p>${slug ? `"<b>${esc(slug)}</b>" adında kayıtlı bir işletme yok — adres yanlış yazılmış, işletme kaldırılmış ya da henüz eklenmemiş olabilir.` : 'Aradığın sayfa mevcut değil.'}</p>
  <form class="nf-search" action="${esc(backHref)}" method="get" role="search">
    ${gwHidden}
    <input type="search" name="q" placeholder="İşletme veya hizmet ara…" aria-label="İşletme veya hizmet ara"${term ? ` value="${esc(term)}"` : ''}>
    <button type="submit" class="btn btn-geo" style="padding:10px 18px">🔍 Ara</button>
  </form>
  <p class="nf-sub">💡 Not: <b>işletme-adi</b> biçimindeki alt alan adları GNC Randevu sistemine ayrılmıştır; henüz işletme atanmamış adreslerde bu sayfa görünür.</p>
  ${suggHtml}
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
    <a class="btn btn-geo" href="${esc(backHref)}">🏠 Tüm işletmelere göz at</a>
  </div>
</div></div></main>
${siteFooter()}`,
  });
}

export function serverErrorPage(msg: string, gwPort?: string | null): string {
  return pageShell({
    title: 'Bir sorun oluştu | GNC Randevu',
    desc: 'Beklenmeyen bir hata oluştu.',
    gwPort,
    body: `<header class="top"><div class="top-in"><a class="logo" href="/">GNC Randevu</a></div></header>
<main><div class="center-page"><div class="center-card">
  <span class="big" aria-hidden="true">🛠️</span>
  <h1>Bir şeyler ters gitti</h1>
  <p>${esc(msg)}</p>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
    <a class="btn btn-geo" href="/">🏠 Ana sayfaya dön</a>
    <a class="btn btn-ghost" href="javascript:location.reload()">🔄 Sayfayı yenile</a>
  </div>
</div></div></main>
${siteFooter()}`,
  });
}

// ---------------------------------------------------------------- ÜYELİK SAYFASI

export function memberPage(baseDomain: string, gwPort?: string | null): string {
  const body = `<header class="top">
  <div class="top-in">
    <a class="logo" href="/">GNC Randevu</a>
    <a class="btn btn-ghost" style="padding:8px 16px;font-size:.85rem;margin-left:auto" href="/">← Tüm işletmeler</a>
  </div>
</header>
<main>
  <section class="mem-hero">
    <h1>👤 Üyelik</h1>
    <p>Üye ol; tüm işletmelerdeki randevularını tek ekrandan takip et, istediğinde iptal et. Üyeliksiz de randevu alabilirsin — üyelik isteğe bağlıdır.</p>
  </section>

  <div class="mem-wrap" id="mem-auth" hidden>
    <div class="mem-card">
      <div class="mem-tabs" role="tablist" aria-label="Giriş veya kayıt">
        <button type="button" class="mem-tab on" id="tab-login" role="tab" aria-selected="true">🔑 Giriş Yap</button>
        <button type="button" class="mem-tab" id="tab-register" role="tab" aria-selected="false">✨ Kayıt Ol</button>
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
          <button type="submit" class="btn btn-submit">🔑 Giriş Yap</button>
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
          <button type="submit" class="btn btn-submit">✨ Üye Ol</button>
          <p class="mini-note" style="text-align:center">Üyelikle randevuların profilinde saklanır — her işletmede ayrı ayrı bilgi girmenize gerek kalmaz.</p>
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
        <button type="button" class="btn btn-ghost" id="logout-btn">🚪 Çıkış Yap</button>
        <a class="btn btn-geo" href="/">🏠 Randevu Al</a>
      </div>
      <div class="mem-danger">
        <button type="button" class="del-btn" id="delete-btn">🗑️ Hesabımı Sil</button>
        <span class="mini-note">KVKK kapsamında üyeliğini ve tüm randevularını kalıcı olarak sil.</span>
      </div>
    </div>

    <h2 class="section-title" style="margin:22px 2px 6px">📅 Randevularım</h2>
    <div class="rem-pref" id="rem-pref" hidden>
      <button type="button" class="rem-row" id="rem-toggle" role="switch" aria-checked="true" aria-describedby="rem-note">
        <span class="rem-ic" aria-hidden="true">🔔</span>
        <span class="rem-txt">
          <b>Hatırlatıcılar</b>
          <span class="rem-sub" id="rem-state">Açık — randevu saatinden 2 saat önce hatırlatma alınır</span>
        </span>
        <span class="rem-sw" aria-hidden="true"><span class="rem-knob"></span></span>
      </button>
      <p class="rem-note" id="rem-note">Tercihin bu cihazda saklanır. "📅 Takvime ekle" ile indirdiğin takvim dosyasına, açıkken randevu saatinden 2 saat önce çalan bir hatırlatma eklenir.</p>
    </div>
    <div id="appt-list" aria-live="polite"><div class="mem-card" style="text-align:center;color:var(--muted)"><span class="spin dark"></span> Randevuların yükleniyor…</div></div>

    <h2 class="section-title" style="margin:24px 2px 6px">🎟️ Damga Kartlarım</h2>
    <div id="sc-list" aria-live="polite"><div class="mem-card" style="text-align:center;color:var(--muted)"><span class="spin dark"></span> Damga kartların yükleniyor…</div></div>
  </div>

  <section class="wlq-wrap" aria-labelledby="wlq-h">
    <h2 class="section-title" id="wlq-h" style="margin:22px 2px 6px">⏳ Bekleme Durumum</h2>
    <div class="mem-card">
      <p class="mini-note" style="margin:0 0 12px">Dolu slot için bekleme listesine girdiysen, telefon numaranla durumunu sorgulayabilirsin — üye olman gerekmez.</p>
      <form id="wlq-form" novalidate>
        <div class="wlq-row">
          <input id="wlq-phone" type="tel" placeholder="0555 111 22 33" inputmode="tel" autocomplete="tel" aria-label="Telefon numarası">
          <button type="submit" class="btn btn-submit" style="width:auto;padding:12px 20px">🔍 Sorgula</button>
        </div>
        <p class="form-err" id="wlq-err" hidden></p>
      </form>
      <div id="wlq-result" aria-live="polite"></div>
    </div>
  </section>

  <div class="del-overlay" id="del-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="del-title">
    <div class="del-box">
      <h2 id="del-title">⚠️ Hesabını silmek istediğine emin misin?</h2>
      <p>Bu işlem <b>geri alınamaz</b>: üyeliğin silinir ve tüm işletmelerdeki randevuların — iptal edilenler dahil — kalıcı olarak kaldırılır.</p>
      <p class="warn">🔐 Onay için hesap şifreni gir. Silme işleminden sonra aynı numarayla tekrar kayıt olabilirsin.</p>
      <div class="field">
        <label class="f-label" for="del-pass">Şifre teyidi</label>
        <input id="del-pass" type="password" autocomplete="current-password" placeholder="••••••">
      </div>
      <p class="form-err" id="del-err" hidden></p>
      <div class="del-actions">
        <button type="button" class="btn btn-ghost" id="del-cancel">Vazgeç</button>
        <button type="button" class="btn del-confirm" id="del-confirm">🗑️ Hesabımı Kalıcı Olarak Sil</button>
      </div>
    </div>
  </div>
  <div class="del-overlay" id="rev-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="rev-ov-title">
    <div class="del-box">
      <h2 id="rev-ov-title">⭐ Randevunu Değerlendir</h2>
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
        <button type="button" class="btn btn-submit" id="rov-send" style="border:none">⭐ Gönder</button>
      </div>
    </div>
  </div>
</main>
${siteFooter()}`;

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
    berber: { label: 'Berber', emoji: '💈' },
    kuafor: { label: 'Kuaför', emoji: '✂️' },
    disci: { label: 'Dişçi', emoji: '🦷' },
    guzellik: { label: 'Güzellik', emoji: '💄' },
    spa: { label: 'Spa', emoji: '🧖' },
    dovme: { label: 'Dövme', emoji: '🎨' }
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

  function pinIcon(emoji, nearest) {
    var size = nearest ? [46, 46] : [32, 32];
    var html = '<div class="biz-pin' + (nearest ? ' pin-nearest' : '') + '">' + emoji + (nearest ? '<span class="pin-star" aria-hidden="true">⭐</span>' : '') + '</div>';
    return L.divIcon({ className: '', html: html, iconSize: size, iconAnchor: [size[0] / 2, size[1]], popupAnchor: [0, -(size[1] + 6)] });
  }

  function popHtml(it) {
    var t = TYPE[it.type] || { label: 'İşletme' };
    var sub = esc(t.label) + (it.district ? ' · ' + esc(it.district) : '') + (it.city ? ' · ' + esc(it.city) : '');
    var dist = (typeof it._d === 'number') ? '<div class="pop-d">📍 Sana ' + esc(fmtKm(it._d)) + '</div>' : '';
    return '<div class="biz-pop"><div class="pop-t">' + esc(it.name) + '</div><div class="pop-s">' + sub + '</div>' + dist +
      '<a class="pop-link" href="' + bizHref(it.slug) + '">Randevu Al →</a></div>';
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
      var t = TYPE[it.type] || { label: 'İşletme', emoji: '🏪' };
      var isNearest = (minD !== null && it._d === minD);
      var m = L.marker([it.lat, it.lng], { icon: pinIcon(t.emoji, isNearest), title: it.name, alt: it.name });
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
    var t = TYPE[it.type] || { label: 'İşletme', emoji: '🏪' };
    var tKey = TYPE[it.type] ? it.type : 'def';
    var svcs = it.services || [];
    var minP = null;
    for (var j = 0; j < svcs.length; j++) {
      if (typeof svcs[j].price === 'number' && (minP === null || svcs[j].price < minP)) minP = svcs[j].price;
    }
    var cover = it.photo
      ? '<span class="phb ph-' + tKey + '" aria-hidden="true">' + t.emoji + '</span><img class="cphoto" src="' + esc(it.photo) + '" alt="' + esc(it.name) + '" loading="lazy" onerror="this.remove()">'
      : '<span class="phb ph-' + tKey + '" aria-hidden="true">' + t.emoji + '</span>';
    var dist = (typeof it._d === 'number') ? '<span class="dist">📍 ' + esc(fmtKm(it._d)) + '</span>' : '';
    var rate = (typeof it.ratingAvg === 'number' && it.ratingCount > 0)
      ? '<span class="rate-chip"><span class="s" aria-hidden="true">★</span>' +
        esc(it.ratingAvg.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })) +
        ' <span style="font-weight:600;opacity:.75">(' + it.ratingCount + ')</span></span>'
      : '';
    var tel = it.phone ? '<a class="tel-link" href="tel:' + esc(String(it.phone).replace(/\\s+/g, '')) + '" title="Ara">📞 ' + esc(it.phone) + '</a>' : '<span></span>';
    return '<article class="card" style="animation-delay:' + Math.min(i * 45, 400) + 'ms">' +
      '<div class="cover">' + cover + '</div>' +
      '<div class="body">' +
      '<div class="row-top"><span class="badge b-' + tKey + '">' + t.emoji + ' ' + esc(t.label) + '</span>' + rate + dist + '</div>' +
      '<h3 class="c-name"><a class="card-link" href="' + bizHref(it.slug) + '">' + esc(it.name) + '</a></h3>' +
      '<p class="c-loc">📍 ' + esc(it.city || '') + (it.district ? ' · ' + esc(it.district) : '') + '</p>' +
      (it.address ? '<p class="c-addr">' + esc(it.address) + '</p>' : '') +
      '<div class="c-meta"><span>' + svcs.length + ' hizmet</span>' + (minP !== null ? '<span aria-hidden="true">·</span><span class="minp">min. ' + esc(fmtPrice(minP)) + '</span>' : '') + '</div>' +
      '<div class="c-foot">' + tel + '<span class="go" aria-hidden="true">İncele →</span></div>' +
      '</div></article>';
  }

  function skeleton(n) {
    var h = '';
    for (var i = 0; i < n; i++) h += '<div class="sk" aria-hidden="true"><div class="sc"></div><div class="sb"><div class="sk-line w60"></div><div class="sk-line w80"></div><div class="sk-line"></div></div></div>';
    return h;
  }

  function render(items) {
    if (!items.length) {
      grid.innerHTML = '<div class="state-box"><span class="big" aria-hidden="true">🤷</span><p>Aramanla eşleşen işletme bulamadık.<br>Filtreleri temizleyip tekrar dene.</p><button type="button" class="btn btn-ghost" id="clear-filters">✨ Filtreleri temizle</button></div>';
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
          grid.innerHTML = '<div class="state-box"><span class="big" aria-hidden="true">📡</span><p>' + esc(x.j && x.j.error ? x.j.error : 'İşletmeler yüklenemedi.') + '</p><button type="button" class="btn btn-geo" id="retry-btn">🔄 Tekrar dene</button></div>';
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
        grid.innerHTML = '<div class="state-box"><span class="big" aria-hidden="true">📡</span><p>Bağlantı hatası — internetini kontrol edip tekrar dene.</p><button type="button" class="btn btn-geo" id="retry-btn">🔄 Tekrar dene</button></div>';
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
      locStatus.textContent = '😕 Tarayıcın konum desteği vermiyor — listeyi serbestçe inceleyebilirsin.';
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
    locStatus.innerHTML = '✅ En yakın işletme: <b>' + esc(nearest.name) + '</b> (' + esc(fmtKm(nearest._d)) + ') — haritada ⭐ ile işaretlendi.';
    toast('En yakın işletme: ' + nearest.name, 'ok');
    zoomToNearest();
  }

  function onErr() {
    locStatus.textContent = '⚠ Konum izni alınamadı — listeyi serbestçe inceleyebilirsin.';
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
          btn.textContent = '👤 ' + String(x.j.member.name || '').trim().split(/\s+/)[0];
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
        el.textContent = open ? '🟢 Şu anda açık' : '🔴 Şu anda kapalı';
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
          btn.textContent = '⭐ Değerlendirmeyi Gönder';
          if (x.ok && x.j && x.j.ok) {
            form.hidden = true;
            if (doneMsg && x.j.message) doneMsg.textContent = x.j.message;
            if (doneEl) {
              doneEl.hidden = false;
              try { doneEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            }
            toast('Değerlendirmen alındı — teşekkürler! 🙏', 'ok');
          } else {
            if (errEl) { errEl.textContent = (x.j && x.j.error) || 'Değerlendirme gönderilemedi — lütfen tekrar dene.'; errEl.hidden = false; }
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = '⭐ Değerlendirmeyi Gönder';
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
      quickBtn.textContent = '⚡ İlk uygun saat: ' + (label || quickTime);
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
      slotsEl.innerHTML = '<p class="hint">😴 Bu tarihte saat aralığı bulunamadı — işletme kapalı olabilir, başka bir gün dene.</p>';
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
      p.textContent = '🙏 Bu günün tüm saatleri dolu — lütfen başka bir tarih seç.';
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
        btn.textContent = '✅ Randevuyu Onayla';
        if (x.ok && x.j && x.j.success && x.j.data) {
          showSuccess(x.j.data);
        } else {
          showErr((x.j && x.j.error) || 'Randevu oluşturulamadı — lütfen tekrar dene.');
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = '✅ Randevuyu Onayla';
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
      $('#s-status').textContent = d.status === 'onaylandi' ? 'Onaylandı ✅'
        : d.status === 'beklemede' ? 'Onay bekliyor ⏳' : d.status;
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
    toast('Randevun oluşturuldu! 🎉', 'ok');
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
      slotsEl.innerHTML = '<p class="hint">🔁 Tekrar planlama: <b>' + esc(rs.name || 'Hizmet') + '</b> seçili — tarih ve saat seç.</p>';
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
    var EMO = { berber: '💈', kuafor: '✂️', disci: '🦷', guzellik: '💄', spa: '🧖', dovme: '🎨' };
    var dMap = L.map('detail-map', { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları'
    }).addTo(dMap);
    var dSize = [36, 36];
    var dIcon = L.divIcon({ className: '', html: '<div class="biz-pin" style="width:36px;height:36px;font-size:18px">' + (EMO[P.type] || '🏪') + '</div>', iconSize: dSize, iconAnchor: [18, 36], popupAnchor: [0, -42] });
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
      note.textContent = '👤 ' + (m.name || '') + ' olarak randevu alıyorsun — üyeliksiz de devam edebilirsin.';
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
          btn.textContent = '⏳ Bekleme Listesine Gir';
          if (x.ok && x.j && x.j.ok) {
            wlForm.hidden = true;
            var m = document.getElementById('wl-done-msg');
            if (m && x.j.message) m.textContent = x.j.message;
            if (wlDone) {
              wlDone.hidden = false;
              try { wlDone.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            }
            toast('Bekleme listesine alındın! 🙏', 'ok');
          } else {
            wlShowErr((x.j && x.j.error) || 'Bekleme listesine eklenemedi — lütfen tekrar dene.');
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = '⏳ Bekleme Listesine Gir';
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
    document.getElementById('m-phone').textContent = '📞 ' + fmtPhone(member.phone);
    var em = document.getElementById('m-email');
    if (member.email) { em.textContent = '✉️ ' + member.email; em.hidden = false; } else { em.hidden = true; }
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
      wrap.innerHTML = '<div class="mem-card empty-box">🎟️ Henüz damga kartın yok.<br>Damga programı olan işletmelerden hizmet aldıkça kartın burada birikir.</div>';
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
        : '🎉 <b>Ödül hakkın doğdu!</b> Sıradaki ziyaretinde ' + esc(c.rewardDescription) + ' seni bekliyor.';
      return '<div class="mem-card sc-card">' +
        '<div class="sc-top"><span class="sc-biz">' + esc(c.providerName) + '</span>' +
        (Number(c.redeemedCount) > 0 ? '<span class="sc-won">🏆 ' + c.redeemedCount + ' ödül kazandın</span>' : '') +
        '</div>' +
        '<div class="sc-dots" role="img" aria-label="' + st + ' / ' + req + ' damga dolu">' + dots + '</div>' +
        '<p class="sc-reward">🎯 ' + reward + '</p>' +
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
          wrap.innerHTML = '<div class="mem-card empty-box">🎟️ Damga kartları şu anda alınamadı. <button type="button" class="btn btn-ghost" id="sc-retry" style="margin-top:8px">🔄 Tekrar dene</button></div>';
          var rb = document.getElementById('sc-retry');
          if (rb) rb.addEventListener('click', loadStampCards);
          return;
        }
        renderStampCards(x.j.items || []);
      })
      .catch(function () {
        wrap.innerHTML = '<div class="mem-card empty-box">🎟️ Damga kartları şu anda alınamadı. <button type="button" class="btn btn-ghost" id="sc-retry" style="margin-top:8px">🔄 Tekrar dene</button></div>';
        var rb2 = document.getElementById('sc-retry');
        if (rb2) rb2.addEventListener('click', loadStampCards);
      });
  }

  // ---- randevularım
  var ST = {
    beklemede: { label: '⏳ Onay bekliyor', cls: 'st-beklemede' },
    onaylandi: { label: '✅ Onaylandı', cls: 'st-onaylandi' },
    tamamlandi: { label: '🏁 Tamamlandı', cls: 'st-tamamlandi' },
    gelmedi: { label: '💤 Gelmedi', cls: 'st-gelmedi' },
    iptal: { label: '🚫 İptal edildi', cls: 'st-iptal' }
  };
  function loadAppointments() {
    listEl.innerHTML = '<div class="mem-card" style="text-align:center;color:var(--muted)"><span class="spin dark"></span> Randevuların yükleniyor…</div>';
    var a = readAuth();
    if (!a) { renderAuth(); return; }
    fetch(gwq('/api/member/appointments'), { headers: { accept: 'application/json', authorization: 'Bearer ' + a.token } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.status === 401 || (x.j && x.j.error && String(x.j.error).indexOf('Oturum') === 0)) { clearAuth(); renderAuth(); return; }
        if (!x.ok) {
          listEl.innerHTML = '<div class="mem-card empty-box">📡 ' + esc((x.j && x.j.error) || 'Randevular yüklenemedi.') + '<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">🔄 Tekrar dene</button></div>';
          var rb = document.getElementById('appt-retry');
          if (rb) rb.addEventListener('click', loadAppointments);
          return;
        }
        renderAppointments(x.j.items || []);
      })
      .catch(function () {
        listEl.innerHTML = '<div class="mem-card empty-box">📡 Bağlantı hatası — internetini kontrol et.<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">🔄 Tekrar dene</button></div>';
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
      replan = '<button type="button" class="appt-replan" data-slug="' + esc(it.providerSlug) + '" data-svc="' + esc(it.serviceId || '') + '" aria-label="' + esc(it.providerName || '') + ' — ' + esc(it.serviceName || 'aynı hizmet') + ' için yeni randevu al">🔁 Tekrar planla</button>';
    }
    // ⭐ Değerlendirme: tamamlanmış ya da tarihi geçmiş + henüz değerlendirilmemiş
    // (iptal/reddedildi randevular API'de zaten listelenmez)
    var reviewable = !cancelledMode && !it.reviewed && it.providerSlug &&
      (it.status === 'tamamlandi' || new Date(it.date).getTime() < Date.now());
    var reviewBtn = reviewable
      ? '<button type="button" class="appt-review" data-id="' + esc(it.id) + '" data-slug="' + esc(it.providerSlug) + '" data-biz="' + esc(it.providerName || '') + '" data-svc="' + esc(it.serviceName || 'Hizmet') + '" data-when="' + esc(fmtWhen(it.date)) + '" data-code="' + esc(it.code || '') + '" aria-label="' + esc(it.providerName || '') + ' — ' + esc(it.serviceName || 'hizmet') + ' randevusunu değerlendir">⭐ Değerlendir</button>'
      : '';
    // 📅 Takvime ekle: aktif randevuların ICS dosyası. İptal kartında
    // gösterilmez (iptal randevuyu takvime eklemek anlamsız — orada "Tekrar
    // planla" kısayolu öne çıkar; sunucu yine de STATUS:CANCELLED üretir).
    var icsBtn = (!cancelledMode && it.code)
      ? '<a class="appt-ics" href="' + esc(icsHref(it.code)) + '" download aria-label="' + esc(it.providerName || '') + ' — ' + esc(it.serviceName || 'randevu') + ' takvim dosyasını (.ics) indir">📅 Takvime ekle</a>'
      : '';
    return '<div class="appt">' +
      '<div class="appt-main">' +
      '<div class="appt-biz"><a href="' + esc(bizHref(it.providerSlug || '')) + '" style="color:inherit;text-decoration:none">' + esc(it.providerName) + '</a></div>' +
      '<div class="appt-svc">' + esc(it.serviceName || 'Hizmet') + (it.staffName ? ' · 👤 ' + esc(it.staffName) : '') + (!cancelledMode && typeof it.price === 'number' && it.price > 0 ? ' · ' + esc(fmtPrice(it.price, it.currency)) : '') + '</div>' +
      '<div class="appt-when">📅 ' + esc(fmtWhen(it.date)) + (cancelledMode ? ' <span style="color:var(--muted);font-weight:400">(iptal edildi)</span>' : '') + '</div>' +
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
      listEl.innerHTML = '<div class="mem-card empty-box">📭 Henüz randevun yok.<br><span style="font-size:.85rem">Bir işletme seçip saniyeler içinde randevu alabilirsin.</span><br><a class="btn btn-geo" style="margin-top:12px" href="/">🏠 İşletmelere göz at</a></div>';
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
          setBusy(sendBtn, false, '⭐ Gönder');
          if (x.ok && x.j && x.j.ok) {
            closeRevOverlay();
            toast('Teşekkürler! Değerlendirmen incelemeden sonra yayınlanacak. 🙏', 'ok');
            loadAppointments();
          } else {
            showErr('rov-err', (x.j && x.j.error) || 'Değerlendirme gönderilemedi — tekrar dene.');
          }
        })
        .catch(function () {
          setBusy(sendBtn, false, '⭐ Gönder');
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
        ? '🔔 Hatırlatıcılar açıldı — randevudan 2 saat önce hatırlatma alırsın.'
        : '🔕 Hatırlatıcılar kapatıldı.', 'ok');
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
          toast('Randevu iptal edildi. Tekrar planlamak ister misin? 🔁', 'ok');
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
        setBusy(btn, false, '🔑 Giriş Yap');
        if (x.ok && x.j && x.j.token) {
          saveAuth({ token: x.j.token, member: x.j.member });
          toast('Hoş geldin, ' + (x.j.member.name || '') + '! 👋', 'ok');
          renderLogged(x.j.member);
        } else {
          showErr('l-err', (x.j && x.j.error) || 'Giriş yapılamadı.');
        }
      })
      .catch(function () { setBusy(btn, false, '🔑 Giriş Yap'); showErr('l-err', 'Bağlantı hatası — tekrar dene.'); });
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
        setBusy(btn, false, '✨ Üye Ol');
        if (x.ok && x.j && x.j.token) {
          saveAuth({ token: x.j.token, member: x.j.member });
          toast('Üyeliğin oluşturuldu! 🎉', 'ok');
          renderLogged(x.j.member);
        } else {
          showErr('r-err', (x.j && x.j.error) || 'Kayıt oluşturulamadı.');
        }
      })
      .catch(function () { setBusy(btn, false, '✨ Üye Ol'); showErr('r-err', 'Bağlantı hatası — tekrar dene.'); });
  });

  // ---- çıkış
  document.getElementById('logout-btn').addEventListener('click', function () {
    clearAuth();
    toast('Çıkış yapıldı. Görüşürüz! 👋', 'ok');
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
        setBusy(delConfirm, false, '🗑️ Hesabımı Kalıcı Olarak Sil');
        if (x.ok && x.j && x.j.ok) {
          closeDel();
          clearAuth();
          toast('Hesabın ve tüm randevuların kalıcı olarak silindi. İyi günler! 🌿', 'ok');
          renderAuth();
        } else {
          showErr('del-err', (x.j && x.j.error) || 'Hesap silinemedi — tekrar dene.');
        }
      })
      .catch(function () {
        setBusy(delConfirm, false, '🗑️ Hesabımı Kalıcı Olarak Sil');
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
      waiting: { label: '⏳ Sıradasınız', cls: 'wl-st-waiting' },
      notified: { label: '📞 Aranacağınızı bildirdik', cls: 'wl-st-notified' },
      booked: { label: '✅ Randevunuz oluşturuldu', cls: 'wl-st-booked' }
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
      if (resEl) resEl.innerHTML = '<div class="mem-card" style="text-align:center;color:var(--muted)"><span class="spin dark"></span> Bekleme kayıtların sorgulanıyor…</div>';
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
            resEl.innerHTML = '<div class="mem-card empty-box">📭 Bu numaraya ait aktif bekleme kaydı yok.<br><span style="font-size:.85rem">Dolu bir slot için işletme sayfasındaki "⏳ Dolu mu? Bekleme listesine gir" ile listeye girebilirsin.</span></div>';
            return;
          }
          resEl.innerHTML = items.map(function (w) {
            var st = ST_WL[w.status] || ST_WL.waiting;
            return '<div class="wl-card">' +
              '<div class="wl-card-main">' +
              '<div class="wl-card-biz">' + esc(w.providerName) + '</div>' +
              '<div class="wl-card-svc">' + esc(w.serviceName || 'Hizmet') + ' · 📅 ' + esc(fmtDay(w.preferredDate)) + (w.preferredSlot ? ' · ⏱ ' + esc(w.preferredSlot) : '') + '</div>' +
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
