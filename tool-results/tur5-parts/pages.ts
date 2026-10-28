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

  const hasGeo = typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat as number) && !isNaN(p.lng as number);
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
