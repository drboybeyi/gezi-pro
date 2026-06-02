/* Gezi Pro — kullanıcı yönetimli kategoriler.
   Tek kaynak IndexedDB'dir (store: 'categories'); bu modül onu bir
   senkron bellek-cache'ine hidrate eder. Render yolları (galeri rozeti,
   harita iğnesi, form/sheet seçici) catOf()/getCategories()'i SENKRON çağırır
   — bu yüzden boot'ta bir kez loadCategories() ile cache doldurulur.

   Veri modeli (kayıt başına):
     { key, label, color, fg, emoji, order, builtin? }
   - key   : ASCII slug (depolama güvenliği), benzersiz
   - label : Türkçe gösterim adı
   - color : '#rrggbb' arka plan (rozet/iğne)
   - fg    : metin/emoji rengi (color'dan kontrastla türetilir)
   - emoji : rozet glyph'i; kullanıcı kategorilerinde label baş harfi
   - order : sıralama (DEFAULT_CATEGORY her zaman en sonda)

   Firebase YOK — tamamen local. */

import {
  getAllCategories, bulkPutCategories, putCategory,
  deleteCategoryRecord, reassignPhotosCategory, getAllPhotos,
} from './idb.js';
import { setState, getState } from './state.js';
import { onCategoryChanged, onCategoryDeleted, onPhotoChanged } from './sync-hooks.js';

export const DEFAULT_CATEGORY = 'diger';

/* İlk açılış tohumu — kullanıcının istediği başlangıç seti.
   Renk/emoji Defter 360 toprak paletinden. order: diger daima en sonda. */
const SEED = [
  { key: 'kahveci',  label: 'Kahveci',  emoji: '☕',  color: '#6f4e37', fg: '#ffffff', order: 10, builtin: true },
  { key: 'restoran', label: 'Restoran', emoji: '🍽️', color: '#9a4a3a', fg: '#ffffff', order: 20, builtin: true },
  { key: 'manzara',  label: 'Manzara',  emoji: '🏞️', color: '#5a7a3a', fg: '#ffffff', order: 30, builtin: true },
  { key: 'muze',     label: 'Müze',     emoji: '🏛️', color: '#4f6d8a', fg: '#ffffff', order: 40, builtin: true },
  { key: 'otel',     label: 'Otel',     emoji: '🛏️', color: '#c9923c', fg: '#3d2817', order: 50, builtin: true },
  { key: 'diger',    label: 'Diğer',    emoji: '📍',  color: '#6b6258', fg: '#ffffff', order: 999, builtin: true },
];

// Hard fallback: cache henüz yüklenmeden çağrılırsa 'diğer' bilinsin.
const FALLBACK = SEED.find(c => c.key === DEFAULT_CATEGORY);

let _list = SEED.slice();                     // senkron cache (boot'ta IDB'den dolar)
let _map  = mapOf(_list);

function mapOf(list) { return Object.fromEntries(list.map(c => [c.key, c])); }
function bySortOrder(a, b) { return (a.order ?? 500) - (b.order ?? 500) || a.label.localeCompare(b.label, 'tr'); }

function setCache(list) {
  _list = list.slice().sort(bySortOrder);
  _map  = mapOf(_list);
  setState('categories', _list);
}

/** Renge göre okunur metin rengi (basit luminans eşiği). */
export function fgFor(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.62 ? '#3d2817' : '#ffffff';
}

/** Label baş harfinden glyph (kullanıcı kategorileri emoji girmez). */
function glyphFor(label) {
  const ch = (label || '').trim().charAt(0);
  return ch ? ch.toLocaleUpperCase('tr') : '📍';
}

/** Label -> benzersiz ASCII slug. Çakışırsa -2, -3… ekler. */
function slugify(label) {
  const tr = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
               'İ': 'i', 'Ç': 'c', 'Ğ': 'g', 'Ö': 'o', 'Ş': 's', 'Ü': 'u' };
  let base = String(label || '')
    .replace(/[çğıöşüİÇĞÖŞÜ]/g, m => tr[m] || m)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) base = 'kategori';
  let key = base, n = 2;
  while (_map[key]) key = `${base}-${n++}`;
  return key;
}

// ---- Okuma (senkron cache) ----

/** Tüm kategoriler (sıralı). DEFAULT_CATEGORY her zaman en sonda. */
export function getCategories() { return _list; }

/** Anahtardan kategori objesi; bilinmeyen/eski kayıt -> 'diğer'. */
export function catOf(key) {
  return _map[key] || _map[DEFAULT_CATEGORY] || FALLBACK;
}

// ---- Yükleme / tohumlama ----

/** Boot'ta bir kez: IDB'den oku; store boşsa varsayılanları tohumla. */
export async function loadCategories() {
  let rows = await getAllCategories();
  if (!rows.length) {
    await bulkPutCategories(SEED);
    rows = SEED.slice();
  }
  // Eski kayıtlarda eksik alanları tamamla (emoji/fg her zaman dolu olsun).
  rows = rows.map(c => ({
    ...c,
    emoji: c.emoji || glyphFor(c.label),
    fg:    c.fg || fgFor(c.color),
  }));
  setCache(rows);
  return _list;
}

// ---- Mutasyonlar (IDB + cache + state) ----

/** Galeri/harita rozet renkleri kategori değişince yenilensin diye
    'photos' state'ini yeniden yayınla (içerik aynı, abone repaint eder). */
function repaintPhotos() {
  setState('photos', getState('photos') || []);
}

/** Yeni kategori ekle. @returns {object} eklenen kayıt. */
export async function addCategory({ label, color }) {
  const name = String(label || '').trim();
  if (!name) throw new Error('İsim boş olamaz');
  const col = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6b6258';
  const maxOrder = Math.max(0, ..._list.filter(c => c.key !== DEFAULT_CATEGORY).map(c => c.order ?? 0));
  const cat = {
    key: slugify(name),
    label: name,
    color: col,
    fg: fgFor(col),
    emoji: glyphFor(name),
    order: maxOrder + 10,
    builtin: false,
    updatedAt: Date.now(),
  };
  await putCategory(cat);
  setCache([..._list, cat]);
  onCategoryChanged(cat);                 // giriş varsa buluta push (yoksa no-op)
  return cat;
}

/** Var olan kategoriyi düzenle (isim ve/veya renk). Anahtar değişmez. */
export async function updateCategory(key, { label, color } = {}) {
  const cur = _map[key];
  if (!cur) throw new Error('Kategori bulunamadı');
  const next = { ...cur };
  if (label != null) {
    const name = String(label).trim();
    if (!name) throw new Error('İsim boş olamaz');
    next.label = name;
    // Kullanıcı kategorisinin glyph'i isimden türer; builtin emoji'ye dokunma.
    if (!cur.builtin) next.emoji = glyphFor(name);
  }
  if (color != null && /^#[0-9a-fA-F]{6}$/.test(color)) {
    next.color = color;
    next.fg = fgFor(color);
  }
  next.updatedAt = Date.now();
  await putCategory(next);
  setCache(_list.map(c => (c.key === key ? next : c)));
  repaintPhotos();
  onCategoryChanged(next);
  return next;
}

/** Kategoriyi sil; ondaki fotoğrafları 'Diğer'e taşı.
    DEFAULT_CATEGORY silinemez. @returns {number} taşınan foto sayısı. */
export async function deleteCategory(key) {
  if (key === DEFAULT_CATEGORY) throw new Error('"Diğer" silinemez');
  if (!_map[key]) throw new Error('Kategori bulunamadı');
  const movedRecs = await reassignPhotosCategory(key, DEFAULT_CATEGORY);
  await deleteCategoryRecord(key);
  setCache(_list.filter(c => c.key !== key));
  // Taşınan fotoğraflar görünür olsun diye photos state'ini IDB'den tazele.
  setState('photos', await getAllPhotos());
  // Buluta: kategori tombstone'u + taşınan fotoğrafların yeni kategorisi.
  onCategoryDeleted(key);
  movedRecs.forEach(r => onPhotoChanged(r));
  return movedRecs.length;
}
