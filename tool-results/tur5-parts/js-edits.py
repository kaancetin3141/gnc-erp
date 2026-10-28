#!/usr/bin/env python3
# tur5: HOME_JS/DETAIL_JS/MEMBER_JS etiket + pin modernizasyonu (Apple estetiği)
import sys

path = '/home/z/my-project/mini-services/customer-page/views.ts'
src = open(path, encoding='utf-8').read()

repls = []  # (old, new, min_count)

# ---------- HOME_JS ----------
repls.append((
"""  var TYPE = {
    berber: { label: 'Berber', emoji: '💈' },
    kuafor: { label: 'Kuaför', emoji: '✂️' },
    disci: { label: 'Dişçi', emoji: '🦷' },
    guzellik: { label: 'Güzellik', emoji: '💄' },
    spa: { label: 'Spa', emoji: '🧖' },
    dovme: { label: 'Dövme', emoji: '🎨' }
  };""",
"""  var TYPE = {
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
  };""", 1))

repls.append((
"""  function pinIcon(emoji, nearest) {
    var size = nearest ? [46, 46] : [32, 32];
    var html = '<div class="biz-pin' + (nearest ? ' pin-nearest' : '') + '">' + emoji + (nearest ? '<span class="pin-star" aria-hidden="true">⭐</span>' : '') + '</div>';
    return L.divIcon({ className: '', html: html, iconSize: size, iconAnchor: [size[0] / 2, size[1]], popupAnchor: [0, -(size[1] + 6)] });
  }""",
"""  function pinIcon(nearest) {
    var size = nearest ? [34, 34] : [26, 26];
    var html = '<div class="biz-pin' + (nearest ? ' pin-nearest' : '') + '"><span class="pin-dot"></span>' + (nearest ? '<span class="pin-star" aria-hidden="true"></span>' : '') + '</div>';
    return L.divIcon({ className: '', html: html, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2], popupAnchor: [0, -(size[1] / 2 + 6)] });
  }""", 1))

repls.append((
"""    var dist = (typeof it._d === 'number') ? '<div class="pop-d">📍 Sana ' + esc(fmtKm(it._d)) + '</div>' : '';""",
"""    var dist = (typeof it._d === 'number') ? '<div class="pop-d">Sana ' + esc(fmtKm(it._d)) + '</div>' : '';""", 1))

repls.append((
"""Randevu Al →</a></div>';""", """Randevu Al ›</a></div>';""", 1))

repls.append((
"""      var t = TYPE[it.type] || { label: 'İşletme', emoji: '🏪' };
      var isNearest = (minD !== null && it._d === minD);
      var m = L.marker([it.lat, it.lng], { icon: pinIcon(t.emoji, isNearest), title: it.name, alt: it.name });""",
"""      var isNearest = (minD !== null && it._d === minD);
      var m = L.marker([it.lat, it.lng], { icon: pinIcon(isNearest), title: it.name, alt: it.name });""", 1))

# cardHtml — Apple "product tile"
repls.append((
"""  function cardHtml(it, i) {
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
    var dist = (typeof it._d === 'number') ? '<span class="dist">📍 ' + esc(fmtKm(it._d)) + '</span>' : '';""",
"""  function cardHtml(it, i) {
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
    var dist = (typeof it._d === 'number') ? '<span class="dist">' + ICON.pin + ' ' + esc(fmtKm(it._d)) + '</span>' : '';""", 1))

repls.append((
"""    var tel = it.phone ? '<a class="tel-link" href="tel:' + esc(String(it.phone).replace(/\\\\s+/g, '')) + '" title="Ara">📞 ' + esc(it.phone) + '</a>' : '<span></span>';
    return '<article class="card" style="animation-delay:' + Math.min(i * 45, 400) + 'ms">' +
      '<div class="cover">' + cover + '</div>' +
      '<div class="body">' +
      '<div class="row-top"><span class="badge b-' + tKey + '">' + t.emoji + ' ' + esc(t.label) + '</span>' + rate + dist + '</div>' +
      '<h3 class="c-name"><a class="card-link" href="' + bizHref(it.slug) + '">' + esc(it.name) + '</a></h3>' +
      '<p class="c-loc">📍 ' + esc(it.city || '') + (it.district ? ' · ' + esc(it.district) : '') + '</p>' +""",
"""    var tel = it.phone ? '<a class="tel-link" href="tel:' + esc(String(it.phone).replace(/\\\\s+/g, '')) + '" title="Ara">' + ICON.phone + ' ' + esc(it.phone) + '</a>' : '<span></span>';
    return '<article class="card" style="animation-delay:' + Math.min(i * 45, 400) + 'ms">' +
      '<a class="card-link" href="' + bizHref(it.slug) + '" aria-label="' + esc(it.name) + ' — detayları gör"><div class="cover">' + cover + '</div></a>' +
      '<div class="body">' +
      '<div class="row-top"><span class="badge b-' + tKey + '">' + esc(t.label) + '</span>' + rate + dist + '</div>' +
      '<h3 class="c-name"><a class="card-link" href="' + bizHref(it.slug) + '">' + esc(it.name) + '</a></h3>' +
      '<p class="c-loc">' + esc(it.city || '') + (it.district ? ' · ' + esc(it.district) : '') + '</p>' +""", 1))

repls.append((
"""'<div class="c-foot">' + tel + '<span class="go" aria-hidden="true">İncele →</span></div>' +""",
"""'<div class="c-foot">' + tel + '<span class="go" aria-hidden="true">İncele ›</span></div>' +""", 1))

# state-box'lar
repls.append((
"""grid.innerHTML = '<div class="state-box"><span class="big" aria-hidden="true">🤷</span><p>Aramanla eşleşen işletme bulamadık.<br>Filtreleri temizleyip tekrar dene.</p><button type="button" class="btn btn-ghost" id="clear-filters">✨ Filtreleri temizle</button></div>';""",
"""grid.innerHTML = '<div class="state-box">' + ICON.search + '<p>Aramanla eşleşen işletme bulamadık.<br>Filtreleri temizleyip tekrar dene.</p><button type="button" class="btn btn-ghost" id="clear-filters">Filtreleri temizle</button></div>';""", 1))

repls.append((
"""grid.innerHTML = '<div class="state-box"><span class="big" aria-hidden="true">📡</span><p>' + esc(x.j && x.j.error ? x.j.error : 'İşletmeler yüklenemedi.') + '</p><button type="button" class="btn btn-geo" id="retry-btn">🔄 Tekrar dene</button></div>';""",
"""grid.innerHTML = '<div class="state-box">' + ICON.bolt + '<p>' + esc(x.j && x.j.error ? x.j.error : 'İşletmeler yüklenemedi.') + '</p><button type="button" class="btn btn-primary" id="retry-btn">Tekrar dene</button></div>';""", 1))

repls.append((
"""grid.innerHTML = '<div class="state-box"><span class="big" aria-hidden="true">📡</span><p>Bağlantı hatası — internetini kontrol edip tekrar dene.</p><button type="button" class="btn btn-geo" id="retry-btn">🔄 Tekrar dene</button></div>';""",
"""grid.innerHTML = '<div class="state-box">' + ICON.bolt + '<p>Bağlantı hatası — internetini kontrol edip tekrar dene.</p><button type="button" class="btn btn-primary" id="retry-btn">Tekrar dene</button></div>';""", 1))

# konum durum metinleri
repls.append((
"""locStatus.textContent = '😕 Tarayıcın konum desteği vermiyor — listeyi serbestçe inceleyebilirsin.';""",
"""locStatus.textContent = 'Tarayıcın konum desteği vermiyor — listeyi serbestçe inceleyebilirsin.';""", 1))
repls.append((
"""locStatus.innerHTML = '✅ En yakın işletme: <b>' + esc(nearest.name) + '</b> (' + esc(fmtKm(nearest._d)) + ') — haritada ⭐ ile işaretlendi.';""",
"""locStatus.innerHTML = 'En yakın işletme: <b>' + esc(nearest.name) + '</b> (' + esc(fmtKm(nearest._d)) + ') — haritada mavi pinle işaretlendi.';""", 1))
repls.append((
"""locStatus.textContent = '⚠ Konum izni alınamadı — listeyi serbestçe inceleyebilirsin.';""",
"""locStatus.textContent = 'Konum izni alınamadı — listeyi serbestçe inceleyebilirsin.';""", 1))

# ---------- DETAIL_JS ----------
repls.append((
"""el.textContent = open ? '🟢 Şu anda açık' : '🔴 Şu anda kapalı';""",
"""el.textContent = open ? 'Şu anda açık' : 'Şu anda kapalı';""", 1))
repls.append((
"""quickBtn.textContent = '⚡ İlk uygun saat: ' + (label || quickTime);""",
"""quickBtn.textContent = 'İlk uygun saat: ' + (label || quickTime);""", 1))
repls.append(("""btn.textContent = '✅ Randevuyu Onayla';""", """btn.textContent = 'Randevuyu Onayla';""", 2))
repls.append(("""btn.textContent = '⭐ Değerlendirmeyi Gönder';""", """btn.textContent = 'Değerlendirmeyi Gönder';""", 2))
repls.append(("""btn.textContent = '⏳ Bekleme Listesine Gir';""", """btn.textContent = 'Bekleme Listesine Gir';""", 2))
repls.append((
"""slotsEl.innerHTML = '<p class="hint">😴 Bu tarihte saat aralığı bulunamadı — işletme kapalı olabilir, başka bir gün dene.</p>';""",
"""slotsEl.innerHTML = '<p class="hint">Bu tarihte saat aralığı bulunamadı — işletme kapalı olabilir, başka bir gün dene.</p>';""", 1))
repls.append((
"""p.textContent = '🙏 Bu günün tüm saatleri dolu — lütfen başka bir tarih seç.';""",
"""p.textContent = 'Bu günün tüm saatleri dolu — lütfen başka bir tarih seç.';""", 1))
repls.append((
"""slotsEl.innerHTML = '<p class="hint">🔁 Tekrar planlama: <b>' + esc(rs.name || 'Hizmet') + '</b> seçili — tarih ve saat seç.</p>';""",
"""slotsEl.innerHTML = '<p class="hint">Tekrar planlama: <b>' + esc(rs.name || 'Hizmet') + '</b> seçili — tarih ve saat seç.</p>';""", 1))
repls.append((
"""note.textContent = '👤 ' + (m.name || '') + ' olarak randevu alıyorsun — üyeliksiz de devam edebilirsin.';""",
"""note.textContent = (m.name || '') + ' olarak randevu alıyorsun — üyeliksiz de devam edebilirsin.';""", 1))
repls.append((
"""btn.textContent = '👤 ' + String(x.j.member.name || '').trim().split(/\\s+/)[0];""",
"""btn.textContent = String(x.j.member.name || '').trim().split(/\\s+/)[0];""", 1))
repls.append((
"""$('#s-status').textContent = d.status === 'onaylandi' ? 'Onaylandı ✅'
        : d.status === 'beklemede' ? 'Onay bekliyor ⏳' : d.status;""",
"""$('#s-status').textContent = d.status === 'onaylandi' ? 'Onaylandı'
        : d.status === 'beklemede' ? 'Onay bekliyor' : d.status;""", 1))
repls.append((
"""toast('Randevun oluşturuldu! 🎉', 'ok');""", """toast('Randevun oluşturuldu!', 'ok');""", 1))
repls.append((
"""toast('Değerlendirmen alındı — teşekkürler! 🙏', 'ok');""",
"""toast('Değerlendirmen alındı — teşekkürler!', 'ok');""", 1))
repls.append((
"""toast('Bekleme listesine alındın! 🙏', 'ok');""",
"""toast('Bekleme listesine alındın!', 'ok');""", 1))
# detail harita pini: emoji yerine minimal daire
repls.append((
"""    var EMO = { berber: '💈', kuafor: '✂️', disci: '🦷', guzellik: '💄', spa: '🧖', dovme: '🎨' };
    var dMap = L.map('detail-map', { scrollWheelZoom: false });""",
"""    var dMap = L.map('detail-map', { scrollWheelZoom: false });""", 1))
repls.append((
"""    var dSize = [36, 36];
    var dIcon = L.divIcon({ className: '', html: '<div class="biz-pin" style="width:36px;height:36px;font-size:18px">' + (EMO[P.type] || '🏪') + '</div>', iconSize: dSize, iconAnchor: [18, 36], popupAnchor: [0, -42] });""",
"""    var dSize = [26, 26];
    var dIcon = L.divIcon({ className: '', html: '<div class="biz-pin"><span class="pin-dot"></span></div>', iconSize: dSize, iconAnchor: [13, 13], popupAnchor: [0, -19] });""", 1))

# ---------- MEMBER_JS ----------
repls.append((
"""document.getElementById('m-phone').textContent = '📞 ' + fmtPhone(member.phone);""",
"""document.getElementById('m-phone').textContent = fmtPhone(member.phone);""", 1))
repls.append((
"""if (member.email) { em.textContent = '✉️ ' + member.email; em.hidden = false; } else { em.hidden = true; }""",
"""if (member.email) { em.textContent = member.email; em.hidden = false; } else { em.hidden = true; }""", 1))
repls.append((
"""  var ST = {
    beklemede: { label: '⏳ Onay bekliyor', cls: 'st-beklemede' },
    onaylandi: { label: '✅ Onaylandı', cls: 'st-onaylandi' },
    tamamlandi: { label: '🏁 Tamamlandı', cls: 'st-tamamlandi' },
    gelmedi: { label: '💤 Gelmedi', cls: 'st-gelmedi' },
    iptal: { label: '🚫 İptal edildi', cls: 'st-iptal' }
  };""",
"""  var ST = {
    beklemede: { label: 'Onay bekliyor', cls: 'st-beklemede' },
    onaylandi: { label: 'Onaylandı', cls: 'st-onaylandi' },
    tamamlandi: { label: 'Tamamlandı', cls: 'st-tamamlandi' },
    gelmedi: { label: 'Gelmedi', cls: 'st-gelmedi' },
    iptal: { label: 'İptal edildi', cls: 'st-iptal' }
  };""", 1))
repls.append((
"""wrap.innerHTML = '<div class="mem-card empty-box">🎟️ Henüz damga kartın yok.<br>Damga programı olan işletmelerden hizmet aldıkça kartın burada birikir.</div>';""",
"""wrap.innerHTML = '<div class="mem-card empty-box">Henüz damga kartın yok.<br>Damga programı olan işletmelerden hizmet aldıkça kartın burada birikir.</div>';""", 1))
repls.append((
"""wrap.innerHTML = '<div class="mem-card empty-box">🎟️ Damga kartları şu anda alınamadı. <button type="button" class="btn btn-ghost" id="sc-retry" style="margin-top:8px">🔄 Tekrar dene</button></div>';""",
"""wrap.innerHTML = '<div class="mem-card empty-box">Damga kartları şu anda alınamadı. <button type="button" class="btn btn-ghost" id="sc-retry" style="margin-top:8px">Tekrar dene</button></div>';""", 2))
repls.append((
"""listEl.innerHTML = '<div class="mem-card empty-box">📡 ' + esc((x.j && x.j.error) || 'Randevular yüklenemedi.') + '<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">🔄 Tekrar dene</button></div>';""",
"""listEl.innerHTML = '<div class="mem-card empty-box">' + esc((x.j && x.j.error) || 'Randevular yüklenemedi.') + '<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">Tekrar dene</button></div>';""", 1))
repls.append((
"""listEl.innerHTML = '<div class="mem-card empty-box">📡 Bağlantı hatası — internetini kontrol et.<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">🔄 Tekrar dene</button></div>';""",
"""listEl.innerHTML = '<div class="mem-card empty-box">Bağlantı hatası — internetini kontrol et.<br><button type="button" class="btn btn-ghost" id="appt-retry" style="margin-top:10px">Tekrar dene</button></div>';""", 1))
repls.append((
"""listEl.innerHTML = '<div class="mem-card empty-box">📭 Henüz randevun yok.<br><span style="font-size:.85rem">Bir işletme seçip saniyeler içinde randevu alabilirsin.</span><br><a class="btn btn-geo" style="margin-top:12px" href="/">🏠 İşletmelere göz at</a></div>';""",
"""listEl.innerHTML = '<div class="mem-card empty-box">Henüz randevun yok.<br><span style="font-size:.85rem">Bir işletme seçip saniyeler içinde randevu alabilirsin.</span><br><a class="btn btn-primary" style="margin-top:12px" href="/">İşletmelere göz at</a></div>';""", 1))
repls.append((
"""        : '🎉 <b>Ödül hakkın doğdu!</b> Sıradaki ziyaretinde ' + esc(c.rewardDescription) + ' seni bekliyor.';""",
"""        : '<b>Ödül hakkın doğdu!</b> Sıradaki ziyaretinde ' + esc(c.rewardDescription) + ' seni bekliyor.';""", 1))
repls.append((
"""        (Number(c.redeemedCount) > 0 ? '<span class="sc-won">🏆 ' + c.redeemedCount + ' ödül kazandın</span>' : '') +""",
"""        (Number(c.redeemedCount) > 0 ? '<span class="sc-won">' + c.redeemedCount + ' ödül kazandın</span>' : '') +""", 1))
repls.append((
"""'<p class="sc-reward">🎯 ' + reward + '</p>' +""",
"""'<p class="sc-reward">' + reward + '</p>' +""", 1))
repls.append((
"""(it.staffName ? ' · 👤 ' + esc(it.staffName) : '')""",
"""(it.staffName ? ' · ' + esc(it.staffName) : '')""", 1))
repls.append((
"""'<div class="appt-when">📅 ' + esc(fmtWhen(it.date)) + (cancelledMode ? ' <span style="color:var(--muted);font-weight:400">(iptal edildi)</span>' : '') + '</div>' +""",
"""'<div class="appt-when">' + esc(fmtWhen(it.date)) + (cancelledMode ? ' <span style="color:var(--sub);font-weight:400">(iptal edildi)</span>' : '') + '</div>' +""", 1))
repls.append((
"""için yeni randevu al">🔁 Tekrar planla</button>';""",
"""için yeni randevu al">Tekrar planla</button>';""", 1))
repls.append((
"""randevusunu değerlendir">⭐ Değerlendir</button>'""",
"""randevusunu değerlendir">Değerlendir</button>'""", 1))
repls.append((
"""takvim dosyasını (.ics) indir">📅 Takvime ekle</a>'""",
"""takvim dosyasını (.ics) indir">Takvime ekle</a>'""", 1))
repls.append((
"""    var ST_WL = {
      waiting: { label: '⏳ Sıradasınız', cls: 'wl-st-waiting' },
      notified: { label: '📞 Aranacağınızı bildirdik', cls: 'wl-st-notified' },
      booked: { label: '✅ Randevunuz oluşturuldu', cls: 'wl-st-booked' }
    };""",
"""    var ST_WL = {
      waiting: { label: 'Sıradasınız', cls: 'wl-st-waiting' },
      notified: { label: 'Aranacağınızı bildirdik', cls: 'wl-st-notified' },
      booked: { label: 'Randevunuz oluşturuldu', cls: 'wl-st-booked' }
    };""", 1))
repls.append((
"""'<div class="wl-card-svc">' + esc(w.serviceName || 'Hizmet') + ' · 📅 ' + esc(fmtDay(w.preferredDate)) + (w.preferredSlot ? ' · ⏱ ' + esc(w.preferredSlot) : '') + '</div>' +""",
"""'<div class="wl-card-svc">' + esc(w.serviceName || 'Hizmet') + ' · ' + esc(fmtDay(w.preferredDate)) + (w.preferredSlot ? ' · ' + esc(w.preferredSlot) : '') + '</div>' +""", 1))
repls.append((
"""resEl.innerHTML = '<div class="mem-card empty-box">📭 Bu numaraya ait aktif bekleme kaydı yok.<br><span style="font-size:.85rem">Dolu bir slot için işletme sayfasındaki "⏳ Dolu mu? Bekleme listesine gir" ile listeye girebilirsin.</span></div>';""",
"""resEl.innerHTML = '<div class="mem-card empty-box">Bu numaraya ait aktif bekleme kaydı yok.<br><span style="font-size:.85rem">Dolu bir slot için işletme sayfasındaki "Dolu mu? Bekleme listesine gir" ile listeye girebilirsin.</span></div>';""", 1))
# var(--muted) → var(--sub) (JS üretimli HTML'lerde)
repls.append(("""color:var(--muted)""", """color:var(--sub)""", 2))
# setBusy etiketleri
repls.append(("""setBusy(btn, false, '🔑 Giriş Yap');""", """setBusy(btn, false, 'Giriş Yap');""", 2))
repls.append(("""setBusy(btn, false, '✨ Üye Ol');""", """setBusy(btn, false, 'Üye Ol');""", 2))
repls.append(("""setBusy(sendBtn, false, '⭐ Gönder');""", """setBusy(sendBtn, false, 'Gönder');""", 2))
repls.append(("""setBusy(delConfirm, false, '🗑️ Hesabımı Kalıcı Olarak Sil');""", """setBusy(delConfirm, false, 'Hesabımı Kalıcı Olarak Sil');""", 2))
# toast metinleri
repls.append((
"""toast('Hoş geldin, ' + (x.j.member.name || '') + '! 👋', 'ok');""",
"""toast('Hoş geldin, ' + (x.j.member.name || '') + '!', 'ok');""", 1))
repls.append(("""toast('Üyeliğin oluşturuldu! 🎉', 'ok');""", """toast('Üyeliğin oluşturuldu!', 'ok');""", 1))
repls.append(("""toast('Çıkış yapıldı. Görüşürüz! 👋', 'ok');""", """toast('Çıkış yapıldı. Görüşürüz!', 'ok');""", 1))
repls.append((
"""toast('Hesabın ve tüm randevuların kalıcı olarak silindi. İyi günler! 🌿', 'ok');""",
"""toast('Hesabın ve tüm randevuların kalıcı olarak silindi. İyi günler!', 'ok');""", 1))
repls.append((
"""toast('Teşekkürler! Değerlendirmen incelemeden sonra yayınlanacak. 🙏', 'ok');""",
"""toast('Teşekkürler! Değerlendirmen incelemeden sonra yayınlanacak.', 'ok');""", 1))
repls.append((
"""      toast(on
        ? '🔔 Hatırlatıcılar açıldı — randevudan 2 saat önce hatırlatma alırsın.'
        : '🔕 Hatırlatıcılar kapatıldı.', 'ok');""",
"""      toast(on
        ? 'Hatırlatıcılar açıldı — randevudan 2 saat önce hatırlatma alırsın.'
        : 'Hatırlatıcılar kapatıldı.', 'ok');""", 1))
repls.append((
"""toast('Randevu iptal edildi. Tekrar planlamak ister misin? 🔁', 'ok');""",
"""toast('Randevu iptal edildi. Tekrar planlamak ister misin?', 'ok');""", 1))

errors = []
for old, new, minc in repls:
    n = src.count(old)
    if n < minc:
        errors.append(f'BULUNAMADI ({n}/{minc}): {old[:90]!r}')
        continue
    src = src.replace(old, new)

if errors:
    print('HATALAR:')
    for e in errors:
        print(' -', e)
    sys.exit(1)

open(path, 'w', encoding='utf-8').write(src)
print(f'Tüm değişimler uygulandı ({len(repls)} blok).')
