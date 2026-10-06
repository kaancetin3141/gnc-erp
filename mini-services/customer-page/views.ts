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
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍉</text></svg>'
  );

// ---------------------------------------------------------------- Ortak CSS

export const STYLE_CSS = `
:root{
  --bg:#fdf7f1;--surface:#ffffff;--ink:#2b211b;--muted:#93796a;--line:#f0e2d6;
  --brand:#c2334d;--brand-soft:#fdeef1;--amber:#b45309;--amber-soft:#fef3e2;
  --green:#0d8a63;--green-soft:#e7f6ef;--pink:#be185d;--pink-soft:#fdeaf3;
  --teal:#0f766e;--teal-soft:#e6f7f5;
  --shadow:0 8px 24px rgba(160,84,60,.10);--shadow-lg:0 16px 40px rgba(160,84,60,.18);
  --radius:18px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased}
img{max-width:100%}
a{color:var(--brand)}
:focus-visible{outline:3px solid rgba(194,51,77,.35);outline-offset:2px;border-radius:6px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* ---- sayfa iskeleti: sticky footer ---- */
.page{min-height:100vh;min-height:100svh;display:flex;flex-direction:column}
main{flex:1 0 auto;width:100%;max-width:1200px;margin:0 auto;padding:0 16px 56px}
.wrap-wide{max-width:1200px;margin:0 auto;padding:0 16px}

/* ---- sticky header ---- */
header.top{position:sticky;top:0;z-index:50;background:rgba(253,247,241,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top-in{max-width:1200px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.logo{display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:1.12rem;color:var(--ink);text-decoration:none;letter-spacing:-.01em;white-space:nowrap}
.logo .lg{font-size:1.45rem;transform:translateY(1px)}
.search{flex:1 1 200px;max-width:430px;min-width:170px;position:relative;margin-left:auto}
.search input{width:100%;padding:10px 14px 10px 38px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);font:inherit;font-size:.93rem;transition:border-color .2s,box-shadow .2s;color:var(--ink)}
.search input::placeholder{color:#bda492}
.search input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-soft)}
.search .s-ic{position:absolute;left:13px;top:50%;transform:translateY(-50%);opacity:.55;font-size:.95rem;pointer-events:none}

/* ---- hero ---- */
.hero{margin:22px 0 10px;padding:34px 26px;border-radius:26px;background:linear-gradient(120deg,#fdeef1 0%,#fef3e2 55%,#e7f6ef 100%);box-shadow:var(--shadow);position:relative;overflow:hidden}
.hero::after{content:"📍";position:absolute;right:18px;bottom:-14px;font-size:6rem;opacity:.08;transform:rotate(-12deg)}
.hero h1{font-size:clamp(1.5rem,4.2vw,2.35rem);font-weight:800;letter-spacing:-.02em;line-height:1.18}
.hero h1 em{font-style:normal;color:var(--brand)}
.hero p{margin-top:10px;color:#6d5647;max-width:58ch;font-size:.98rem}
.hero .btn-geo{margin-top:18px}
.loc-status{margin-top:10px;font-size:.88rem;color:#7a6353;font-weight:600;min-height:1.3em}

/* ---- butonlar ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:pointer;font:inherit;font-weight:700;border-radius:999px;padding:12px 22px;transition:transform .15s ease,box-shadow .2s ease,background .2s ease,text-decoration:none;color:var(--ink)}
.btn:active{transform:scale(.97)}
.btn-geo{background:linear-gradient(120deg,var(--brand),#e8804f);color:#fff;box-shadow:0 8px 20px rgba(194,51,77,.32);font-size:1rem}
.btn-geo:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(194,51,77,.42)}
.btn-geo:disabled{opacity:.6;cursor:wait;transform:none}
.btn-wa{background:var(--green);color:#fff;box-shadow:0 8px 20px rgba(13,138,99,.3)}
.btn-wa:hover{transform:translateY(-2px)}
.btn-ghost{background:var(--surface);border:1.5px solid var(--line)}
.btn-ghost:hover{border-color:var(--brand);color:var(--brand)}

/* ---- filtre çipleri ---- */
.filters-row{display:flex;gap:12px;align-items:center;margin:14px 0 4px}
.chips{display:flex;gap:8px;overflow-x:auto;padding:6px 2px;flex:1;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
.chip{flex:0 0 auto;padding:8px 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);font:inherit;font-weight:600;font-size:.88rem;cursor:pointer;transition:all .15s ease;color:#5d4a3d}
.chip:hover{border-color:var(--brand);color:var(--brand);transform:translateY(-1px)}
.chip.on{background:var(--brand);border-color:var(--brand);color:#fff;box-shadow:0 6px 14px rgba(194,51,77,.28)}
.city-wrap select{padding:9px 34px 9px 14px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);font:inherit;font-size:.88rem;font-weight:600;color:#5d4a3d;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2393796a' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.city-wrap select:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-soft)}
.count{margin:10px 2px 14px;font-size:.86rem;color:var(--muted);font-weight:600}

/* ---- kart grid ---- */
.grid{display:grid;gap:1.25rem;grid-template-columns:1fr}
@media(min-width:600px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:960px){.grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:1280px){.grid{grid-template-columns:repeat(4,1fr)}}
.card{position:relative;display:flex;flex-direction:column;background:var(--surface);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);transition:transform .2s ease,box-shadow .25s ease;animation:rise .4s ease both}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
.cover{position:relative;height:150px;flex:none}
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
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:.73rem;font-weight:700;letter-spacing:.01em}
.b-berber{background:var(--amber-soft);color:#92400e}
.b-kuafor{background:var(--brand-soft);color:var(--brand)}
.b-disci{background:var(--green-soft);color:#065f46}
.b-guzellik{background:var(--pink-soft);color:var(--pink)}
.b-spa{background:var(--teal-soft);color:var(--teal)}
.b-dovme{background:#efe9e4;color:#44403c}
.b-def{background:#f3ece5;color:#6d5647}
.dist{margin-left:auto;font-size:.73rem;font-weight:800;color:var(--green);background:var(--green-soft);padding:3px 9px;border-radius:999px;font-variant-numeric:tabular-nums;white-space:nowrap}
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
.sk{border-radius:var(--radius);background:var(--surface);overflow:hidden;box-shadow:var(--shadow)}
.sk .sc{height:150px;background:linear-gradient(90deg,#f3e7dc 25%,#faf1e8 50%,#f3e7dc 75%);background-size:200% 100%;animation:sh 1.2s infinite}
.sk .sb{padding:16px;display:grid;gap:10px}
.sk-line{height:12px;border-radius:6px;background:linear-gradient(90deg,#f3e7dc 25%,#faf1e8 50%,#f3e7dc 75%);background-size:200% 100%;animation:sh 1.2s infinite}
.sk-line.w60{width:60%}.sk-line.w80{width:80%}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
.state-box{grid-column:1/-1;text-align:center;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);padding:40px 20px}
.state-box .big{font-size:2.6rem;display:block;margin-bottom:10px}
.state-box p{color:#6d5647;margin-bottom:16px}

/* ---- sticky footer ---- */
footer.ft{margin-top:auto;background:#2b211b;color:#e9d9c9;padding:22px 16px calc(22px + env(safe-area-inset-bottom,0px))}
.ft-in{max-width:1200px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:space-between;font-size:.88rem}
.ft-in .fl{font-weight:700}
.ft-in .fr{opacity:.75}

/* ---- toast ---- */
#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(18px);background:#2b211b;color:#fff;padding:11px 18px;border-radius:12px;font-size:.9rem;font-weight:600;opacity:0;pointer-events:none;transition:all .25s ease;z-index:100;max-width:92vw;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.28)}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#toast.ok{background:var(--green)}
#toast.warn{background:var(--amber)}
#toast.err{background:var(--brand)}

/* ---- spinner ---- */
.spin{width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;animation:rot .7s linear infinite;display:inline-block;flex:none;vertical-align:-3px}
.spin.dark{border-color:rgba(194,51,77,.25);border-top-color:var(--brand)}
@keyframes rot{to{transform:rotate(360deg)}}

/* ============================================================ DETAY SAYFA */
.crumb{display:inline-flex;align-items:center;gap:6px;margin:20px 0 4px;font-size:.88rem;font-weight:700;color:#7a6353;text-decoration:none;transition:color .15s}
.crumb:hover{color:var(--brand)}
.dwrap{display:grid;gap:1.5rem;margin-top:10px}
@media(min-width:900px){.dhead{grid-template-columns:1.25fr 1fr}}
.dhead{display:grid;gap:1.5rem;align-items:start}
.dcard{background:var(--surface);border-radius:20px;box-shadow:var(--shadow);overflow:hidden}
.dcover{position:relative;height:230px}
.dbody{padding:24px;display:grid;gap:10px}
.dtitle{font-size:clamp(1.35rem,3vw,1.85rem);font-weight:800;letter-spacing:-.015em;line-height:1.22}
.dloc{font-size:.92rem;color:#6d5647;font-weight:600}
.daddr{font-size:.9rem;color:#8a7466}
.dcontact{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.tel-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;background:var(--green-soft);color:#065f46;font-weight:800;text-decoration:none;font-size:.9rem;transition:all .15s}
.tel-btn:hover{background:var(--green);color:#fff;transform:translateY(-1px)}
.open-chip{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:999px;font-weight:800;font-size:.9rem;background:#f3ece5;color:#6d5647}
.open-chip.on{background:var(--green-soft);color:#065f46}
.open-chip.off{background:var(--amber-soft);color:#92400e}
.mini-note{font-size:.82rem;color:var(--muted)}
.hours{width:100%;border-collapse:collapse}
.hours td{padding:9px 14px;border-bottom:1px dashed var(--line);font-size:.9rem}
.hours tr:last-child td{border-bottom:none}
.hours td:first-child{font-weight:600;color:#5d4a3d}
.hours td.t-time{text-align:right;font-variant-numeric:tabular-nums;color:#5d4a3d}
.hours tr.today td{background:var(--brand-soft);color:var(--brand);font-weight:800}
.hours tr.today td.t-time{color:var(--brand)}
.today-pill{display:inline-block;margin-left:8px;background:var(--brand);color:#fff;font-size:.66rem;font-weight:800;padding:2px 8px;border-radius:999px;vertical-align:1px}
.closed{color:#b3a294;font-style:italic;font-weight:500!important}

.section-title{font-size:1.2rem;font-weight:800;margin:6px 0 14px;display:flex;align-items:center;gap:8px}
.svc-list{display:grid;gap:10px;max-height:430px;overflow-y:auto;padding:2px 8px 2px 2px}
.svc{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--line);border-radius:14px;background:var(--surface);transition:all .15s}
.svc:hover{border-color:var(--brand);background:#fffafb;box-shadow:var(--shadow)}
.svc .si{flex:none;width:38px;height:38px;border-radius:12px;background:var(--brand-soft);display:flex;align-items:center;justify-content:center;font-size:1.1rem}
.svc .sn{font-weight:700;font-size:.94rem}
.svc .sc-cat{font-size:.74rem;color:var(--muted);font-weight:600}
.svc-meta{margin-left:auto;text-align:right;font-variant-numeric:tabular-nums;flex:none}
.svc-dur{font-size:.76rem;color:var(--muted);font-weight:600;white-space:nowrap}
.svc-price{font-weight:800;color:var(--brand);font-size:.95rem;white-space:nowrap}
.svc-pick{flex:none;border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 13px;font:inherit;font-size:.78rem;font-weight:800;color:var(--brand);cursor:pointer;transition:all .15s}
.svc-pick:hover{background:var(--brand);color:#fff;border-color:var(--brand)}

/* ---- randevu formu ---- */
.book-card{background:var(--surface);border-radius:20px;box-shadow:var(--shadow);padding:24px;display:grid;gap:18px;scroll-margin-top:80px}
.f-label{font-size:.85rem;font-weight:800;color:#5d4a3d;display:block;margin-bottom:7px}
.field input,.field select,.field textarea{padding:11px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);font:inherit;font-size:.94rem;width:100%;transition:border-color .2s,box-shadow .2s;color:var(--ink)}
.field textarea{resize:vertical;min-height:70px}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px var(--brand-soft)}
.hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important}
.dates{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
@media(min-width:640px){.dates{grid-template-columns:repeat(7,1fr)}}
.date-btn{padding:8px 4px;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);cursor:pointer;text-align:center;font:inherit;transition:all .15s}
.date-btn:hover{border-color:var(--brand);transform:translateY(-1px)}
.date-btn.on{background:var(--brand);border-color:var(--brand);color:#fff;box-shadow:0 6px 14px rgba(194,51,77,.3)}
.date-btn .dw{display:block;font-size:.7rem;opacity:.75;font-weight:600}
.date-btn .dn{display:block;font-weight:800;font-size:.84rem;white-space:nowrap}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;max-height:250px;overflow-y:auto;padding:2px}
.slot{padding:10px 0;border-radius:10px;border:1.5px solid var(--line);background:var(--surface);font:inherit;font-weight:700;font-size:.9rem;cursor:pointer;font-variant-numeric:tabular-nums;transition:all .15s;color:var(--ink)}
.slot:hover:not(:disabled){border-color:var(--brand);color:var(--brand)}
.slot.on{background:var(--brand);color:#fff;border-color:var(--brand);box-shadow:0 5px 12px rgba(194,51,77,.3)}
.slot:disabled{opacity:.38;cursor:not-allowed;text-decoration:line-through;background:#faf5ef}
.hint{font-size:.88rem;color:var(--muted);padding:10px 2px}
.err-txt{color:var(--brand);font-weight:700}
.slotload{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:.88rem;font-weight:600;padding:8px 2px}
.sumline{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;background:var(--amber-soft);color:#92400e;padding:11px 15px;border-radius:12px;font-size:.88rem;font-weight:700}
.sumline[hidden]{display:none}
.form-err{background:var(--brand-soft);color:var(--brand);font-weight:700;font-size:.88rem;padding:11px 14px;border-radius:12px}
.form-err[hidden]{display:none}
.btn-submit{width:100%;background:linear-gradient(120deg,var(--brand),#d97706);color:#fff;font-size:1rem;padding:14px;box-shadow:0 8px 20px rgba(194,51,77,.3)}
.btn-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 26px rgba(194,51,77,.38)}
.btn-submit:disabled{opacity:.65;cursor:wait;transform:none}

/* ---- başarı ekranı ---- */
.success{display:grid;gap:16px;text-align:center;padding:14px 6px}
.success[hidden]{display:none}
.okmark{width:66px;height:66px;border-radius:50%;background:var(--green-soft);color:var(--green);font-size:2.1rem;display:flex;align-items:center;justify-content:center;margin:0 auto;animation:pop .45s ease}
@keyframes pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
.success h2{font-size:1.4rem;font-weight:800}
.success .sub{color:#6d5647;font-size:.92rem}
.sumcard{display:grid;text-align:left;background:var(--bg);border-radius:16px;padding:4px 18px;border:1px solid var(--line)}
.sumrow{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px dashed var(--line);font-size:.9rem;align-items:baseline}
.sumrow:last-child{border-bottom:none}
.sumrow .k{color:var(--muted);font-weight:600;flex:none}
.sumrow .v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;word-break:break-word}
.s-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}

/* ---- sayfa düzeyi hata / 404 ---- */
.center-page{min-height:70vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:30px 16px}
.center-card{background:var(--surface);border-radius:22px;box-shadow:var(--shadow);padding:44px 30px;max-width:480px}
.center-card .big{font-size:3rem;display:block;margin-bottom:12px}
.center-card h1{font-size:1.4rem;margin-bottom:10px}
.center-card p{color:#6d5647;margin-bottom:20px}

/* ---- scrollbars ---- */
.svc-list::-webkit-scrollbar,.slots::-webkit-scrollbar,.chips::-webkit-scrollbar{width:8px;height:8px}
.svc-list::-webkit-scrollbar-thumb,.slots::-webkit-scrollbar-thumb,.chips::-webkit-scrollbar-thumb{background:#e4cbb8;border-radius:8px}
.svc-list::-webkit-scrollbar-thumb:hover,.slots::-webkit-scrollbar-thumb:hover,.chips::-webkit-scrollbar-thumb:hover{background:#d3ae93}
.svc-list,.slots,.chips{scrollbar-width:thin;scrollbar-color:#e4cbb8 transparent}

/* ---- telefon dar ekran ---- */
@media(max-width:520px){
  .hero{padding:26px 18px}
  .top-in{gap:8px}
  .search{order:3;flex:1 1 100%;max-width:none}
  .dbody,.book-card{padding:18px}
  .dates{grid-template-columns:repeat(4,1fr)}
  .biz-map{height:300px}
}

/* ---- harita (Leaflet + OSM) ---- */
.map-card{background:#fff;border:1px solid #ecdcd0;border-radius:16px;padding:14px 14px 12px;margin:18px 0;box-shadow:0 4px 18px rgba(63,36,22,.06)}
.map-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 10px}
.map-head h2{font-size:1.02rem;color:#3f2416;margin:0}
.map-toggle{border:1px solid #e4cbb8;background:#fff;color:#8a5a3b;border-radius:999px;padding:5px 12px;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s}
.map-toggle:hover{background:#fdf3ec;border-color:#d3ae93}
.biz-map{height:380px;border-radius:12px;border:1px solid #eadbcd;z-index:0;background:#e8e0d4}
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
.detail-map{height:260px;border-radius:12px;border:1px solid #eadbcd;z-index:0;margin-top:12px}
.dir-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.dir-links a{display:inline-flex;align-items:center;gap:5px;font-size:.8rem;font-weight:700;color:#8a5a3b;background:#fdf3ec;border:1px solid #e4cbb8;border-radius:999px;padding:6px 13px;text-decoration:none;transition:all .15s}
.dir-links a:hover{background:#f7e4d7;transform:translateY(-1px)}
/* leaflet kontrolleri tema uyumu */
.leaflet-bar a,.leaflet-control-attribution{font-family:inherit}
.leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.82)!important}
`;

// ---------------------------------------------------------------- Ortak sayfa parçaları

function pageShell(o: { title: string; desc: string; body: string; scripts?: string[]; extraCss?: string[] }): string {
  const scripts = (o.scripts || []).map((s) => `<script src="${s}" defer></script>`).join('\n  ');
  const extraCss = (o.extraCss || []).map((s) => `<link rel="stylesheet" href="${s}">`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="/assets/style.css">
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
    <span class="fl">🍉 GNC Randevu — tüm işletmeler tek yerde</span>
    <span class="fr">Randevun bir dokunuş uzağında · Türkçe · Mobil uyumlu</span>
  </div>
</footer>`;
}

// ---------------------------------------------------------------- ANA SAYFA

export function homePage(baseDomain: string): string {
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
    <a class="logo" href="/"><span class="lg">🍉</span>GNC Randevu</a>
    <div class="search">
      <span class="s-ic" aria-hidden="true">🔍</span>
      <input type="search" id="q" placeholder="İşletme, hizmet veya şehir ara…" aria-label="İşletme ara" autocomplete="off">
    </div>
  </div>
</header>
<main>
  <section class="hero" aria-label="Tanıtım">
    <h1>Berberden dişçiye, kuaförden spaya — <em>yakınındaki tüm işletmeler</em> burada</h1>
    <p>Konumunu paylaş, en yakın işletmeyi bul; hizmeti seç, uygun saati yakala, randevunu saniyeler içinde oluştur. Üye olmana bile gerek yok.</p>
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

export function detailPage(a: { provider: Json; services: Json[]; homeUrl: string }): string {
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
    <a class="logo" href="${esc(a.homeUrl)}"><span class="lg">🍉</span>GNC Randevu</a>
    <a class="btn btn-ghost" style="padding:8px 16px;font-size:.85rem;margin-left:auto" href="${esc(a.homeUrl)}">← Tüm işletmeler</a>
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
        <div class="slots" id="slots" aria-live="polite" aria-labelledby="slots-l"></div>
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
          <button type="submit" class="btn btn-submit" id="submit-btn">✅ Randevuyu Onayla</button>
          <p class="mini-note" style="text-align:center">Üyeliksiz · Onay sonrası WhatsApp'tan iletebilirsin</p>
        </div>
      </form>

      <div class="success" id="success" hidden>
        <span class="okmark" aria-hidden="true">✅</span>
        <h2>Randevun oluşturuldu!</h2>
        <p class="sub">İşletme randevunu aldı — <b id="s-status">Onaylandı</b>. Aşağıdaki özeti WhatsApp'tan da iletebilirsin.</p>
        <div class="sumcard">
          <div class="sumrow"><span class="k">İşletme</span><span class="v" id="s-biz"></span></div>
          <div class="sumrow"><span class="k">Hizmet</span><span class="v" id="s-service"></span></div>
          <div class="sumrow"><span class="k">Tarih &amp; Saat</span><span class="v" id="s-when"></span></div>
          <div class="sumrow"><span class="k">Ad</span><span class="v" id="s-name"></span></div>
          <div class="sumrow"><span class="k">Telefon</span><span class="v" id="s-phone"></span></div>
          <div class="sumrow" id="s-price-row" hidden><span class="k">Fiyat</span><span class="v" id="s-price"></span></div>
          <div class="sumrow" id="s-code-row" hidden><span class="k">Randevu No</span><span class="v" id="s-code"></span></div>
        </div>
        <div class="s-actions">
          <a class="btn btn-wa" id="wa-link" target="_blank" rel="noopener" href="#">💬 WhatsApp'tan Onay Gönder</a>
          <button type="button" class="btn btn-ghost" id="again-btn">➕ Yeni randevu al</button>
          <a class="btn btn-ghost" href="${esc(a.homeUrl)}">🏠 Ana sayfaya dön</a>
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
  }).replace(
    '</main>',
    `<script id="page-data" type="application/json">${data}</script>\n</main>`
  );
}

// ---------------------------------------------------------------- HATA SAYFALARI

export function notFoundPage(slug?: string): string {
  return pageShell({
    title: 'İşletme bulunamadı | GNC Randevu',
    desc: 'Aradığın işletme bulunamadı.',
    body: `<header class="top"><div class="top-in"><a class="logo" href="/"><span class="lg">🍉</span>GNC Randevu</a></div></header>
<main><div class="center-page"><div class="center-card">
  <span class="big" aria-hidden="true">🔍</span>
  <h1>İşletmeyi bulamadık</h1>
  <p>${slug ? `"<b>${esc(slug)}</b>" adında bir işletme yok ya da kaldırılmış olabilir.` : 'Aradığın sayfa mevcut değil.'}</p>
  <a class="btn btn-geo" href="/">← Tüm işletmelere dön</a>
</div></div></main>
${siteFooter()}`,
  });
}

export function serverErrorPage(msg: string): string {
  return pageShell({
    title: 'Bir sorun oluştu | GNC Randevu',
    desc: 'Beklenmeyen bir hata oluştu.',
    body: `<header class="top"><div class="top-in"><a class="logo" href="/"><span class="lg">🍉</span>GNC Randevu</a></div></header>
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

// ---------------------------------------------------------------- İSTEMCİ JS: ANA SAYFA

export const HOME_JS = `
(function () {
  'use strict';
  var cfgEl = document.getElementById('page-cfg');
  var CFG = cfgEl ? JSON.parse(cfgEl.textContent) : { baseDomain: '' };
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
    return CFG.baseDomain ? 'https://' + slug + '.' + CFG.baseDomain : '/isletme/' + encodeURIComponent(slug);
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
    var tel = it.phone ? '<a class="tel-link" href="tel:' + esc(String(it.phone).replace(/\\s+/g, '')) + '" title="Ara">📞 ' + esc(it.phone) + '</a>' : '<span></span>';
    return '<article class="card" style="animation-delay:' + Math.min(i * 45, 400) + 'ms">' +
      '<div class="cover">' + cover + '</div>' +
      '<div class="body">' +
      '<div class="row-top"><span class="badge b-' + tKey + '">' + t.emoji + ' ' + esc(t.label) + '</span>' + dist + '</div>' +
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
    fetch('/api/businesses' + (qs ? '?' + qs : ''), { headers: { accept: 'application/json' } })
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
  var $ = function (s) { return document.querySelector(s); };
  var state = { serviceId: SVCS.length ? SVCS[0].id : null, date: null, time: null };

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
    selSvc.value = state.serviceId;
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
      html += '<button type="button" class="date-btn' + (i === 0 ? ' on' : '') + '" data-date="' + iso + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '">' +
        '<span class="dw">' + DAYS_TR[d.getDay()] + '</span><span class="dn">' + d.getDate() + ' ' + MON_TR[d.getMonth()] + '</span></button>';
    }
    datesEl.innerHTML = html;
    state.date = firstIso;
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

  // ---- slotlar
  function loadSlots() {
    hideErr();
    if (!state.serviceId || !state.date) return;
    slotsEl.innerHTML = '<div class="slotload"><span class="spin dark"></span> Uygun saatler yükleniyor…</div>';
    fetch('/api/businesses/' + encodeURIComponent(P.slug) + '/slots?date=' + state.date + '&serviceId=' + encodeURIComponent(state.serviceId), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) {
          slotsEl.innerHTML = '<p class="hint err-txt">' + esc(x.j && x.j.error ? x.j.error : 'Saatler yüklenemedi.') + '</p>';
          return;
        }
        renderSlots(x.j.slots || []);
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
    if (!state.time) return showErr('Lütfen bir saat seç.');
    if (name.length < 2) return showErr('Lütfen adını yaz (en az 2 harf).');
    if (phone.replace(/\\D/g, '').length < 10) return showErr('Geçerli bir telefon numarası gir (örn. 0555 111 22 33).');

    var btn = $('#submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Gönderiliyor…';

    fetch('/api/book', {
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
        website: hp
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
    }
    if (d.status) {
      $('#s-status').textContent = d.status === 'onaylandi' ? 'Onaylandı' : d.status;
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
    loadSlots();
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
})();
`;
