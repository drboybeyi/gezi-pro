/* Gezi Pro — Firebase senkron katmanı (IndexedDB <-> Realtime DB).
   ADIM 1 (BU ADIM): yalnızca kullanıcı kimliği + bağlantı testi.
   Çift yönlü senkron (push/pull, ilk girişte local yükleme, çakışma çözümü)
   SONRAKİ ADIM — startSync/stopSync şimdilik iskelet.

   Storage YOK: fotoğraf orijinalleri buluta gitmez; yalnız metadata + thumbnail.
   IndexedDB ana kaynak; giriş olmadan da app local çalışır. */

import { db } from './firebase-config.js';
import {
  ref, onValue, off,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import { getAllPhotos } from './idb.js';
import { setState } from './state.js';

let _uid = null;
const _listeners = {};

export function setCurrentUser(uid) { _uid = uid; }
export function getUid() { return _uid; }

function userRef(path) { return ref(db, `users/${_uid}/${path}`); }

/** Local IndexedDB'yi state'e yükle (offline-first ilk render). */
export async function hydrateFromLocal() {
  const photos = await getAllPhotos();
  setState('photos', photos);
  return photos;
}

/** RTDB bağlantısını doğrula. `.info/connected` ilk `true` gelene kadar bekler;
    `timeoutMs` içinde gelmezse false döner. (Adım 1 test kancası.) */
export function checkConnection(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const r = ref(db, '.info/connected');
    let done = false;
    const finish = (v) => { if (!done) { done = true; off(r, 'value', handler); clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => finish(false), timeoutMs);
    const handler = (snap) => { if (snap.val() === true) finish(true); };
    onValue(r, handler, () => finish(false));
  });
}

/** TODO(adım 2): RTDB <-> idb çift yönlü senkron + ilk girişte local push. */
export function startSync() {
  if (!_uid) return;
  // İskelet: dinleyici yok. Sonraki adımda push/pull burada kurulacak.
}

export function stopSync() {
  Object.values(_listeners).forEach(r => off(r));
  Object.keys(_listeners).forEach(k => delete _listeners[k]);
}
