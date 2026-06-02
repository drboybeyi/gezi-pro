/* Gezi Pro — Harita sekmesi (Leaflet).
   Konumlu fotoğraflar kategori renginde iğnelerle düşer. Üstte yatay kaydırılan
   kategori filtre çubuğu: chip'leri aç/kapat -> ilgili pin'ler gösterilir/gizlenir.
   "Tümü" chip'i filtreyi sıfırlar. Leaflet, index.html'de CDN'den global `L`. */

import { getState, subscribe } from '../state.js';
import { openDetailSheet } from '../components/sheet.js';
import { getCategories, catOf } from '../categories.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Kategori rengine boyalı damla (teardrop) iğne — Leaflet divIcon. */
function catPinIcon(category) {
  const c = catOf(category);
  return L.divIcon({
    className: 'cat-pin-wrap',
    html: `<span class="cat-pin" style="background:${c.color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],   // damlanın ucu
    popupAnchor: [0, -20],
  });
}

const DEFAULT_CENTER = [39.0, 35.0]; // Türkiye geneli
const DEFAULT_ZOOM   = 5;

export class HaritaView {
  constructor() {
    this._map = null;
    this._markers = null;
    this._unsub = null;
    this._active = null;   // null = tümü; aksi halde gösterilecek kategori anahtarları (Set)
  }

  render() {
    return `
      <section class="view view-harita">
        <div id="haritaFilter" class="harita-filter"></div>
        <div id="map" class="map-container"></div>
      </section>
    `;
  }

  afterRender() {
    this._renderChips(getState('photos'));

    requestAnimationFrame(() => {
      if (typeof L === 'undefined') {
        document.getElementById('map').innerHTML =
          `<div class="empty-state"><div class="empty-icon">🗺️</div>
           <h3>Harita yüklenemedi</h3><p>İnternet bağlantısını kontrol et.</p></div>`;
        return;
      }
      this._map = L.map('map', { zoomControl: true })
        .setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(this._map);
      this._markers = L.layerGroup().addTo(this._map);

      this._renderMarkers(getState('photos'));
      this._unsub = subscribe('photos', (photos) => {
        this._renderChips(photos);
        this._renderMarkers(photos);
      });
      this._map.invalidateSize();
    });
  }

  destroy() {
    this._unsub?.();
    if (this._map) { this._map.remove(); this._map = null; }
  }

  /** Bir kategori chip'i aktif (gösteriliyor) mu? */
  _isOn(key) {
    return this._active === null || this._active.has(key);
  }

  /** Konumlu fotoğraflarda gerçekten bulunan kategoriler (kategori sırasında). */
  _presentKeys(photos = []) {
    const present = new Set(
      photos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
            .map(p => catOf(p.category).key)
    );
    return getCategories().filter(c => present.has(c.key));
  }

  _renderChips(photos = []) {
    const bar = document.getElementById('haritaFilter');
    if (!bar) return;
    const cats = this._presentKeys(photos);

    // Konumlu foto yoksa filtre çubuğu gizlensin.
    if (!cats.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = '';

    const allOn = this._active === null;
    const chips = cats.map(c => {
      const on = this._isOn(c.key);
      return `
        <button class="filter-chip${on ? ' filter-chip--on' : ''}" data-key="${c.key}"
                style="${on ? `border-color:${c.color}` : ''}" aria-pressed="${on}">
          <span class="chip-dot" style="background:${on ? c.color : 'transparent'};border-color:${c.color}"></span>
          ${c.emoji} ${esc(c.label)}
        </button>`;
    }).join('');

    bar.innerHTML = `
      <button class="filter-chip filter-chip--all${allOn ? ' filter-chip--on' : ''}"
              data-key="__all__" aria-pressed="${allOn}">Tümü</button>
      ${chips}`;

    bar.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => this._onChip(chip.dataset.key, photos));
    });
  }

  _onChip(key, photos) {
    if (key === '__all__') {
      this._active = null;                       // sıfırla: tümü
    } else {
      // İlk daraltmada mevcut kategorilerden materyalize et.
      if (this._active === null) {
        this._active = new Set(this._presentKeys(photos).map(c => c.key));
      }
      if (this._active.has(key)) this._active.delete(key);
      else this._active.add(key);
      // Hepsi tekrar açıldıysa "tümü" durumuna dön (temiz state).
      const allKeys = this._presentKeys(photos).map(c => c.key);
      if (allKeys.every(k => this._active.has(k))) this._active = null;
    }
    this._renderChips(photos);
    this._renderMarkers(photos);
  }

  _renderMarkers(photos = []) {
    if (!this._map || !this._markers) return;
    this._markers.clearLayers();

    const located = photos.filter(p =>
      Number.isFinite(p.lat) && Number.isFinite(p.lng) && this._isOn(catOf(p.category).key));

    located.forEach(p => {
      L.marker([p.lat, p.lng], { icon: catPinIcon(p.category) })
        .addTo(this._markers)
        .on('click', () => openDetailSheet(p))
        .bindTooltip(`${catOf(p.category).emoji} ${p.title || 'Fotoğraf'}`);
    });

    if (located.length) {
      const bounds = L.latLngBounds(located.map(p => [p.lat, p.lng]));
      this._map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }
}
