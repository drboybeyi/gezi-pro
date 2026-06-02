/* Gezi Pro — ortak yer-arama yardımcıları.
   Galeri, Pano ve kategori sheet'i aynı eşleşme kuralını kullanır:
   başlık + not + kategori adı, Türkçe-duyarlı küçük harf. */

import { catOf } from '../categories.js';

/** Sorguyu normalize et (Türkçe küçük harf + trim). */
export const normQuery = (s = '') => String(s).toLocaleLowerCase('tr').trim();

/** Bir fotoğraf normalize edilmiş sorguyla eşleşiyor mu? */
export function placeMatches(p, q) {
  if (!q) return true;
  const hay = `${p.title || ''} ${p.note || ''} ${catOf(p.category).label}`;
  return normQuery(hay).includes(q);
}
