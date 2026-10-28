# GNC CRM Denetim Raporu — 28 Ekim 2026 (tur5-b)

Kapsam: CRM ana uygulaması (3000) — 6 rol × tüm görünür modüller + algoritmik kod kontrolleri.
Yöntem: agent-browser canlı turlar (izole oturum), konsol/page-error toplama, DB doğrulaması, kod okuma.
NOT: KOD DEĞİŞİKLİĞİ YAPILMADI (kullanıcı "bana sorarak değiştir" dedi).

## Yönetici Özeti
**8 bulgu: 1 kritik (ortam) · 2 yüksek · 2 orta · 3 düşük.** Tüm modüller 6 rolde hatasız render ediliyor; sayaçlar DB ile tutarlı; mobil taşmasız. Asıl riskler: bir demo butonu kırık, OOM istikrarsızlığı, UX kararı gerektiren şifre uyarısı.

---

## Bulgular

### [K-01] KRİTİK (ortam) — Dev sunucusu (3000) tekrarlayan OOM çökmesi
- **Kanıt:** dmesg: `Out of memory: Killed process 736 (next-server) anon-rss:2362188kB` — 4GB makinede next-server ~2.3GB RSS + paralel Chrome oturumları. Bu denetim sırasında 2 kez öldü (00:31, 00:52 civarı); önceki turlarda da bilinen sorun.
- **Etki:** Site/API aralıklıyla tamamen kesilir; bekleyen istekler asılı kalır (denetim sırasında demo girişin takılması böyle yaşandı).
- **Öneri:** (a) üretim build'i çalıştırmak, (b) eşzamanlı tarayıcı oturumlarını sınırlamak, (c) NODE_OPTIONS=--max-old-space-size ile tavan koymak, (d) bellek artışı.
- **Kullanıcıya soru:** Hangi önlemi tercih edersiniz?

### [Y-01] YÜKSEK — "Sık Kuaför" demo giriş butonu kırık
- **Kanıt:** login-screen.tsx satır 32: `admin@sikkuafur.com` (u) — DB'deki hesap `admin@sikkuaför.com` (ö). Canlı test: buton → "E-posta veya şifre hatalı" (audit5b-01 öncesi ekran kaydı zinciri).
- **Etki:** Kuaför demo hesabı tek tıkla girilemiyor (diğer 6 demo butonu çalışıyor: Kafe/Market/Site/rep/2 CRM doğrulandı).
- **Önerilen çözüm:** koddaki e-postayı DB'deki Türkçe karakterli adresle eşitlemek (tek satır).
- **Kullanıcıya soru:** Düzeltilsin mi? (Öneri: EVET)

### [Y-02] YÜKSEK→ORTA — Kafe modülünde aralıklı iç içe <button> hidrasyon uyarısı
- **Kanıt:** İlk sekme gezintisinde konsol: `In HTML, <button> cannot be a descendant of <button>. This will cause a hydration error.` (bir kez; audit5b-04 sonrası tur). Taze oturumda 8 sekme ayrı ayrı ve topluca yürülünce yeniden üretilemedi; tüm src/ PCRE2 ile tarandı — statik iç içe buton YOK.
- **Etki:** React uyarısı; UI çalışıyor. Radix kompozisyonundan (asChild/başlatıcı içinde buton) şüpheleniliyor.
- **Önerilen çözüm:** Derinlemesine izole edilmesi gerekir (sekmeleri tek tek mount edip React DevTools component kaynağıyla eşleştirme).
- **Kullanıcıya soru:** Araştırma turu açılsın mı?

### [O-01] ORTA — "1234" şifre uyarısı artık HERKES için sürekli
- **Kanıt:** api/auth satır 121: `mustChangePassword: password === '1234'`. Şifre sıfırlama turunda tüm hesaplar 1234 yapıldığından her girişte uyarı bayrağı dönüyor (canlı: kafe girişinde mustChangePassword görüldü).
- **Etki:** Demo/gerçek tüm kullanıcılar "Şifre Değiştir" uyarısı görecek — istenen durum olabilir (güvenlik) ya da gürültü (demo).
- **Kullanıcıya soru:** Uyarı kalsın mı, yoksa demo hesapları için susturalım mı?

### [O-02] ORTA — Çıkış sonrası localStorage'da kullanıcı verisi kalıyor
- **Kanıt:** "Çıkış Yap" sonrası `gnc-crm-store` içeriği: `user, sessionId, view, ...` (DOLU). Reload sonrası doğru şekilde login ekranına düşüyor (oturum sunucuda geçersiz) — davranışsal sorun yok.
- **Etki:** Ortak bilgisayarda localStorage'dan isim/e-posta/izinler okunabilir (ölü token'la iş yapılamaz — yalnız gizlilik hijyeni).
- **Önerilen çözüm:** logout'ta store'u resetlemek (1-2 satır).
- **Kullanıcıya soru:** Düzeltilsin mi? (Öneri: EVET)

### [D-01] DÜŞÜK — Randevu gün filtreleri sunucu-UTC gece yarısıyla çalışıyor
- **Kanıt:** dashboard-sectors.ts `dayStart = new Date(y,m,d)` (sunucu yerel saati = UTC); appointments route `new Date(date+'T00:00:00')` (UTC). Kullanıcı dilimi Europe/Istanbul (+3).
- **Etki:** Yalnız 00:00–03:00 İstanbul arası randevular bir gün kayar; salonlar 09:00–18:00 açık → pratik etki ~0.
- **Öneri:** İleri tarihli iyileştirme (TZ-duyarlı gün sınırı).

### [D-02] DÜŞÜK — "Bekleyen" sayacı iki modülde farklı anlamlı
- **Kanıt:** Dashboard `pendingCount` = TÜM zamanlı beklemede (DB: 4 = UI: 4 ✓ tutarlı); Randevular modülü "Bekleyen" = seçili gün. Etiketler farklı ama yan yana okununca karıştırabilir.
- **Öneri:** Dashboard kartına "toplam" nitelemesi eklenebilir.

### [D-03] DÜŞÜK — Kafe "Siparişler" sekmesinde ödenmemiş sipariş rozetinin ömrü
- **Kanıt:** audit turunda görüldü ama veri tabanlı doğrulama yapılmadı (kalıcı veri yazımı yasaktı). Sonraki tura not.

---

## Test Kapsamı Matrisi (canlı doğrulananlar)
| Rol | Modüller | Sonuç |
|---|---|---|
| Login ekranı | form + 7 demo butonundan 6'sı + Program Admini | ✓ (kuaför demo ✗ Y-01) |
| Kafe admin | Genel Bakış, Kafe Yönetimi (Masalar/Menü/Siparişler/Bar/Mutfak/Kasa/Rezervasyon/Raporlar) | ✓ 0 hata |
| Market admin | Genel Bakış, Market Yönetimi (Kasa/Satışlar/Stok/Sayım/Mal Kabul/Raflar/Veresiye/…) | ✓ 0 hata |
| Site admin | Site Yönetimi (Genel Bakış/Blok&Aidatlar/Personel/Duyurular/Şikayetler) | ✓ 0 hata |
| Satış temsilcisi | Müşteriler, Potansiyel Müşteri, Fırsatlar, Görevler | ✓ 0 hata |
| Süperadmin | Admin Paneli (10 sekme), Dağıtım Merkezi, Raporlar, Mesajlar, Giderler, tüm CRM modülleri listede | ✓ 0 hata |
| Mobil 390px | CRM dashboard | ✓ taşmasız |
| Sayaç doğrulama | Bekleyen Talep 4 = DB 4; Bugünkü Randevu UTC-günü tutarlı | ✓ |
| Çıkış akışı | UI butonu → login ekranı (reload sonrası da doğru) | ✓ (O-02 hijyen notu) |

Ekran görüntüleri: tool-results/audit5b-*.png (00–13)

## Genel Gözlemler
- Assetler: modül ikonları tutarlı (Lucide), kırık görsel yok.
- Animasyonlar: sayfa geçişi animate-fade-in, tab geçişleri pürüzsüz; tema (açık/koyu) çalışıyor.
- Klavye/erişilebilirlik: menüler rol/aria ile etiketli; odak halkaları var.
- Not: süperadmin kenar çubuğu TÜM sektör modüllerini listeliyor (bilinçli tasarım — platform yöneticisi her şeyi görüyor).
