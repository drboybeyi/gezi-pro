/* Gezi Pro — Galeri sekmesi.
   IndexedDB'den gelen fotoğrafları grid'de gösterir; üstte arama çubuğu
   (başlık + not + kategori adında canlı filtre). Çoklu seçim: uzun bas ya da
   ▢ "Seç" -> seçim modu; hücreye dokun seç/kaldır; üstte seçim çubuğundan
   toplu sil. Foto yokken empty-state. */

import { getState, subscribe } from '../state.js';
import { openDetailSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { catOf } from '../categories.js';
import { removePhotos, toggleFavorite } from '../photos.js';
import { normQuery, placeMatches } from '../utils/search.js';
import { coverThumb, photoCount } from '../utils/place.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LONG_PRESS_MS = 450;

export class GaleriView {
  constructor() {
    this._unsub = null;
    this._query = '';
    this._favOnly = false;         // 'sadece favoriler' filtresi
    this._selectMode = false;
    this._selected = new Set();
    this._suppressClick = false;   // long-press sonrası gelen click'i yut
    this._lpTimer = null;
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
          <button class="search-select fav-filter" id="galeriFavToggle"
                  aria-label="Sadece favoriler" aria-pressed="false" title="Sadece favoriler">★</button>
          <button class="search-select" id="galeriSelectToggle" aria-label="Seç" title="Seç">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </button>
        </div>
        <div class="select-bar" id="galeriSelectBar" hidden>
          <button class="select-cancel" id="selCancel" aria-label="Vazgeç" title="Vazgeç">✕</button>
          <span class="select-count" id="selCount">0 seçildi</span>
          <button class="select-all" id="selAll">Tümü</button>
          <button class="select-del" id="selDel">🗑 Sil</button>
        </div>
        <div id="galeriGrid" class="gallery-grid"></div>
      </section>
    `;
  }

  afterRender() {
    const input  = document.getElementById('galeriSearch');
    const clear  = document.getElementById('galeriSearchClear');

    input?.addEventListener('input', () => {
      this._query = normQuery(input.value);
      clear.hidden = !input.value;
      this._renderPhotos(getState('photos'));
    });
    clear?.addEventListener('click', () => {
      input.value = ''; this._query = ''; clear.hidden = true;
      input.focus();
      this._renderPhotos(getState('photos'));
    });

    document.getElementById('galeriFavToggle')?.addEventListener('click', (e) => {
      this._favOnly = !this._favOnly;
      e.currentTarget.classList.toggle('fav-filter--on', this._favOnly);
      e.currentTarget.setAttribute('aria-pressed', String(this._favOnly));
      this._renderPhotos(getState('photos'));
    });

    document.getElementById('galeriSelectToggle')?.addEventListener('click', () =>
      this._selectMode ? this._exitSelect() : this._enterSelect());
    document.getElementById('selCancel')?.addEventListener('click', () => this._exitSelect());
    document.getElementById('selAll')?.addEventListener('click', () => this._selectAllShown());
    document.getElementById('selDel')?.addEventListener('click', () => this._deleteSelected());

    this._renderPhotos(getState('photos'));
    this._unsub = subscribe('photos', (photos) => this._renderPhotos(photos));
  }

  destroy() {
    this._unsub?.();
    if (this._lpTimer) clearTimeout(this._lpTimer);
  }

  // --- Seçim modu ---

  _enterSelect(id) {
    this._selectMode = true;
    if (id) this._selected.add(id);
    this._syncBars();
    this._renderPhotos(getState('photos'));
  }

  _exitSelect() {
    this._selectMode = false;
    this._selected.clear();
    this._syncBars();
    this._renderPhotos(getState('photos'));
  }

  _toggle(id) {
    if (this._selected.has(id)) this._selected.delete(id);
    else this._selected.add(id);
    this._syncBars();
    this._renderPhotos(getState('photos'));
  }

  _shownPhotos(photos = getState('photos') || []) {
    let list = this._query ? photos.filter(p => placeMatches(p, this._query)) : photos;
    if (this._favOnly) list = list.filter(p => !!p.favorite);
    return list;
  }

  _selectAllShown() {
    this._shownPhotos().forEach(p => this._selected.add(p.id));
    this._syncBars();
    this._renderPhotos(getState('photos'));
  }

  async _deleteSelected() {
    const ids = [...this._selected];
    if (!ids.length) { showToast('Önce fotoğraf seç', 'info'); return; }
    if (!confirm(`${ids.length} fotoğraf silinsin mi?`)) return;
    try {
      await removePhotos(ids);
      this._exitSelect();
      showToast(`${ids.length} fotoğraf silindi`, 'info');
    } catch (err) {
      console.error('[galeri] toplu silme hatası', err);
      showToast('Silinemedi', 'danger');
    }
  }

  /** Seçim çubuğu YALNIZ >=1 seçiliyken görünür; aksi halde arama çubuğu. */
  _syncBars() {
    const searchBar = document.getElementById('galeriSearchBar');
    const selectBar = document.getElementById('galeriSelectBar');
    const count     = document.getElementById('selCount');
    const has = this._selected.size > 0;
    if (selectBar) selectBar.hidden = !has;
    if (searchBar) searchBar.style.display = has ? 'none' : '';
    if (count) count.textContent = `${this._selected.size} seçildi`;
  }

  // --- Render ---

  _renderPhotos(photos = []) {
    const grid = document.getElementById('galeriGrid');
    const bar  = document.getElementById('galeriSearchBar');
    if (!grid) return;

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
    this._syncBars();   // arama/seçim çubuğu görünürlüğü (seçim sayısına göre)

    const shown = this._shownPhotos(photos);

    if (!shown.length) {
      grid.innerHTML = this._favOnly && !this._query
        ? `<div class="empty-state">
             <div class="empty-icon">★</div>
             <h3>Favori yok</h3>
             <p>Bir yerin yıldızına dokunarak favorilere ekle.</p>
           </div>`
        : `<div class="empty-state">
             <div class="empty-icon">🔍</div>
             <h3>Eşleşme yok</h3>
             <p>${this._query ? `“${esc(this._query)}” için sonuç bulunamadı.` : 'Favorilerde sonuç yok.'}</p>
           </div>`;
      return;
    }

    grid.classList.toggle('gallery-grid--select', this._selectMode);
    grid.innerHTML = shown.map(p => {
      const t = esc(p.title) || 'Fotoğraf';
      const cat = catOf(p.category);
      const sel = this._selected.has(p.id);
      const cover = coverThumb(p);
      const n = photoCount(p);
      return `
      <button class="gallery-cell${this._selectMode ? ' gallery-cell--select' : ''}${sel ? ' gallery-cell--selected' : ''}"
              data-id="${p.id}" aria-label="${t} — ${cat.label}${n > 1 ? ` — ${n} foto` : ''}" aria-pressed="${sel}">
        ${cover
          ? `<img src="${cover}" alt="${t}" loading="lazy">`
          : `<span class="gallery-cell--empty">🏞️</span>`}
        <span class="cat-badge" style="background:${cat.color};color:${cat.fg}"
              title="${cat.label}">${cat.emoji}</span>
        ${n > 1 ? `<span class="count-badge" title="${n} foto">🖼 ${n}</span>` : ''}
        ${Number.isFinite(p.lat) ? `<span class="gallery-pin">📍</span>` : ''}
        ${this._selectMode
          ? `<span class="cell-check">${sel ? '✓' : ''}</span>`
          : `<span class="fav-star${p.favorite ? ' fav-star--on' : ''}" data-fav="${p.id}"
                   role="button" aria-label="Favori" aria-pressed="${!!p.favorite}"
                   title="Favori">${p.favorite ? '★' : '☆'}</span>`}
      </button>`;
    }).join('');

    shown.forEach(p => {
      const cell = grid.querySelector(`.gallery-cell[data-id="${p.id}"]`);
      if (!cell) return;
      cell.addEventListener('click', () => {
        if (this._suppressClick) { this._suppressClick = false; return; }
        if (this._selectMode) { this._toggle(p.id); return; }
        const photo = (getState('photos') || []).find(x => x.id === p.id);
        if (photo) openDetailSheet(photo);
      });
      const star = cell.querySelector('.fav-star');
      star?.addEventListener('pointerdown', (e) => e.stopPropagation());  // uzun-basış/seçimi tetikleme
      star?.addEventListener('click', async (e) => {
        e.stopPropagation();          // hücre açılışını tetikleme
        try { await toggleFavorite(p.id); }   // subscribe grid'i tazeler
        catch (err) { console.error('[galeri] favori hatası', err); showToast('Favori güncellenemedi', 'danger'); }
      });
      this._wireLongPress(cell, p.id);
    });
  }

  /** Uzun basış -> seçim moduna gir (zaten moddaysak gerekmez). */
  _wireLongPress(cell, id) {
    cell.addEventListener('pointerdown', (e) => {
      if (this._selectMode) return;
      const sx = e.clientX, sy = e.clientY;
      this._lpTimer = setTimeout(() => {
        this._lpTimer = null;
        this._suppressClick = true;     // takip eden click açılışı engelle
        this._enterSelect(id);
      }, LONG_PRESS_MS);

      const cancel = () => { if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; } cleanup(); };
      const move = (ev) => {
        if (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10) cancel();
      };
      const cleanup = () => {
        cell.removeEventListener('pointerup', cancel);
        cell.removeEventListener('pointercancel', cancel);
        cell.removeEventListener('pointermove', move);
      };
      cell.addEventListener('pointerup', cancel);
      cell.addEventListener('pointercancel', cancel);
      cell.addEventListener('pointermove', move);
    });
  }
}
