/* Gezi Pro — EXIF okuma + cihaz konumu fallback.
   Foto ekleme akışında (photos.js) kullanılır. Zaman aşımları photos.js'te
   uygulanır; burada hiçbir çağrı sessizce yutulmaz — her hata loglanır. */

/** DMS [derece, dakika, saniye] + yön referansı -> ondalık derece. (pure) */
export function dmsToDecimal(dms, ref) {
  if (!dms || dms.length < 3) return null;
  let dec = Number(dms[0]) + Number(dms[1]) / 60 + Number(dms[2]) / 3600;
  if (ref === 'S' || ref === 'W') dec = -dec;
  return dec;
}

/** EXIF "YYYY:MM:DD HH:MM:SS" -> epoch ms (yoksa null). (pure) */
export function parseExifDate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/**
 * Fotoğraf File/Blob'undan EXIF GPS + çekim tarihi çıkarır.
 * NOT: exif-js'in callback'i bazı dosyalarda hiç tetiklenmeyebilir;
 *      bu yüzden çağıran taraf (photos.js) ayrıca zaman aşımı uygular.
 * @returns {Promise<{lat:number|null, lng:number|null, takenAt:number|null}>}
 */
export function readExif(file) {
  const EMPTY = { lat: null, lng: null, takenAt: null };
  return new Promise((resolve) => {
    if (typeof EXIF === 'undefined') {
      console.warn('[exif] exif-js yüklenmedi (global EXIF yok) — konum/tarih atlanıyor');
      return resolve(EMPTY);
    }
    try {
      EXIF.getData(file, function () {
        try {
          const lat    = EXIF.getTag(this, 'GPSLatitude');
          const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
          const lng    = EXIF.getTag(this, 'GPSLongitude');
          const lngRef = EXIF.getTag(this, 'GPSLongitudeRef');
          const date   = EXIF.getTag(this, 'DateTimeOriginal') || EXIF.getTag(this, 'DateTime');
          const out = {
            lat: lat ? dmsToDecimal(lat, latRef) : null,
            lng: lng ? dmsToDecimal(lng, lngRef) : null,
            takenAt: parseExifDate(date),
          };
          console.log(`[exif] okundu: GPS=${out.lat != null ? `${out.lat.toFixed(5)},${out.lng.toFixed(5)}` : 'yok'} `
            + `tarih=${out.takenAt ? new Date(out.takenAt).toISOString() : 'yok'}`);
          resolve(out);
        } catch (e) {
          console.warn('[exif] tag parse hatası:', e);
          resolve(EMPTY);
        }
      });
    } catch (e) {
      console.warn('[exif] EXIF.getData hatası:', e);
      resolve(EMPTY);
    }
  });
}

const GEO_ERR = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

/**
 * Cihaz konumu (geolocation). Hata callback'i DAİMA yakalanır ve loglanır.
 * @returns {Promise<{lat:number,lng:number} | {error:string}>}
 */
export function getDeviceLocation(timeout = 8000) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      console.warn('[geo] navigator.geolocation yok');
      return resolve({ error: 'unsupported' });
    }
    console.log(`[geo] getCurrentPosition çağrılıyor (timeout=${timeout}ms)…`);
    let settled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        settled = true;
        console.log(`[geo] başarı: ${pos.coords.latitude}, ${pos.coords.longitude}`);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        settled = true;
        const kind = GEO_ERR[err.code] || 'unknown';
        console.warn(`[geo] HATA code=${err.code} (${kind}) msg=${err.message}`);
        resolve({ error: kind });
      },
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
    // Tarayıcı option.timeout'u yok sayarsa diye iç güvenlik ağı:
    setTimeout(() => {
      if (!settled) console.warn(`[geo] ${timeout + 500}ms içinde callback gelmedi (iç güvenlik ağı)`);
    }, timeout + 500);
  });
}
