/* Gezi Pro — Harita sekmesi (Leaflet).
   Sprint 1: harita boş render edilir; IndexedDB'de konumlu fotoğraf oldukça
   pin'ler düşer. Leaflet, index.html'de CDN'den global `L` olarak yüklenir. */

import { getState, subscribe } from '../state.js';
import { openDetailSheet } from '../components/sheet.js';
import { catOf } from '../categories.js';

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
  }

  render() {
    return `
      <section class="view view-harita">
        <div id="map" class="map-container"></div>
      </section>
    `;
  }

  afterRender() {
    // Konteyner DOM'a girip boyut alsın diye bir frame bekle.
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
      this._unsub = subscribe('photos', (photos) => this._renderMarkers(photos));
      this._map.invalidateSize();
    });
  }

  destroy() {
    this._unsub?.();
    if (this._map) { this._map.remove(); this._map = null; }
  }

  _renderMarkers(photos = []) {
    if (!this._map || !this._markers) return;
    this._markers.clearLayers();

    const located = photos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
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
