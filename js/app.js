/* Gezi Pro — bootstrap.
   Tek kullanıcı / kendi telefonu: AUTH DEVRE DIŞI. Uygulama doğrudan
   galeri/harita'ya açılır ve Firebase config GEREKTİRMEZ — boot yolunda
   hiç firebase import edilmez, bu yüzden config'siz ve çevrimdışı da açılır.

   Auth'u geri açmak için:  AUTH_ENABLED = true
   (Login + Firebase senkron akışı js/auth.js'de korunuyor; sprint sonunda
   etkinleştirilecek.) */

import { setState, subscribe } from './state.js';
import { getAllPhotos } from './idb.js';
import { openPhotoForm } from './components/photoForm.js';

import { GaleriView } from './views/galeri.js';
import { HaritaView } from './views/harita.js';

const AUTH_ENABLED = false;   // <-- Auth en sona bırakıldı.

const VIEWS = {
  galeri: GaleriView,
  harita: HaritaView,
};

const NAV_ITEMS = [
  { key: 'galeri', label: 'Galeri', icon: iconGaleri() },
  { key: 'harita', label: 'Harita', icon: iconHarita() },
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

// --- FAB (foto ekleme) ---

const _fileInput = document.createElement('input');
_fileInput.type = 'file';
_fileInput.accept = 'image/*';   // mobilde galeri/kamera seçimi sunar
_fileInput.style.display = 'none';
document.body.appendChild(_fileInput);

document.getElementById('fabBtn').addEventListener('click', () => _fileInput.click());

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

/** Auth'suz boot: offline-first, tek kullanıcı. Firebase'e dokunmaz. */
async function bootLocal() {
  const photos = await getAllPhotos();   // IndexedDB source-of-truth
  setState('photos', photos);
  setState('user', { uid: 'local', email: null });
  showAppUI();
  navigate(initialView());
}

if (AUTH_ENABLED) {
  // Firebase yalnızca burada (dinamik) yüklenir; boot yolunu temiz tutar.
  import('./auth.js')
    .then(m => m.startAuthFlow())
    .catch(err => { console.error('[auth] yüklenemedi, local boot:', err); bootLocal(); });
} else {
  document.getElementById('logoutBtn')?.style.setProperty('display', 'none');
  bootLocal();
}

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
