/* Gezi Pro — Pano sekmesi (kategori kırılımı).
   Her kategori için yer sayısını gösteren kartlar + üstte arama çubuğu.
   Arama YER arar (başlık/not/kategori); kartlar eşleşen yer sayılarını
   gösterir, eşleşmeyen kategoriler gizlenir. Karta dokununca o kategorinin
   (varsa aramayla süzülmüş) yerleri alttan sheet'te açılır.
   'photos' (sayılar) ve 'categories' (ad/renk/yeni kategori) state'lerini dinler. */

import { getState, subscribe } from '../state.js';
import { getCategories, catOf } from '../categories.js';
import { normQuery, placeMatches } from '../utils/search.js';
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
    this._query = '';
  }

  render() {
    return `
      <section class="view view-pano">
        <div class="search-bar" id="panoSearchBar">
          <span class="search-ico" aria-hidden="true">🔍</span>
          <input type="search" id="panoSearch" class="search-input"
                 placeholder="Ara — başlık, not, kategori"
                 autocomplete="off" autocapitalize="none" enterkeyhint="search">
          <button class="search-clear" id="panoSearchClear" aria-label="Aramayı temizle" hidden>✕</button>
        </div>
        <div id="panoList" class="pano-list"></div>
      </section>
    `;
  }

  afterRender() {
    const input = document.getElementById('panoSearch');
    const clear = document.getElementById('panoSearchClear');

    input?.addEventListener('input', () => {
      this._query = normQuery(input.value);
      clear.hidden = !input.value;
      this._renderCards();
    });
    clear?.addEventListener('click', () => {
      input.value = ''; this._query = ''; clear.hidden = true;
      input.focus();
      this._renderCards();
    });

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
    const bar  = document.getElementById('panoSearchBar');
    if (!list) return;

    const allPhotos = getState('photos') || [];

    // Hiç foto yokken arama çubuğu anlamsız — gizle, ilk-kullanım empty-state.
    if (!allPhotos.length) {
      if (bar) bar.style.display = 'none';
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🗂️</div>
          <h3>Henüz yer yok</h3>
          <p>Foto ekledikçe kategori kırılımı burada görünecek.</p>
        </div>`;
      return;
    }
    if (bar) bar.style.display = '';

    const q = this._query;
    const photos = q ? allPhotos.filter(p => placeMatches(p, q)) : allPhotos;
    const counts = countsByCategory(photos);

    // Arama varsa yalnız eşleşen kategoriler; yoksa tüm kategoriler (boşlar soluk).
    const cats = q
      ? getCategories().filter(c => (counts[c.key] || 0) > 0)
      : getCategories();

    if (!cats.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>Eşleşme yok</h3>
          <p>“${esc(q)}” için sonuç bulunamadı.</p>
        </div>`;
      return;
    }

    list.innerHTML = cats.map(c => {
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
      card.addEventListener('click', () => openCategorySheet(card.dataset.key, this._query));
    });
  }
}
