import { onAuthChange, logoutUser } from './firebase-config.js';
import { setCurrentUser, hydrateFromLocal, startSync, stopSync } from './db.js';
import { setState, getState, subscribe } from './state.js';
import { showToast } from './components/toast.js';

import { LoginView  } from './views/login.js';
import { GaleriView } from './views/galeri.js';
import { HaritaView } from './views/harita.js';

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
let _authenticated = false;

// --- Auth ---

onAuthChange(async user => {
  if (user) {
    setCurrentUser(user.uid);
    setState('user', { uid: user.uid, email: user.email });
    await hydrateFromLocal();   // offline-first: önce localden render
    startSync();                // sprint1: dinleyici iskeleti
    _authenticated = true;
    showAppUI();
    navigate(initialView());
  } else {
    stopSync();
    _authenticated = false;
    setState('user', null);
    teardownView();
    hideAppUI();
    renderLogin();
  }
});

function initialView() {
  const hash = (location.hash.replace('#', '') || '').trim();
  return VIEWS[hash] ? hash : 'galeri';
}

// --- UI Show/Hide ---

function showAppUI() {
  document.querySelector('.header').style.display = 'flex';
  document.querySelector('.bottom-nav').style.display = 'flex';
  document.querySelector('.fab').style.display = 'flex';
}

function hideAppUI() {
  document.querySelector('.header').style.display = 'none';
  document.querySelector('.bottom-nav').style.display = 'none';
  document.querySelector('.fab').style.display = 'none';
}

// --- Login ---

function renderLogin() {
  const app  = document.getElementById('app');
  const view = new LoginView();
  app.innerHTML = view.render();
  view.afterRender();
}

// --- Router ---

function teardownView() {
  _viewInstance?.destroy?.();
  _viewInstance = null;
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
  if (!_authenticated) return;
  const hash = location.hash.replace('#', '') || 'galeri';
  if (hash !== _currentView) navigate(hash);
});

// --- Header foto sayacı ---

subscribe('photos', (photos) => {
  const el = document.getElementById('headerCount');
  if (el) el.textContent = photos?.length ? `${photos.length} yer` : '';
});

// --- Logout ---

document.getElementById('logoutBtn').addEventListener('click', () => logoutUser());

// --- FAB (foto ekleme: SPRINT 2) ---

document.getElementById('fabBtn').addEventListener('click', () => {
  showToast('Fotoğraf ekleme sonraki sprintte gelecek 📷', 'info');
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
    el.addEventListener('click', () => {
      if (!_authenticated) return;
      navigate(el.dataset.view);
    });
  });
})();

// --- Service Worker ---

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
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
