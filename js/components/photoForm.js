/* Gezi Pro — foto ekleme formu (alttan sheet).
   FAB -> dosya seç -> bu form açılır: önizleme + konum durumu (EXIF/cihaz/yok)
   + başlık/not -> Kaydet. Konum çözümü ve thumbnail photos.buildDraft'ta. */

import { buildDraft, savePhoto } from '../photos.js';
import { showToast } from './toast.js';
import { getCategories, DEFAULT_CATEGORY } from '../categories.js';

const catOptions = (selected) => getCategories().map(c =>
  `<option value="${c.key}"${c.key === selected ? ' selected' : ''}>${c.emoji} ${c.label}</option>`).join('');

const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
               'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function defaultTitle(takenAt) {
  const d = new Date(takenAt || Date.now());
  return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

const LOC_ERR_TR = {
  denied:      'konum izni reddedildi',
  unavailable: 'konum alınamadı (sinyal yok)',
  timeout:     'konum zaman aşımına uğradı',
  unsupported: 'cihaz konumu desteklenmiyor',
  insecure:    'güvenli bağlam yok — HTTPS ya da localhost gerekir',
  unknown:     'bilinmeyen konum hatası',
};

function locLine(record) {
  if (record.locSource === 'exif')
    return `📍 Fotoğraftan: ${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}`;
  if (record.locSource === 'device')
    return `📍 Cihaz konumu: ${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}`;
  const why = LOC_ERR_TR[record.locError] || 'fotoğrafta EXIF yok, cihaz konumu alınamadı';
  return `⚠️ Konumsuz devam — ${why}. Yine de kaydedebilirsin.`;
}

let _root = null;
function ensureRoot() {
  if (_root) return _root;
  _root = document.createElement('div');
  _root.className = 'sheet-backdrop';
  _root.style.display = 'none';
  _root.addEventListener('click', (e) => { if (e.target === _root) close(); });
  document.body.appendChild(_root);
  return _root;
}

function close() {
  if (!_root) return;
  _root.classList.remove('open');
  setTimeout(() => { if (_root) { _root.style.display = 'none'; _root.innerHTML = ''; } }, 220);
}

export async function openPhotoForm(files) {
  const list = Array.isArray(files) ? files : [files];
  const first = list[0];
  const root = ensureRoot();
  const objectUrl = URL.createObjectURL(first);

  root.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="pf-preview">
        <img class="sheet-photo" src="${objectUrl}" alt="önizleme">
        ${list.length > 1 ? `<span class="pf-count">📷 ${list.length} foto</span>` : ''}
      </div>
      <div class="sheet-body">
        <div id="pfLoc" class="pf-loc">⏳ Konum okunuyor…</div>
        <div class="form-group">
          <label class="form-label">Başlık</label>
          <input type="text" id="pfTitle" class="form-control" placeholder="Örn. Galata Kulesi">
        </div>
        <div class="form-group">
          <label class="form-label">Kategori</label>
          <select id="pfCat" class="form-control">${catOptions(DEFAULT_CATEGORY)}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Not (opsiyonel)</label>
          <textarea id="pfNote" class="form-control" rows="2" placeholder="Bir şeyler yaz…"></textarea>
        </div>
        <div class="sheet-actions sheet-actions--row">
          <button class="btn btn-ghost" id="pfCancel">İptal</button>
          <button class="btn btn-primary" id="pfSave" disabled>Kaydet</button>
        </div>
      </div>
    </div>
  `;
  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('open'));

  const titleEl  = root.querySelector('#pfTitle');
  const noteEl   = root.querySelector('#pfNote');
  const catEl    = root.querySelector('#pfCat');
  const locEl    = root.querySelector('#pfLoc');
  const saveEl   = root.querySelector('#pfSave');
  const cancelEl = root.querySelector('#pfCancel');

  cancelEl.addEventListener('click', () => { URL.revokeObjectURL(objectUrl); close(); });

  // buildDraft normalde asla throw etmez (her adım withTimeout ile sarmalı);
  // yine de beklenmedik bir hatada formu kilitlememek için minimal taslağa düş.
  let draft;
  try {
    draft = await buildDraft(list);
  } catch (err) {
    console.error('[photoForm] beklenmedik buildDraft hatası:', err);
    const now = Date.now();
    const photos = list.map(f => ({
      id: (crypto.randomUUID?.() || `p${now}${Math.random().toString(16).slice(2,8)}`),
      thumb: null, w: 0, h: 0, takenAt: f.lastModified || now, createdAt: now,
    }));
    draft = {
      record: {
        id: (crypto.randomUUID?.() || `p${now}`),
        title: '', note: '', category: DEFAULT_CATEGORY, lat: null, lng: null, locSource: 'none',
        locError: 'unknown',
        takenAt: first.lastModified || now, createdAt: now, syncState: 'local',
        photos,
      },
      originals: photos.map((p, i) => ({ id: p.id, blob: list[i] })),
    };
  }

  // Konum gelse de gelmese de form HER ZAMAN kullanılabilir hale gelir.
  locEl.textContent = locLine(draft.record);
  locEl.classList.toggle('pf-loc--warn', draft.record.locSource === 'none');
  titleEl.placeholder = defaultTitle(draft.record.takenAt);
  saveEl.disabled = false;

  saveEl.addEventListener('click', async () => {
    if (!draft) return;
    saveEl.disabled = true;
    saveEl.textContent = 'Kaydediliyor…';
    draft.record.title    = titleEl.value.trim() || defaultTitle(draft.record.takenAt);
    draft.record.note     = noteEl.value.trim();
    draft.record.category = catEl.value || DEFAULT_CATEGORY;
    try {
      await savePhoto(draft.record, draft.originals);
      URL.revokeObjectURL(objectUrl);
      close();
      const n = draft.record.photos?.length || 1;
      showToast(n > 1 ? `${n} fotoğraf eklendi 📷` : 'Fotoğraf eklendi 📷', 'success');
    } catch (err) {
      console.error('[photoForm] kayıt hatası', err);
      saveEl.disabled = false;
      saveEl.textContent = 'Kaydet';
      showToast('Kaydedilemedi', 'danger');
    }
  });
}
