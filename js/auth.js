/* Gezi Pro — opsiyonel giriş kontrolcüsü (offline-first).
   ÖNEMLİ: Giriş ZORUNLU DEĞİL. App her zaman local açılır (bkz. app.js bootLocal);
   bu modül yalnızca İSTEĞE BAĞLI yüklenir (header "Giriş" -> dinamik import) ve
   Firebase'i o an getirir. Giriş yapılınca kullanıcı + bağlantı kurulur;
   çıkışta local moda dönülür. Veri IndexedDB'de kalır (sync: sonraki adım).

   Adım 1: auth + bağlantı testi. startSync() henüz no-op. */

import { onAuthChange, logoutUser } from './firebase-config.js';
import { setCurrentUser, stopSync, checkConnection /*, startSync*/ } from './db.js';
import { setState } from './state.js';
import { showToast } from './components/toast.js';
import { LoginView } from './views/login.js';

const AUTH_FLAG = 'gezi_auth';   // localStorage: daha önce giriş yapıldı mı (boot'ta resume için)
let _inited    = false;
let _overlay   = null;
let _seenFirst = false;          // ilk onAuthChange = mevcut durum (sessiz); sonrası = gerçek eylem

const el = (id) => document.getElementById(id);

/** Header'daki giriş/çıkış butonlarını oturum durumuna göre ayarla. */
function setHeaderAuthState(user) {
  const authBtn   = el('authBtn');
  const logoutBtn = el('logoutBtn');
  if (user) {
    if (authBtn)   authBtn.style.display = 'none';
    if (logoutBtn) { logoutBtn.style.display = ''; logoutBtn.title = `Çıkış (${user.email || ''})`; }
  } else {
    if (authBtn)   authBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

/** onAuthChange dinleyicisini bir kez kur + çıkış butonunu bağla. */
function ensureInit() {
  if (_inited) return;
  _inited = true;

  el('logoutBtn')?.addEventListener('click', () => logoutUser().catch(() => {}));

  onAuthChange(async (user) => {
    const explicit = _seenFirst;   // ilk olay sessiz (reload'da oturum sürdürme); sonrası kullanıcı eylemi
    _seenFirst = true;

    if (user) {
      localStorage.setItem(AUTH_FLAG, '1');
      setCurrentUser(user.uid);
      setState('user', { uid: user.uid, email: user.email });
      setHeaderAuthState(user);
      closeLogin();
      if (explicit) {
        showToast('Giriş yapıldı 👋', 'success');
        // Bağlantı testi (adım 1): RTDB gerçekten erişilebilir mi?
        const ok = await checkConnection();
        showToast(ok ? 'Buluta bağlı ☁️' : 'Bulut bağlantısı kurulamadı', ok ? 'info' : 'danger');
      }
      // startSync();  // ADIM 2: çift yönlü senkron burada başlayacak.
    } else {
      localStorage.removeItem(AUTH_FLAG);
      setCurrentUser(null);
      stopSync();
      setState('user', { uid: 'local', email: null });   // local moda dön
      setHeaderAuthState(null);
      if (explicit) showToast('Çıkış yapıldı', 'info');
    }
  });
}

/** Boot'ta çağrılır: daha önce giriş yapıldıysa oturumu sürdür (Firebase
    kalıcılığı sayesinde onAuthChange otomatik kullanıcıyı verir). */
export function resume() {
  ensureInit();
}

/** Header "Giriş" -> tam ekran login örtüşü. Başarı onAuthChange'de kapatır. */
export function openLogin() {
  ensureInit();
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'auth-overlay';
  const view = new LoginView();
  _overlay.innerHTML = `
    <button class="auth-close" id="authClose" aria-label="Kapat" title="Kapat (local devam)">✕</button>
    ${view.render()}`;
  document.body.appendChild(_overlay);
  view.afterRender();
  _overlay.querySelector('#authClose').addEventListener('click', closeLogin);
}

function closeLogin() {
  if (_overlay) { _overlay.remove(); _overlay = null; }
}
