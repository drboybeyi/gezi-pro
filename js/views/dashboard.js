/* Gezi Pro — Pano sekmesi (kategori kırılımı).
   Her kategori için yer sayısını gösteren kartlar. Bir karta dokununca
   o kategorideki yerler alttan sheet'te açılır (bkz. categorySheet.js).
   'photos' (sayılar) ve 'categories' (ad/renk/yeni kategori) state'lerini dinler. */

import { getState, subscribe } from '../state.js';
import { getCategories, catOf } from '../categories.js';
import { openCategorySheet } from '../components/categorySheet.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** key -> yer sayısı (bilinmeyen anahtar catOf ile 'diger'e folder). */
function countsByCategory(photos) {
  const counts = {};
  (photos || []).forEach(p => {
    const k = catOf(p.category).key;
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

export class DashboardView {
  constructor() {
    this._unsubPhotos = null;
    this._unsubCats = null;
  }

  render() {
    return `
      <section class="view view-pano">
        <div id="panoList" class="pano-list"></div>
      </section>
    `;
  }

  afterRender() {
    this._renderCards();
    this._unsubPhotos = subscribe('photos', () => this._renderCards());
    this._unsubCats   = subscribe('categories', () => this._renderCards());
  }

  destroy() {
    this._unsubPhotos?.();
    this._unsubCats?.();
  }

  _renderCards() {
    const list = document.getElementById('panoList');
    if (!list) return;

    const photos = getState('photos') || [];
    const counts = countsByCategory(photos);

    if (!photos.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🗂️</div>
          <h3>Henüz yer yok</h3>
          <p>Foto ekledikçe kategori kırılımı burada görünecek.</p>
        </div>`;
      return;
    }

    list.innerHTML = getCategories().map(c => {
      const n = counts[c.key] || 0;
      const empty = n === 0;
      return `
      <button class="pano-card${empty ? ' pano-card--empty' : ''}"
              data-key="${c.key}" ${empty ? 'disabled' : ''}
              aria-label="${esc(c.label)} — ${n} yer">
        <span class="cat-badge cat-badge--inline" style="background:${c.color};color:${c.fg}">${c.emoji}</span>
        <span class="pano-name">${esc(c.label)}</span>
        <span class="pano-count">${n}</span>
      </button>`;
    }).join('');

    list.querySelectorAll('.pano-card:not([disabled])').forEach(card => {
      card.addEventListener('click', () => openCategorySheet(card.dataset.key));
    });
  }
}
