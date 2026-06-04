/* Gezi Pro — kategori yerleri (alttan sheet).
   Pano'da bir kategori kartına dokununca açılır: o kategorideki fotoğrafların
   küçük resim grid'i. Bir fotoğrafa dokununca mevcut detay sheet'i açılır.
   'photos' state'ini dinler — foto silinir/kategori değişirse grid tazelenir. */

import { getState, subscribe } from '../state.js';
import { catOf } from '../categories.js';
import { placeMatches } from '../utils/search.js';
import { coverThumb } from '../utils/place.js';
import { openDetailSheet } from './sheet.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let _el = null;
let _unsub = null;
let _key = null;
let _query = '';   // Pano'dan aktarılan arama (boşsa kategorinin tüm yerleri)

function ensureRoot() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.className = 'sheet-backdrop';
  _el.style.display = 'none';
  _el.addEventListener('click', (e) => { if (e.target === _el) close(); });
  document.body.appendChild(_el);
  return _el;
}

/** O kategoriye düşen fotoğraflar (bilinmeyen anahtar catOf ile 'diger'e folder);
    aktif arama varsa ona göre de süzülür. */
function photosOf(key) {
  return (getState('photos') || [])
    .filter(p => catOf(p.category).key === key && placeMatches(p, _query));
}

function renderGrid() {
  const grid = _el?.querySelector('#csGrid');
  const countEl = _el?.querySelector('#csCount');
  if (!grid) return;
  const photos = photosOf(_key);
  if (countEl) countEl.textContent = `${photos.length} yer`;

  if (!photos.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂️</div>
      <h3>Bu kategoride yer yok</h3></div>`;
    return;
  }
  grid.innerHTML = photos.map(p => {
    const t = esc(p.title) || 'Fotoğraf';
    const cover = coverThumb(p);
    return `
      <button class="gallery-cell" data-id="${p.id}" aria-label="${t}">
        ${cover
          ? `<img src="${cover}" alt="${t}" loading="lazy">`
          : `<span class="gallery-cell--empty">🏞️</span>`}
        ${Number.isFinite(p.lat) ? `<span class="gallery-pin">📍</span>` : ''}
      </button>`;
  }).join('');

  grid.querySelectorAll('.gallery-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const photo = (getState('photos') || []).find(x => x.id === cell.dataset.id);
      if (photo) openDetailSheet(photo);   // detay sheet üstte açılır
    });
  });
}

export function openCategorySheet(key, query = '') {
  const root = ensureRoot();
  _key = key;
  _query = query;
  const cat = catOf(key);

  root.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(cat.label)} yerleri">
      <div class="sheet-handle"></div>
      <div class="sheet-body">
        <h2 class="sheet-title">
          <span class="cat-badge cat-badge--inline" style="background:${cat.color};color:${cat.fg}">${cat.emoji}</span>
          ${esc(cat.label)}
          <span class="cs-count" id="csCount"></span>
        </h2>
        <div id="csGrid" class="gallery-grid cs-grid"></div>
        <button class="btn btn-ghost btn-full" id="csClose">Kapat</button>
      </div>
    </div>
  `;
  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('open'));

  renderGrid();
  root.querySelector('#csClose').addEventListener('click', close);

  _unsub?.();
  _unsub = subscribe('photos', () => renderGrid());
}

function close() {
  _unsub?.(); _unsub = null;
  _key = null; _query = '';
  if (!_el) return;
  _el.classList.remove('open');
  setTimeout(() => { if (_el) { _el.style.display = 'none'; _el.innerHTML = ''; } }, 220);
}
