/* Gezi Pro — Galeri sekmesi.
   Sprint 1: IndexedDB'den gelen fotoğrafları grid'de gösterir; boşken
   empty-state. Foto yokken (iskelet) boş durum render edilir. */

import { getState, subscribe } from '../state.js';
import { openDetailSheet } from '../components/sheet.js';
import { catOf } from '../categories.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class GaleriView {
  constructor() {
    this._unsub = null;
  }

  render() {
    return `
      <section class="view view-galeri">
        <div id="galeriGrid" class="gallery-grid"></div>
      </section>
    `;
  }

  afterRender() {
    this._renderPhotos(getState('photos'));
    this._unsub = subscribe('photos', (photos) => this._renderPhotos(photos));
  }

  destroy() {
    this._unsub?.();
  }

  _renderPhotos(photos = []) {
    const grid = document.getElementById('galeriGrid');
    if (!grid) return;

    if (!photos.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📷</div>
          <h3>Henüz fotoğraf yok</h3>
          <p>Aşağıdaki <strong>+</strong> ile ilk gezini ekle.<br>
             Fotoğraftaki konum otomatik okunur, yoksa cihaz konumun kullanılır.</p>
        </div>`;
      return;
    }

    grid.innerHTML = photos.map(p => {
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
