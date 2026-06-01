/* Gezi Pro — EXIF GPS okuma. SPRINT 2 (foto ekleme akışında kullanılacak).
   Plan: exif-js ile fotoğraftan GPS (lat/lng) çıkar; yoksa cihaz konumu
   (navigator.geolocation) fallback. Sprint 1 yalnızca imza/iskelet. */

/**
 * Fotoğraf File/Blob'undan EXIF GPS koordinatı çıkarır.
 * @returns {Promise<{lat:number, lng:number}|null>}
 */
export async function readExifGps(/* file */) {
  // TODO(sprint2): exif-js (EXIF.getData / EXIF.getAllTags) ile
  // GPSLatitude/GPSLongitude + ref'ten ondalık koordinata çevir.
  return null;
}

/**
 * EXIF yoksa cihaz konumu fallback.
 * @returns {Promise<{lat:number, lng:number}|null>}
 */
export function getDeviceLocation(options = { enableHighAccuracy: true, timeout: 8000 }) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => resolve(null),
      options
    );
  });
}
