/* Gezi Pro — alttan açılan yer detay sheet'i.
   Yerin TÜM fotoğraflarını şerit olarak gösterir: tıkla -> tam ekran görüntüleyici,
   ✕ -> tek tek sil (son foto silinince yer silinir), ＋ -> sonradan foto ekle.
   Ayrıca kategori, not, harita yol tarifi linkleri ve yeri silme. */

import { googleMapsDirections, appleMapsDirections, googleMapsPlace } from '../utils/maps.js';
import { removePhoto, updatePhoto, addPhotosToPlace, removePhotoFromPlace, toggleFavorite } from '../photos.js';
import { showToast } from './toast.js';
import { getCategories, catOf } from '../categories.js';
import { photoCount } from '../utils/place.js';
import { getState, subscribe } from '../state.js';
import { openPhotoViewer } from './photoViewer.js';

const catOptions = (selected) => getCategories().map(c =>
  `<option value="${c.key}"${c.key === selected ? ' selected' : ''}>${c.emoji} ${c.label}</option>`).join('');

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let _el = null;
let _place = null;
let _unsub = null;
let _addInput = null;
let _editing = false;   // düzenleme modunda mı? (uzak güncelleme body'yi ezmesin)

function ensureRoot() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.className = 'sheet-backdrop';
  _el.style.display = 'none';
  _el.addEventListener('click', (e) => { if (e.target === _el) closeSheet(); });
  document.body.appendChild(_el);
  return _el;
}

function ensureAddInput() {
  if (_addInput) return _addInput;
  _addInput = document.createElement('input');
  _addInput.type = 'file';
  _addInput.accept = 'image/*';
  _addInput.multiple = true;
  _addInput.style.display = 'none';
  document.body.appendChild(_addInput);
  _addInput.addEventListener('change', async () => {
    const files = Array.from(_addInput.files || []);
    _addInput.value = '';
    if (!files.length || !_place) return;
    try {
      await addPhotosToPlace(_place.id, files);   // subscribe şeridi tazeler
      showToast(files.length > 1 ? `${files.length} foto eklendi 📷` : 'Foto eklendi 📷', 'success');
    } catch (err) {
      console.error('[sheet] foto ekleme hatası', err);
      showToast('Eklenemedi', 'danger');
    }
  });
  return _addInput;
}

/** Foto şeridi HTML'i. */
function stripHTML(place) {
  const photos = place.photos || [];
  return photos.map((ph, i) => `
    <div class="strip-item" data-idx="${i}">
      ${ph.thumb ? `<img src="${ph.thumb}" alt="foto ${i + 1}" loading="lazy">`
                 : `<span class="strip-empty">🏞️</span>`}
      <button class="strip-del" data-pid="${ph.id}" aria-label="Bu fotoğrafı sil" title="Sil">✕</button>
    </div>`).join('')
    + `<button class="strip-add" id="stripAdd" aria-label="Foto ekle" title="Foto ekle">＋</button>`;
}

/** Yalnız şeridi tazele (foto ekle/sil sonrası). */
function renderStrip() {
  const strip = _el?.querySelector('#sheetStrip');
  if (!strip || !_place) return;
  strip.innerHTML = stripHTML(_place);
  wireStrip();
}

function wireStrip() {
  const strip = _el.querySelector('#sheetStrip');
  if (!strip) return;
  strip.querySelector('#stripAdd')?.addEventListener('click', () => ensureAddInput().click());
  strip.querySelectorAll('.strip-del').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); onDeletePhoto(btn.dataset.pid); });
  });
  strip.querySelectorAll('.strip-item').forEach(item => {
    item.addEventListener('click', () => openPhotoViewer(_place, Number(item.dataset.idx) || 0));
  });
}

async function onDeletePhoto(pid) {
  if (!_place) return;
  const isLast = (_place.photos || []).length <= 1;
  if (isLast && !confirm('Son fotoğraf — yer tamamen silinsin mi?')) return;
  try {
    const res = await removePhotoFromPlace(_place.id, pid);
    if (res === null) { closeSheet(); showToast('Yer silindi', 'info'); }
    else showToast('Fotoğraf silindi', 'info');   // subscribe şeridi tazeler
  } catch (err) {
    console.error('[sheet] foto silme hatası', err);
    showToast('Silinemedi', 'danger');
  }
}

/** Yer detayının görüntüleme (salt-okunur) gövdesi. */
function displayBodyHTML(place) {
  const hasGps = Number.isFinite(place?.lat) && Number.isFinite(place?.lng);
  const title = esc(place?.title) || 'İsimsiz yer';
  const cat = catOf(place?.category);
  const n = photoCount(place);
  const fav = !!place?.favorite;
  return `
    <div class="sheet-titlerow">
      <h2 class="sheet-title">
        <span class="cat-badge cat-badge--inline" style="background:${cat.color};color:${cat.fg}">${cat.emoji}</span>
        ${title}${n > 1 ? ` <span class="sheet-photocount">🖼 ${n}</span>` : ''}
      </h2>
      <button class="fav-toggle${fav ? ' fav-toggle--on' : ''}" id="sheetFav"
              aria-pressed="${fav}" aria-label="Favori" title="Favori">${fav ? '★' : '☆'}</button>
    </div>
    ${place?.note ? `<p class="sheet-note">${esc(place.note)}</p>` : ''}
    ${hasGps ? `
      <div class="sheet-coords">📍 ${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</div>
      <div class="sheet-actions">
        <a class="btn btn-primary" target="_blank" rel="noopener"
           href="${googleMapsDirections(place.lat, place.lng, place.title)}">Google Maps yol tarifi</a>
        <a class="btn btn-secondary" target="_blank" rel="noopener"
           href="${appleMapsDirections(place.lat, place.lng, place.title)}">Apple Maps yol tarifi</a>
        <a class="btn btn-ghost" target="_blank" rel="noopener"
           href="${googleMapsPlace(place.lat, place.lng)}">Haritada göster</a>
      </div>` : `<div class="sheet-coords sheet-coords--muted">Konum bilgisi yok</div>`}
    <button class="btn btn-secondary btn-full" id="sheetEdit">✏️ Düzenle</button>
    <button class="btn btn-danger btn-full" id="sheetDelete">Yeri sil</button>
  `;
}

/** Yalnız ad, not ve kategori düzenlenir; konum ve fotoğraflara dokunulmaz. */
function editBodyHTML(place) {
  const cat = catOf(place?.category);
  return `
    <div class="form-group">
      <label class="form-label" for="editTitle">Yer adı</label>
      <input id="editTitle" class="form-control" type="text" maxlength="120"
             placeholder="İsimsiz yer" value="${esc(place?.title)}">
    </div>
    <div class="form-group">
      <label class="form-label" for="editNote">Not / açıklama</label>
      <textarea id="editNote" class="form-control" rows="3"
                placeholder="Not ekle…">${esc(place?.note)}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label" for="editCat">Kategori</label>
      <select id="editCat" class="form-control">${catOptions(cat.key)}</select>
    </div>
    <div class="sheet-actions sheet-actions--row">
      <button class="btn btn-ghost" id="editCancel">İptal</button>
      <button class="btn btn-primary" id="editSave">Kaydet</button>
    </div>
  `;
}

/** Görüntüleme gövdesini bas + olaylarını bağla. */
function renderBody() {
  const body = _el?.querySelector('.sheet-body');
  if (!body || !_place) return;
  _editing = false;
  body.innerHTML = displayBodyHTML(_place);
  body.querySelector('#sheetFav')?.addEventListener('click', onToggleFav);
  body.querySelector('#sheetEdit')?.addEventListener('click', enterEditMode);
  body.querySelector('#sheetDelete')?.addEventListener('click', onDeletePlace);
}

async function onToggleFav() {
  if (!_place) return;
  try {
    const fav = await toggleFavorite(_place.id);   // IndexedDB + Firebase; subscribe gövdeyi tazeler
    _place = { ..._place, favorite: fav };
    const btn = _el?.querySelector('#sheetFav');
    if (btn) {
      btn.classList.toggle('fav-toggle--on', fav);
      btn.setAttribute('aria-pressed', String(fav));
      btn.textContent = fav ? '★' : '☆';
    }
    showToast(fav ? 'Favorilere eklendi ★' : 'Favoriden çıkarıldı', 'info');
  } catch (err) {
    console.error('[sheet] favori hatası', err);
    showToast('Favori güncellenemedi', 'danger');
  }
}

/** Düzenleme formuna geç + olaylarını bağla. */
function enterEditMode() {
  const body = _el?.querySelector('.sheet-body');
  if (!body || !_place) return;
  _editing = true;
  body.innerHTML = editBodyHTML(_place);
  body.querySelector('#editCancel')?.addEventListener('click', renderBody);
  body.querySelector('#editSave')?.addEventListener('click', onSaveEdit);
  body.querySelector('#editTitle')?.focus();
}

async function onSaveEdit() {
  if (!_place) return;
  const body = _el.querySelector('.sheet-body');
  const title = body.querySelector('#editTitle')?.value.trim() || '';
  const note  = body.querySelector('#editNote')?.value.trim() || '';
  const category = body.querySelector('#editCat')?.value || _place.category;
  try {
    await updatePhoto(_place.id, { title, note, category });   // IndexedDB + Firebase (LWW)
    _place = { ..._place, title, note, category };
    renderBody();
    showToast('Kaydedildi ✓', 'success');
  } catch (err) {
    console.error('[sheet] düzenleme kaydı hatası', err);
    showToast('Kaydedilemedi', 'danger');
  }
}

async function onDeletePlace() {
  if (!confirm('Bu yer (tüm fotoğraflarıyla) silinsin mi?')) return;
  try {
    await removePhoto(_place.id);
    closeSheet();
    showToast('Yer silindi', 'info');
  } catch (err) {
    console.error('[sheet] silme hatası', err);
    showToast('Silinemedi', 'danger');
  }
}

export function openDetailSheet(place) {
  _place = place;
  const root = ensureRoot();

  root.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="photo-strip" id="sheetStrip">${stripHTML(place)}</div>
      <div class="sheet-body"></div>
    </div>
  `;
  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('open'));

  wireStrip();
  renderBody();

  // Açıkken foto ekle/sil olursa şeridi tazele; yer silindiyse kapat.
  // Düzenleme modundaysak gövdeyi yeniden basma (kullanıcının girdisini ezmemek için).
  _unsub?.();
  _unsub = subscribe('photos', (photos) => {
    const updated = (photos || []).find(p => p.id === _place?.id);
    if (!updated) { closeSheet(); return; }
    _place = updated;
    renderStrip();
    if (!_editing) renderBody();
  });
}

export function closeSheet() {
  _unsub?.(); _unsub = null;
  _place = null;
  _editing = false;
  if (!_el) return;
  _el.classList.remove('open');
  setTimeout(() => { if (_el) _el.style.display = 'none'; }, 220);
}
