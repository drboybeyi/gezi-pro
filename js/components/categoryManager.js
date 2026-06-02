/* Gezi Pro — kategori yönetimi (alttan sheet).
   Header'daki 🏷️ butonundan açılır. Kullanıcı kategori ekler/siler/düzenler
   (isim + renk). Tek kaynak IndexedDB (bkz. categories.js). Silinen
   kategorideki yerler otomatik 'Diğer'e taşınır. */

import {
  getCategories, addCategory, updateCategory, deleteCategory, DEFAULT_CATEGORY,
} from '../categories.js';
import { subscribe } from '../state.js';
import { showToast } from './toast.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let _el = null;
let _unsub = null;
let _editingKey = null;   // inline düzenlenen satırın anahtarı (yoksa null)

function ensureRoot() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.className = 'sheet-backdrop';
  _el.style.display = 'none';
  _el.addEventListener('click', (e) => { if (e.target === _el) close(); });
  document.body.appendChild(_el);
  return _el;
}

function rowView(c) {
  const canDelete = c.key !== DEFAULT_CATEGORY;
  return `
    <div class="cm-row" data-key="${c.key}">
      <span class="cm-swatch" style="background:${c.color};color:${c.fg}">${c.emoji}</span>
      <span class="cm-label">${esc(c.label)}</span>
      <button class="cm-icon" data-act="edit" aria-label="Düzenle" title="Düzenle">✎</button>
      ${canDelete
        ? `<button class="cm-icon cm-icon--danger" data-act="del" aria-label="Sil" title="Sil">🗑</button>`
        : `<span class="cm-icon cm-icon--locked" title="Diğer silinemez">🔒</span>`}
    </div>`;
}

function rowEdit(c) {
  return `
    <div class="cm-row cm-row--edit" data-key="${c.key}">
      <input type="color" class="cm-color" value="${c.color}" aria-label="Renk">
      <input type="text" class="cm-name form-control" value="${esc(c.label)}"
             maxlength="24" aria-label="İsim">
      <button class="cm-icon" data-act="save" aria-label="Kaydet" title="Kaydet">✓</button>
      <button class="cm-icon" data-act="cancel" aria-label="Vazgeç" title="Vazgeç">✕</button>
    </div>`;
}

function renderList() {
  const list = _el?.querySelector('#cmList');
  if (!list) return;
  list.innerHTML = getCategories()
    .map(c => (c.key === _editingKey ? rowEdit(c) : rowView(c)))
    .join('');
  // Düzenleme açıldıysa isim alanına odaklan.
  if (_editingKey) list.querySelector('.cm-name')?.focus();
}

async function onListClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const row = btn.closest('.cm-row');
  const key = row?.dataset.key;
  if (!key) return;
  const act = btn.dataset.act;

  if (act === 'edit') { _editingKey = key; renderList(); return; }
  if (act === 'cancel') { _editingKey = null; renderList(); return; }

  if (act === 'save') {
    const label = row.querySelector('.cm-name').value.trim();
    const color = row.querySelector('.cm-color').value;
    if (!label) { showToast('İsim boş olamaz', 'danger'); return; }
    try {
      await updateCategory(key, { label, color });
      _editingKey = null;
      // renderList'i state aboneliği tetikler.
      showToast('Kategori güncellendi', 'success');
    } catch (err) {
      console.error('[categoryManager] güncelleme hatası', err);
      showToast('Güncellenemedi', 'danger');
    }
    return;
  }

  if (act === 'del') {
    const cat = getCategories().find(c => c.key === key);
    const ok = confirm(`"${cat?.label}" silinsin mi?\nBu kategorideki yerler "Diğer"e taşınacak.`);
    if (!ok) return;
    try {
      const moved = await deleteCategory(key);
      showToast(moved ? `Silindi — ${moved} yer "Diğer"e taşındı` : 'Kategori silindi', 'info');
    } catch (err) {
      console.error('[categoryManager] silme hatası', err);
      showToast(err.message || 'Silinemedi', 'danger');
    }
  }
}

async function onAdd() {
  const nameEl  = _el.querySelector('#cmName');
  const colorEl = _el.querySelector('#cmColor');
  const label = nameEl.value.trim();
  if (!label) { showToast('İsim boş olamaz', 'danger'); nameEl.focus(); return; }
  try {
    await addCategory({ label, color: colorEl.value });
    nameEl.value = '';
    showToast(`"${label}" eklendi`, 'success');
    nameEl.focus();
  } catch (err) {
    console.error('[categoryManager] ekleme hatası', err);
    showToast(err.message || 'Eklenemedi', 'danger');
  }
}

export function openCategoryManager() {
  const root = ensureRoot();
  _editingKey = null;

  root.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Kategoriler">
      <div class="sheet-handle"></div>
      <div class="sheet-body">
        <h2 class="sheet-title">Kategoriler</h2>
        <p class="cm-hint">Yerleri sınıflandırmak için kendi kategorilerini oluştur. Sildiğin kategorideki yerler “Diğer”e düşer.</p>
        <div id="cmList" class="cm-list"></div>
        <div class="cm-add">
          <input type="color" id="cmColor" value="#8b6f47" aria-label="Yeni kategori rengi">
          <input type="text" id="cmName" class="form-control" maxlength="24"
                 placeholder="Yeni kategori adı" aria-label="Yeni kategori adı">
          <button class="btn btn-primary" id="cmAdd">Ekle</button>
        </div>
        <button class="btn btn-ghost btn-full" id="cmClose">Kapat</button>
      </div>
    </div>
  `;
  root.style.display = 'flex';
  requestAnimationFrame(() => root.classList.add('open'));

  renderList();
  root.querySelector('#cmList').addEventListener('click', onListClick);
  root.querySelector('#cmAdd').addEventListener('click', onAdd);
  root.querySelector('#cmName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAdd();
  });
  root.querySelector('#cmClose').addEventListener('click', close);

  // Kategori listesi değişince (ekle/düzenle/sil) yalnızca listeyi tazele.
  _unsub?.();
  _unsub = subscribe('categories', () => renderList());
}

function close() {
  _unsub?.(); _unsub = null;
  _editingKey = null;
  if (!_el) return;
  _el.classList.remove('open');
  setTimeout(() => { if (_el) { _el.style.display = 'none'; _el.innerHTML = ''; } }, 220);
}
