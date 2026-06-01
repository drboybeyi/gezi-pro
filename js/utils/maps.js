/* Gezi Pro — harici harita / yol tarifi linkleri.
   Detay sheet'inde kullanılır. Platform tespiti ile Apple Maps (iOS)
   veya Google Maps tercih edilir; her ikisinin linki de üretilir. */

export function googleMapsDirections(lat, lng /*, label */) {
  // label Google'ın dir API'sinde koordinatla birlikte kullanılmıyor; sade tut.
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function googleMapsPlace(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function appleMapsDirections(lat, lng, label = '') {
  // maps:// uygulamayı açar; https://maps.apple.com web fallback.
  const name = label ? `&q=${encodeURIComponent(label)}` : '';
  return `https://maps.apple.com/?daddr=${lat},${lng}${name}&dirflg=d`;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Platforma göre tercih edilen tek "Yol tarifi" linki. */
export function preferredDirections(lat, lng, label = '') {
  return isIOS()
    ? appleMapsDirections(lat, lng, label)
    : googleMapsDirections(lat, lng, label);
}
