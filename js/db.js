/* Gezi Pro — Firebase senkron motoru (IndexedDB <-> Realtime DB).
   Model: last-write-wins (updatedAt), silmede tombstone ({deleted,updatedAt}).
   Storage YOK — yalnız metadata + thumbnail. IndexedDB ana kaynak.

   startSync():
     1) reconcile — uzak ile local'i birleştir: local-only kayıtlar BULUTA
        yüklenir (ilk girişte yerlerin kaybolmaz), uzak-only kayıtlar local'e
        iner, çakışmada yeni updatedAt kazanır.
     2) canlı dinleyiciler (uzak -> local).
     3) sync-hooks kancaları (local değişiklik -> uzak push).
   stopSync(): dinleyicileri bırak + kancaları temizle. */

import { db } from './firebase-config.js';
import {
  ref, get, set, update,
  onChildAdded, onChildChanged, onChildRemoved, onValue, off,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import {
  getAllPhotos, bulkPut, putPhoto, deletePhoto, getPhoto,
  getAllCategories, bulkPutCategories, putCategory, deleteCategoryRecord,
} from './idb.js';
import { setState } from './state.js';
import { loadCategories, DEFAULT_CATEGORY } from './categories.js';
import { setSyncHooks, clearSyncHooks } from './sync-hooks.js';

let _uid = null;
let _unsubs = [];

export function setCurrentUser(uid) { _uid = uid; }
export function getUid() { return _uid; }

function userRef(path) { return ref(db, `users/${_uid}/${path}`); }

/** undefined alanları temizle (RTDB undefined kabul etmez) + blob düşür. */
const clean = (o) => JSON.parse(JSON.stringify(o));

/** Local IndexedDB'yi state'e yükle (offline-first ilk render). */
export async function hydrateFromLocal() {
  const photos = await getAllPhotos();
  setState('photos', photos);
  return photos;
}

/** RTDB bağlantısını doğrula (`.info/connected`); timeout içinde gelmezse false. */
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

// ---- Push (local -> uzak); sync-hooks üzerinden çağrılır ----

function pushPhoto(rec) {
  if (!_uid) return;
  set(userRef(`photos/${rec.id}`), clean({ ...rec, updatedAt: rec.updatedAt || Date.now() }))
    .catch(e => console.warn('[db] pushPhoto', e));
}
function pushPhotoDelete(id) {
  if (!_uid) return;
  set(userRef(`photos/${id}`), { deleted: true, updatedAt: Date.now() })
    .catch(e => console.warn('[db] pushPhotoDelete', e));
}
function pushCategory(cat) {
  if (!_uid) return;
  set(userRef(`categories/${cat.key}`), clean({ ...cat, updatedAt: cat.updatedAt || Date.now() }))
    .catch(e => console.warn('[db] pushCategory', e));
}
function pushCategoryDelete(key) {
  if (!_uid) return;
  set(userRef(`categories/${key}`), { deleted: true, updatedAt: Date.now() })
    .catch(e => console.warn('[db] pushCategoryDelete', e));
}

// ---- State tazeleme (debounce: dinleyici patlamalarında tek render) ----

let _pT = null, _cT = null;
function schedulePhotoRefresh() {
  clearTimeout(_pT);
  _pT = setTimeout(async () => { setState('photos', await getAllPhotos()); }, 120);
}
function scheduleCatRefresh() {
  clearTimeout(_cT);
  _cT = setTimeout(() => { loadCategories(); }, 120);  // cache + state('categories')
}

// ---- Canlı: uzak -> local ----

async function applyRemotePhoto(snap) {
  const id = snap.key, r = snap.val();
  if (!r) return;
  const local = await getPhoto(id);
  if (r.deleted) { if (local) { await deletePhoto(id); schedulePhotoRefresh(); } return; }
  if (local && (local.updatedAt || 0) >= (r.updatedAt || 0)) return;  // kendi echo'muz / eski
  const { deleted, ...rec } = r;
  await putPhoto(rec);
  schedulePhotoRefresh();
}
async function removeRemotePhoto(snap) {
  const local = await getPhoto(snap.key);
  if (local) { await deletePhoto(snap.key); schedulePhotoRefresh(); }
}

async function applyRemoteCategory(snap) {
  const key = snap.key, r = snap.val();
  if (!r) return;
  if (r.deleted) {
    if (key !== DEFAULT_CATEGORY) { await deleteCategoryRecord(key); scheduleCatRefresh(); }
    return;
  }
  const local = (await getAllCategories()).find(c => c.key === key);
  if (local && (local.updatedAt || 0) >= (r.updatedAt || 0)) return;
  const { deleted, ...cat } = r;
  await putCategory(cat);
  scheduleCatRefresh();
  schedulePhotoRefresh();   // galeri/harita rozet renkleri de yenilensin
}
async function removeRemoteCategory(snap) {
  if (snap.key === DEFAULT_CATEGORY) return;
  await deleteCategoryRecord(snap.key);
  scheduleCatRefresh();
}

// ---- Reconcile (ilk birleştirme) ----

/** Genel LWW birleştirici: union(uzak,local) -> {localPuts, localDels, remoteUpdates}. */
function mergePlan(remote, localMap, idKey) {
  const ids = new Set([...Object.keys(remote), ...Object.keys(localMap)]);
  const localPuts = [], localDels = [], remoteUpdates = {};
  for (const id of ids) {
    const r = remote[id], l = localMap[id];
    const ru = r?.updatedAt || 0, lu = l?.updatedAt || 0;
    if (r && l) {
      if (ru > lu) {
        if (r.deleted) localDels.push(id);
        else { const { deleted, ...rec } = r; localPuts.push(rec); }
      } else if (lu > ru) {
        remoteUpdates[id] = clean({ ...l, updatedAt: lu });
      }
    } else if (l && !r) {
      const updatedAt = l.updatedAt || l.createdAt || l.takenAt || Date.now();
      remoteUpdates[id] = clean({ ...l, updatedAt });
      if (l.updatedAt !== updatedAt) localPuts.push({ ...l, updatedAt });   // local damgayı sabitle
    } else if (r && !l && !r.deleted) {
      const { deleted, ...rec } = r;
      localPuts.push(rec);
    }
  }
  return { localPuts, localDels, remoteUpdates };
}

async function reconcileCategories() {
  const snap = await get(userRef('categories'));
  const remote = snap.val() || {};
  const localMap = Object.fromEntries((await getAllCategories()).map(c => [c.key, c]));
  const { localPuts, localDels, remoteUpdates } = mergePlan(remote, localMap, 'key');
  if (localPuts.length) await bulkPutCategories(localPuts);
  for (const key of localDels) if (key !== DEFAULT_CATEGORY) await deleteCategoryRecord(key);
  if (Object.keys(remoteUpdates).length) await update(userRef('categories'), remoteUpdates);
  await loadCategories();   // cache + state('categories')
}

async function reconcilePhotos() {
  const snap = await get(userRef('photos'));
  const remote = snap.val() || {};
  const localMap = Object.fromEntries((await getAllPhotos()).map(p => [p.id, p]));
  const { localPuts, localDels, remoteUpdates } = mergePlan(remote, localMap, 'id');
  if (localPuts.length) await bulkPut(localPuts);
  for (const id of localDels) await deletePhoto(id);
  if (Object.keys(remoteUpdates).length) await update(userRef('photos'), remoteUpdates);
  setState('photos', await getAllPhotos());
}

// ---- Yaşam döngüsü ----

function attachLive() {
  detachLive();
  const pRef = userRef('photos'), cRef = userRef('categories');
  _unsubs = [
    onChildAdded(pRef, applyRemotePhoto),
    onChildChanged(pRef, applyRemotePhoto),
    onChildRemoved(pRef, removeRemotePhoto),
    onChildAdded(cRef, applyRemoteCategory),
    onChildChanged(cRef, applyRemoteCategory),
    onChildRemoved(cRef, removeRemoteCategory),
  ];
}
function detachLive() {
  _unsubs.forEach(u => { try { u(); } catch {} });
  _unsubs = [];
}

/** Giriş sonrası: kancalar + reconcile + canlı dinleyiciler. */
export async function startSync() {
  if (!_uid) return;
  setSyncHooks({
    photoChanged:    pushPhoto,
    photoDeleted:    pushPhotoDelete,
    categoryChanged: pushCategory,
    categoryDeleted: pushCategoryDelete,
  });
  try {
    await reconcileCategories();   // önce kategoriler (catOf bilsin), sonra fotoğraflar
    await reconcilePhotos();
  } finally {
    // Reconcile çevrimdışı başarısız olsa bile canlı dinleyiciler bağlansın
    // (bağlantı dönünce uzak değişiklikler akar).
    attachLive();
  }
}

export function stopSync() {
  detachLive();
  clearSyncHooks();
}
