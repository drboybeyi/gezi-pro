/* Gezi Pro — bootstrap.
   OFFLINE-FIRST: App HER ZAMAN local açılır (IndexedDB ana kaynak); boot
   yolunda Firebase import EDİLMEZ, bu yüzden config'siz/çevrimdışı da çalışır.
   Giriş OPSİYONELDİR: header "Giriş" -> js/auth.js DİNAMİK yüklenir, Firebase
   o an gelir, giriş yapılınca senkron başlar. Daha önce giriş yapıldıysa
   (localStorage bayrağı) boot'ta oturum sessizce sürdürülür. */

import { setState, subscribe } from './state.js';
import { getAllPhotos } from './idb.js';
import { loadCategories } from './categories.js';
import { openPhotoForm } from './components/photoForm.js';
import { openCategoryManager } from './components/categoryManager.js';
import { showToast } from './components/toast.js';

import { GaleriView } from './views/galeri.js';
import { HaritaView } from './views/harita.js';
import { DashboardView } from './views/dashboard.js';

const VIEWS = {
  galeri: GaleriView,
  harita: HaritaView,
  pano:   DashboardView,
};

const NAV_ITEMS = [
  { key: 'galeri', label: 'Galeri', icon: iconGaleri() },
  { key: 'harita', label: 'Harita', icon: iconHarita() },
  { key: 'pano',   label: 'Pano',   icon: iconPano() },
];

let _currentView = 'galeri';
let _viewInstance = null;

// --- UI Show/Hide ---

export function showAppUI() {
  document.querySelector('.header').style.display = 'flex';
  document.querySelector('.bottom-nav').style.display = 'flex';
  document.querySelector('.fab').style.display = 'flex';
}

export function hideAppUI() {
  document.querySelector('.header').style.display = 'none';
  document.querySelector('.bottom-nav').style.display = 'none';
  document.querySelector('.fab').style.display = 'none';
}

// --- Router ---

export function teardownView() {
  _viewInstance?.destroy?.();
  _viewInstance = null;
}

export function initialView() {
  const hash = (location.hash.replace('#', '') || '').trim();
  return VIEWS[hash] ? hash : 'galeri';
}

export function navigate(viewKey) {
  const key = VIEWS[viewKey] ? viewKey : 'galeri';
  _currentView = key;
  history.replaceState(null, '', `#${key}`);

  teardownView();

  const ViewClass = VIEWS[key];
  const view      = new ViewClass();
  _viewInstance   = view;
  const app       = document.getElementById('app');

  app.innerHTML = `<div class="loading">Yükleniyor…</div>`;
  requestAnimationFrame(() => {
    app.innerHTML = view.render();
    view.afterRender?.();
    app.scrollTop = 0;
    window.scrollTo(0, 0);
    updateNav(key);
  });
}

function updateNav(activeKey) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === activeKey);
  });
}

window.addEventListener('hashchange', () => {
  const hash = location.hash.replace('#', '') || 'galeri';
  if (hash !== _currentView) navigate(hash);
});

// --- Header foto sayacı ---

subscribe('photos', (photos) => {
  const el = document.getElementById('headerCount');
  if (el) el.textContent = photos?.length ? `${photos.length} yer` : '';
});

// --- Senkron durum rozeti (state'i db.js sürer; burada yalnız gösterim) ---

const SYNC_UI = {
  syncing: { cls: 'sync-badge--syncing', label: 'Senkronlanıyor…' },
  online:  { cls: 'sync-badge--online',  label: 'Senkron açık ☁️' },
  offline: { cls: 'sync-badge--offline', label: 'Çevrimdışı — bağlantı yok' },
};

subscribe('sync', (state) => {
  const el = document.getElementById('syncBadge');
  if (!el) return;
  const ui = SYNC_UI[state];
  if (!ui) { el.style.display = 'none'; el.dataset.label = ''; return; }
  el.style.display = '';
  el.className = `header-btn sync-badge ${ui.cls}`;
  el.dataset.label = ui.label;
});

document.getElementById('syncBadge')?.addEventListener('click', (e) => {
  const label = e.currentTarget.dataset.label;
  if (label) showToast(label, 'info');
});

// --- FAB (foto ekleme) ---

const _fileInput = document.createElement('input');
_fileInput.type = 'file';
_fileInput.accept = 'image/*';   // mobilde galeri/kamera seçimi sunar
_fileInput.style.display = 'none';
document.body.appendChild(_fileInput);

document.getElementById('fabBtn').addEventListener('click', () => _fileInput.click());

// --- Kategori yönetimi (header) ---
document.getElementById('catBtn')?.addEventListener('click', openCategoryManager);

// --- Giriş / senkron (header) — Firebase yalnızca dokununca dinamik yüklenir ---
document.getElementById('authBtn')?.addEventListener('click', () => {
  import('./auth.js')
    .then(m => m.openLogin())
    .catch(err => console.error('[auth] yüklenemedi:', err));
});

_fileInput.addEventListener('change', () => {
  const file = _fileInput.files?.[0];
  if (file) openPhotoForm(file);
  _fileInput.value = '';   // aynı dosya tekrar seçilebilsin
});

// --- Bottom nav ---

(function buildNav() {
  const nav = document.querySelector('.bottom-nav');
  nav.innerHTML = NAV_ITEMS.map(item => `
    <div class="nav-item" data-view="${item.key}">
      ${item.icon}
      <span>${item.label}</span>
    </div>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.view));
  });
})();

// --- Service Worker ---

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

// --- Boot ---

/** Offline-first boot: her zaman local. Firebase'e dokunmaz. */
async function bootLocal() {
  await loadCategories();                // kategori cache'i (senkron catOf için) — render'dan önce
  const photos = await getAllPhotos();   // IndexedDB source-of-truth
  setState('photos', photos);
  setState('user', { uid: 'local', email: null });
  showAppUI();
  navigate(initialView());

  // Daha önce giriş yapıldıysa oturumu sessizce sürdür (Firebase'i o an yükler).
  if (localStorage.getItem('gezi_auth') === '1') {
    import('./auth.js')
      .then(m => m.resume())
      .catch(err => console.warn('[auth] oturum sürdürülemedi:', err));
  }
}

bootLocal();

// --- SVG Icons ---

function iconGaleri() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>`;
}

function iconHarita() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </svg>`;
}

function iconPano() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6" y1="20" x2="6" y2="13"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="18" y1="20" x2="18" y2="9"/>
  </svg>`;
}
