/* Gezi Pro — alttan açılan detay sheet'i.
   Bir fotoğraf kaydının detayını + Google/Apple Maps yol tarifi linklerini
   gösterir. Sprint 1'de bileşen hazır; foto verisi Sprint 2'de dolacak. */

import { googleMapsDirections, appleMapsDirections, googleMapsPlace } from '../utils/maps.js';

let _el = null;

function ensureRoot() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.className = 'sheet-backdrop';
  _el.style.display = 'none';
  _el.addEventListener('click', (e) => {
    if (e.target === _el) closeSheet();
  });
  document.body.appendChild(_el);
  return _el;
}

export function openDetailSheet(photo) {
  const root = ensureRoot();
  const hasGps = Number.isFinite(photo?.lat) && Number.isFinite(photo?.lng);

  root.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      ${photo?.thumb
        ? `<img class="sheet-photo" src="${photo.thumb}" alt="${photo.title || ''}">`
        : `<div class="sheet-photo sheet-photo--empty">🏞️</div>`}
      <div class="sheet-body">
        <h2 class="sheet-title">${photo?.title || 'İsimsiz yer'}</h2>
        ${photo?.note ? `<p class="sheet-note">${photo.note}</p>` : ''}
        ${hasGps ? `
          <div class="sheet-coords">📍 ${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}</div>
          <div class="sheet-actions">
            <a class="btn btn-primary" target="_blank" rel="noopener"
               href="${googleMapsDirections(photo.lat, photo.lng, photo.title)}">Google Maps yol tarifi</a>
            <a class="btn btn-secondary" target="_blank" rel="noopener"
               href="${appleMapsDirections(photo.lat, photo.lng, photo.title)}">Apple Maps yol tarifi</a>
            <a class="btn btn-ghost" target="_blank" rel="noopener"
               href="${googleMapsPlace(photo.lat, photo.lng)}">Haritada göster</a>
          </div>` : `<div class="sheet-coords sheet-coords--muted">Konum bilgisi yok</div>`}
      </div>
    </div>
  `;
  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('open'));
}

export function closeSheet() {
  if (!_el) return;
  _el.classList.remove('open');
  setTimeout(() => { if (_el) _el.style.display = 'none'; }, 220);
}
