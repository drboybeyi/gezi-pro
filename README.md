# Gezi Pro

Gezdiğin yerleri fotoğraflarla ve haritada toplayan, kurulabilir (installable) bir PWA.

- **Stack:** Vanilla JS (ES modules), Firebase Auth + Realtime DB (europe-west1) + Storage (europe-west3), Leaflet, exif-js
- **Mimari:** Offline-first — IndexedDB *source-of-truth*, Firebase senkron katmanı
- **Yayın:** GitHub Pages → `drboybeyi.github.io/gezi-pro`

## Modül yapısı

```
index.html              Uygulama kabuğu (header / galeri-harita / nav / FAB) + Leaflet CDN
manifest.json           PWA manifesti
service-worker.js       Offline kabuk önbelleği (precache + SWR)
assets/icon.svg         Uygulama ikonu
css/style.css           Tasarım sistemi
js/
  app.js                Bootstrap: auth akışı, router, nav, SW kaydı
  firebase-config.js    Firebase init + Auth yardımcıları (TODO: gerçek config)
  state.js              Basit reaktif state deposu (pub/sub)
  idb.js                IndexedDB source-of-truth (photos store) — CRUD
  db.js                 Firebase senkron katmanı (İSKELET — sprint 2)
  components/
    toast.js            Toast bildirimleri
    sheet.js            Detay alt-sheet'i + Google/Apple Maps yol tarifi
  views/
    login.js            E-posta/şifre giriş & kayıt
    galeri.js           Galeri grid + boş durum
    harita.js           Leaflet harita + pin'ler
  utils/
    maps.js             Google/Apple Maps link üreticileri
    exif.js             EXIF GPS okuma + cihaz konumu fallback (İSKELET — sprint 2)
    thumbnail.js        Thumbnail üretimi (İSKELET — sprint 2)
```

## Sprint durumu

**Sprint 1 (tamamlandı) — iskelet:**
- [x] Modül yapısı
- [x] Firebase config + Auth bağlantısı
- [x] Boş galeri / harita render
- [x] manifest + service worker

**Sprint 2 (sıradaki):** Fotoğraf ekleme (EXIF GPS → cihaz konumu fallback), thumbnail üretimi, IndexedDB ⇄ Firebase çift yönlü senkron, Storage'a foto yükleme.

## Yerel çalıştırma

ES module + service worker `file://` ile çalışmaz; yerel sunucu gerekir:

```bash
cd gezi-pro
python -m http.server 8080
# veya: npx serve .
```

Sonra `http://localhost:8080` aç.

> **Not:** `js/firebase-config.js` içindeki değerler şu an PLACEHOLDER. Auth/DB'nin çalışması için Firebase Console > Project Settings'ten alınan gerçek config ile değiştir.
