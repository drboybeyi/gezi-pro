/* Gezi Pro — tam ekran foto görüntüleyici (slider).
   Bir yerin fotoğraflarını büyütür: önce thumb (anında), sonra TAM ÇÖZÜNÜRLÜK
   yerel orijinalden (IndexedDB) yüklenir. (B2: orijinal yoksa Storage'dan.)
   Sola/sağa geç, kapat. */

import { getOriginal } from '../idb.js';
import { fetchRemoteOriginal } from '../originals-bridge.js';

let _el = null;
let _photos = [];
let _idx = 0;
let _url = null;   // aktif object URL (revoke için)

function revoke() { if (_url) { URL.revokeObjectURL(_url); _url = null; } }

function ensureRoot() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.className = 'pv-backdrop';
  _el.style.display = 'none';
  _el.addEventListener('click', (e) => { if (e.target === _el) close(); });
  document.body.appendChild(_el);
  return _el;
}

async function show(i) {
  if (!_photos.length) return;
  _idx = (i + _photos.length) % _photos.length;
  const ph = _photos[_idx];
  const img = _el.querySelector('.pv-img');
  revoke();
  img.src = ph.thumb || '';                    // önce thumb (anında görsel)
  _el.querySelector('.pv-count').textContent = `${_idx + 1}/${_photos.length}`;
  const nav = _el.querySelector('.pv-prev'), nav2 = _el.querySelector('.pv-next');
  const multi = _photos.length > 1;
  nav.style.display = nav2.style.display = multi ? '' : 'none';
  try {
    const blob = await getOriginal(ph.id);     // tam çözünürlük (yerel)
    if (blob) {
      if (_photos[_idx] === ph) { _url = URL.createObjectURL(blob); img.src = _url; }
    } else if (ph.storagePath) {
      // Yerel orijinal yok (ör. başka cihazdan inmiş) -> Storage'dan indir.
      const url = await fetchRemoteOriginal(ph.storagePath);
      if (url && _photos[_idx] === ph) img.src = url;
    }
  } catch (e) { console.warn('[viewer] orijinal yüklenemedi', e); }
}

export function openPhotoViewer(place, startIndex = 0) {
  _photos = (place?.photos || []).slice();
  if (!_photos.length) return;
  const root = ensureRoot();
  root.innerHTML = `
    <button class="pv-close" aria-label="Kapat">✕</button>
    <button class="pv-prev" aria-label="Önceki">‹</button>
    <img class="pv-img" alt="">
    <button class="pv-next" aria-label="Sonraki">›</button>
    <div class="pv-count"></div>`;
  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('open'));

  root.querySelector('.pv-close').addEventListener('click', close);
  root.querySelector('.pv-prev').addEventListener('click', (e) => { e.stopPropagation(); show(_idx - 1); });
  root.querySelector('.pv-next').addEventListener('click', (e) => { e.stopPropagation(); show(_idx + 1); });
  show(startIndex);
}

function close() {
  revoke();
  if (!_el) return;
  _el.classList.remove('open');
  setTimeout(() => { if (_el) { _el.style.display = 'none'; _el.innerHTML = ''; } }, 200);
}
