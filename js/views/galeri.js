/* Gezi Pro — Galeri sekmesi.
   IndexedDB'den gelen fotoğrafları grid'de gösterir; üstte arama çubuğu
   (başlık + not + kategori adında canlı filtre). Foto yokken empty-state. */

import { getState, subscribe } from '../state.js';
import { openDetailSheet } from '../components/sheet.js';
import { catOf } from '../categories.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const norm = (s = '') => String(s).toLocaleLowerCase('tr').trim();

/** Bir fotoğraf sorguyla eşleşiyor mu? (başlık + not + kategori adı) */
function matches(p, q) {
  if (!q) return true;
  const hay = `${p.title || ''} ${p.note || ''} ${catOf(p.category).label}`;
  return norm(hay).includes(q);
}

export class GaleriView {
  constructor() {
    this._unsub = null;
    this._query = '';
  }

  render() {
    return `
      <section class="view view-galeri">
        <div class="search-bar" id="galeriSearchBar">
          <span class="search-ico" aria-hidden="true">🔍</span>
          <input type="search" id="galeriSearch" class="search-input"
                 placeholder="Ara — başlık, not, kategori"
                 autocomplete="off" autocapitalize="none" enterkeyhint="search">
          <button class="search-clear" id="galeriSearchClear" aria-label="Aramayı temizle" hidden>✕</button>
        </div>
        <div id="galeriGrid" class="gallery-grid"></div>
      </section>
    `;
  }

  afterRender() {
    const input = document.getElementById('galeriSearch');
    const clear = document.getElementById('galeriSearchClear');

    input?.addEventListener('input', () => {
      this._query = norm(input.value);
      clear.hidden = !input.value;
      this._renderPhotos(getState('photos'));
    });
    clear?.addEventListener('click', () => {
      input.value = ''; this._query = ''; clear.hidden = true;
      input.focus();
      this._renderPhotos(getState('photos'));
    });

    this._renderPhotos(getState('photos'));
    this._unsub = subscribe('photos', (photos) => this._renderPhotos(photos));
  }

  destroy() {
    this._unsub?.();
  }

  _renderPhotos(photos = []) {
    const grid = document.getElementById('galeriGrid');
    const bar  = document.getElementById('galeriSearchBar');
    if (!grid) return;

    // Hiç foto yokken arama çubuğu anlamsız — gizle, ilk-kullanım empty-state göster.
    if (!photos.length) {
      if (bar) bar.style.display = 'none';
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📷</div>
          <h3>Henüz fotoğraf yok</h3>
          <p>Aşağıdaki <strong>+</strong> ile ilk gezini ekle.<br>
             Fotoğraftaki konum otomatik okunur, yoksa cihaz konumun kullanılır.</p>
        </div>`;
      return;
    }
    if (bar) bar.style.display = '';

    const q = this._query;
    const shown = q ? photos.filter(p => matches(p, q)) : photos;

    if (!shown.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>Eşleşme yok</h3>
          <p>“${esc(q)}” için sonuç bulunamadı.</p>
        </div>`;
      return;
    }

    grid.innerHTML = shown.map(p => {
      const t = esc(p.title) || 'Fotoğraf';
      const cat = catOf(p.category);
      return `
      <button class="gallery-cell" data-id="${p.id}" aria-label="${t} — ${cat.label}">
        ${p.thumb
          ? `<img src="${p.thumb}" alt="${t}" loading="lazy">`
          : `<span class="gallery-cell--empty">🏞️</span>`}
        <span class="cat-badge" style="background:${cat.color};color:${cat.fg}"
              title="${cat.label}">${cat.emoji}</span>
        ${Number.isFinite(p.lat) ? `<span class="gallery-pin">📍</span>` : ''}
      </button>`;
    }).join('');

    grid.querySelectorAll('.gallery-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const photo = (getState('photos') || []).find(x => x.id === cell.dataset.id);
        if (photo) openDetailSheet(photo);
      });
    });
  }
}
