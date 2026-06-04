/* Gezi Pro — alttan açılan detay sheet'i.
   Bir fotoğrafın detayını + Google/Apple Maps yol tarifi linklerini gösterir,
   silme imkânı sunar. */

import { googleMapsDirections, appleMapsDirections, googleMapsPlace } from '../utils/maps.js';
import { removePhoto, updatePhoto } from '../photos.js';
import { showToast } from './toast.js';
import { getCategories, catOf } from '../categories.js';
import { coverThumb } from '../utils/place.js';

const catOptions = (selected) => getCategories().map(c =>
  `<option value="${c.key}"${c.key === selected ? ' selected' : ''}>${c.emoji} ${c.label}</option>`).join('');

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  const title = esc(photo?.title) || 'İsimsiz yer';
  const cat = catOf(photo?.category);
  const cover = coverThumb(photo);

  root.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      ${cover
        ? `<img class="sheet-photo" src="${cover}" alt="${title}">`
        : `<div class="sheet-photo sheet-photo--empty">🏞️</div>`}
      <div class="sheet-body">
        <h2 class="sheet-title">
          <span class="cat-badge cat-badge--inline" style="background:${cat.color};color:${cat.fg}">${cat.emoji}</span>
          ${title}
        </h2>
        ${photo?.note ? `<p class="sheet-note">${esc(photo.note)}</p>` : ''}
        <div class="form-group sheet-cat">
          <label class="form-label">Kategori</label>
          <select id="sheetCat" class="form-control">${catOptions(cat.key)}</select>
        </div>
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
        <button class="btn btn-danger btn-full" id="sheetDelete">Sil</button>
      </div>
    </div>
  `;
  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('open'));

  root.querySelector('#sheetCat').addEventListener('change', async (e) => {
    const newCat = e.target.value;
    try {
      await updatePhoto(photo.id, { category: newCat });
      photo.category = newCat;
      // Başlıktaki rozeti güncelle
      const c = catOf(newCat);
      const badge = root.querySelector('.cat-badge--inline');
      if (badge) { badge.style.background = c.color; badge.style.color = c.fg; badge.textContent = c.emoji; }
      showToast(`Kategori: ${c.label}`, 'info');
    } catch (err) {
      console.error('[sheet] kategori güncelleme hatası', err);
      showToast('Kategori değiştirilemedi', 'danger');
    }
  });

  root.querySelector('#sheetDelete').addEventListener('click', async () => {
    if (!confirm('Bu fotoğraf silinsin mi?')) return;
    try {
      await removePhoto(photo.id);
      closeSheet();
      showToast('Silindi', 'info');
    } catch (err) {
      console.error('[sheet] silme hatası', err);
      showToast('Silinemedi', 'danger');
    }
  });
}

export function closeSheet() {
  if (!_el) return;
  _el.classList.remove('open');
  setTimeout(() => { if (_el) _el.style.display = 'none'; }, 220);
}
