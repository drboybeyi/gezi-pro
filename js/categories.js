/* Gezi Pro — kategori tanımları (tek kaynak).
   Renkler Defter 360 toprak paletinden; harita iğnesi + galeri rozeti +
   form/sheet seçici hepsi buradan beslenir. Anahtarlar ASCII (depolama
   güvenliği), etiketler Türkçe (gösterim). */

export const DEFAULT_CATEGORY = 'diger';

export const CATEGORIES = [
  { key: 'kahveci',   label: 'Kahveci',   emoji: '☕',  color: '#6f4e37', fg: '#ffffff' }, // kahve
  { key: 'restoran',  label: 'Restoran',  emoji: '🍽️', color: '#9a4a3a', fg: '#ffffff' }, // kiremit (danger)
  { key: 'manzara',   label: 'Manzara',   emoji: '🏞️', color: '#5a7a3a', fg: '#ffffff' }, // zeytin (success)
  { key: 'muze',      label: 'Müze',      emoji: '🏛️', color: '#4f6d8a', fg: '#ffffff' }, // mat arduvaz mavi
  { key: 'otel',      label: 'Otel',      emoji: '🛏️', color: '#c9923c', fg: '#3d2817' }, // okra (warning)
  { key: 'alisveris', label: 'Alışveriş', emoji: '🛍️', color: '#9c6079', fg: '#ffffff' }, // tozlu erik
  { key: 'diger',     label: 'Diğer',     emoji: '📍',  color: '#6b6258', fg: '#ffffff' }, // nötr taupe
];

const MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

/** Anahtardan kategori objesi; bilinmeyen/eski kayıt -> 'diğer'. */
export function catOf(key) {
  return MAP[key] || MAP[DEFAULT_CATEGORY];
}
