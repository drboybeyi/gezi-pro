/* Gezi Pro — EXIF okuma + cihaz konumu fallback.
   Foto ekleme akışında (photos.js) kullanılır.
   exif-js, index.html'de CDN'den global `EXIF` olarak yüklenir. */

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
 * @returns {Promise<{lat:number|null, lng:number|null, takenAt:number|null}>}
 */
export function readExif(file) {
  return new Promise((resolve) => {
    if (typeof EXIF === 'undefined') return resolve({ lat: null, lng: null, takenAt: null });
    EXIF.getData(file, function () {
      const lat    = EXIF.getTag(this, 'GPSLatitude');
      const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
      const lng    = EXIF.getTag(this, 'GPSLongitude');
      const lngRef = EXIF.getTag(this, 'GPSLongitudeRef');
      const date   = EXIF.getTag(this, 'DateTimeOriginal') || EXIF.getTag(this, 'DateTime');
      resolve({
        lat: lat ? dmsToDecimal(lat, latRef) : null,
        lng: lng ? dmsToDecimal(lng, lngRef) : null,
        takenAt: parseExifDate(date),
      });
    });
  });
}

/**
 * EXIF konumu yoksa cihaz konumu fallback.
 * @returns {Promise<{lat:number, lng:number}|null>}
 */
export function getDeviceLocation(options = { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => resolve(null),
      options
    );
  });
}
