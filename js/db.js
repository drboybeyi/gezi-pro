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

import { db, storage } from './firebase-config.js';
import {
  ref, get, set, update,
  onChildAdded, onChildChanged, onChildRemoved, onValue, off,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import {
  ref as sRef, uploadBytes, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';
import {
  getAllPhotos, bulkPut, putPhoto, deletePhoto, getPhoto, getOriginal,
  getAllCategories, bulkPutCategories, putCategory, deleteCategoryRecord,
} from './idb.js';
import { setState } from './state.js';
import { loadCategories, DEFAULT_CATEGORY } from './categories.js';
import { setSyncHooks, clearSyncHooks } from './sync-hooks.js';
import { setOriginalDownloader, clearOriginalDownloader } from './originals-bridge.js';

let _uid = null;
let _unsubs = [];
let _connUnsub = null;      // sürekli .info/connected izleyicisi
let _connected = false;
let _syncing   = false;

// Silme-tombstone'ları bu süreden eskiyse RTDB'den tamamen kaldırılır.
// 30 gün: çevrimdışı bir cihazın silmeyi öğrenmesi için güvenli pencere.
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function setCurrentUser(uid) { _uid = uid; }
export function getUid() { return _uid; }

function userRef(path) { return ref(db, `users/${_uid}/${path}`); }

// ---- Senkron durum göstergesi (state('sync'): syncing|online|offline|null) ----

/** Mevcut bayraklardan durum string'ini hesapla ve state'e yaz. */
function reflectSync() {
  if (!_uid) { setState('sync', null); return; }
  setState('sync', _syncing ? 'syncing' : (_connected ? 'online' : 'offline'));
}

function startConnMonitor() {
  stopConnMonitor();
  const r = ref(db, '.info/connected');
  const handler = (snap) => { _connected = (snap.val() === true); reflectSync(); };
  onValue(r, handler);
  _connUnsub = () => off(r, 'value', handler);
}
function stopConnMonitor() {
  if (_connUnsub) { try { _connUnsub(); } catch {} _connUnsub = null; }
}

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

/** TTL'i geçmiş silme-tombstone'ları için RTDB silme yaması ({key: null}). */
function tombstonePurges(remote) {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const purges = {};
  for (const k in remote) {
    const r = remote[k];
    if (r && r.deleted && (r.updatedAt || 0) < cutoff) purges[k] = null;
  }
  return purges;
}

async function reconcileCategories() {
  const snap = await get(userRef('categories'));
  const remote = snap.val() || {};
  const localMap = Object.fromEntries((await getAllCategories()).map(c => [c.key, c]));
  const { localPuts, localDels, remoteUpdates } = mergePlan(remote, localMap, 'key');
  if (localPuts.length) await bulkPutCategories(localPuts);
  for (const key of localDels) if (key !== DEFAULT_CATEGORY) await deleteCategoryRecord(key);
  const purges = tombstonePurges(remote);
  const writes = { ...remoteUpdates, ...purges };
  if (Object.keys(writes).length) await update(userRef('categories'), writes);
  if (Object.keys(purges).length) console.log(`[db] ${Object.keys(purges).length} kategori tombstone temizlendi`);
  await loadCategories();   // cache + state('categories')
}

async function reconcilePhotos() {
  const snap = await get(userRef('photos'));
  const remote = snap.val() || {};
  const localMap = Object.fromEntries((await getAllPhotos()).map(p => [p.id, p]));
  const { localPuts, localDels, remoteUpdates } = mergePlan(remote, localMap, 'id');
  if (localPuts.length) await bulkPut(localPuts);
  for (const id of localDels) await deletePhoto(id);
  const purges = tombstonePurges(remote);
  const writes = { ...remoteUpdates, ...purges };
  if (Object.keys(writes).length) await update(userRef('photos'), writes);
  if (Object.keys(purges).length) console.log(`[db] ${Object.keys(purges).length} foto tombstone temizlendi`);
  setState('photos', await getAllPhotos());
}

// ---- Storage: tam çözünürlüklü orijinaller ----

function storagePathFor(placeId, photoId) { return `users/${_uid}/${placeId}/${photoId}`; }

/** Bir yerin verilen foto dosyalarını Storage'dan sil (yoksa sessiz geç). */
async function deleteStorageFiles(placeId, photoIds) {
  if (!_uid || !photoIds?.length) return;
  for (const pid of photoIds) {
    try { await deleteObject(sRef(storage, storagePathFor(placeId, pid))); }
    catch (e) { if (e?.code !== 'storage/object-not-found') console.warn('[storage] sil', e); }
  }
}

/** storagePath -> indirme URL'i (photoViewer için; <img src> CORS gerektirmez). */
async function downloadOriginal(storagePath) {
  return getDownloadURL(sRef(storage, storagePath));
}

let _uploading = false, _uploadAgain = false, _upT = null;
function scheduleUpload() { clearTimeout(_upT); _upT = setTimeout(runUpload, 400); }
async function runUpload() {
  if (!_uid || _uploading) { if (_uploading) _uploadAgain = true; return; }
  _uploading = true;
  try { await uploadPendingOriginals(); }
  catch (e) { console.warn('[storage] yükleme turu', e); }
  finally { _uploading = false; if (_uploadAgain) { _uploadAgain = false; scheduleUpload(); } }
}

/** storagePath'i olmayan ama yerel orijinali bulunan tüm fotoğrafları yükle;
    yükleyince storagePath'i kayda işle + RTDB'ye yansıt. */
async function uploadPendingOriginals() {
  if (!_uid) return;
  let uploaded = 0;
  const places = await getAllPhotos();
  for (const place of places) {
    let changed = false;
    for (const ph of place.photos || []) {
      if (ph.storagePath) continue;
      const blob = await getOriginal(ph.id);
      if (!blob) continue;                       // yerel orijinal yok -> atla
      const path = storagePathFor(place.id, ph.id);
      try { await uploadBytes(sRef(storage, path), blob); ph.storagePath = path; changed = true; uploaded++; }
      catch (e) { console.warn('[storage] yükle', path, e); }
    }
    if (changed) {
      const next = { ...place, updatedAt: Date.now() };
      await putPhoto(next);
      pushPhoto(next);                            // storagePath'leri RTDB'ye yansıt
    }
  }
  if (uploaded) console.log(`[storage] ${uploaded} orijinal yüklendi`);
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
    photoChanged:      (p) => { pushPhoto(p); scheduleUpload(); },  // thumb -> RTDB, orijinal -> Storage
    photoDeleted:      pushPhotoDelete,
    categoryChanged:   pushCategory,
    categoryDeleted:   pushCategoryDelete,
    photoFilesDeleted: deleteStorageFiles,
  });
  setOriginalDownloader(downloadOriginal);   // viewer yerel orijinal yoksa Storage'dan indirir
  _syncing = true;
  startConnMonitor();   // bağlantı durumunu sürekli izle (online/offline)
  reflectSync();        // -> 'syncing'
  try {
    await reconcileCategories();   // önce kategoriler (catOf bilsin), sonra fotoğraflar
    await reconcilePhotos();
    scheduleUpload();              // girişte bekleyen orijinalleri (storagePath'siz) yükle
  } finally {
    // Reconcile çevrimdışı başarısız olsa bile canlı dinleyiciler bağlansın
    // (bağlantı dönünce uzak değişiklikler akar).
    attachLive();
    _syncing = false;
    reflectSync();      // -> 'online' / 'offline'
  }
}

export function stopSync() {
  detachLive();
  stopConnMonitor();
  clearSyncHooks();
  clearOriginalDownloader();
  clearTimeout(_upT); _uploading = false; _uploadAgain = false;
  _syncing = false;
  _connected = false;
  setState('sync', null);   // çıkışta rozet gizlenir
}
