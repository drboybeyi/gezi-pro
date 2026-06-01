/* Gezi Pro — Firebase senkron katmanı (IndexedDB <-> Realtime DB + Storage).
   Sprint 1: İSKELET. IndexedDB source-of-truth; bu modül onu hidrate eder
   ve view'ları beslemek için state'e yazar. Çift yönlü senkron (push/pull,
   çakışma çözümü, Storage foto yükleme) SONRAKİ SPRINT.

   Kullanım (app.js):
     setCurrentUser(uid) -> hydrateFromLocal() -> startSync()
*/

import { db } from './firebase-config.js';
import {
  ref, onValue, off
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

/** TODO(sprint2): RTDB -> local pull + local -> RTDB push + Storage upload.
    Şimdilik yalnızca dinleyiciyi kurar; gelen veriyi henüz idb'ye yazmaz. */
export function startSync() {
  if (!_uid) return;
  const r = userRef('photos');
  _listeners.photos = r;
  onValue(r, () => {
    // TODO(sprint2): snap.val() -> idb.bulkPut -> hydrateFromLocal()
  }, (err) => console.warn('[db] sync listener error', err));
}

export function stopSync() {
  Object.values(_listeners).forEach(r => off(r));
  Object.keys(_listeners).forEach(k => delete _listeners[k]);
}
