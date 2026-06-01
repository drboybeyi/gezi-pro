/* Gezi Pro — IndexedDB source-of-truth (offline-first).
   Tüm okuma/yazma önce burada olur; Firebase yalnızca senkron katmanıdır
   (bkz. db.js). Sprint 1: şema + CRUD iskeleti. Foto blob/thumbnail
   yazımı ve senkron alanları sonraki sprintte doldurulacak. */

const DB_NAME    = 'gezi-pro';
const DB_VERSION = 1;
const STORE      = 'photos';

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORE)) {
        const store = idb.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('takenAt', 'takenAt');     // galeri sıralaması
        store.createIndex('syncState', 'syncState'); // 'local' | 'synced' | 'pending'
        // lat/lng harita için; coğrafi index gerekmiyor (client-side filtre).
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(mode) {
  return openDB().then(idb => idb.transaction(STORE, mode).objectStore(STORE));
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

// --- CRUD ---

export async function getAllPhotos() {
  const store = await tx('readonly');
  const all = await reqToPromise(store.getAll());
  // En yeni üstte.
  return all.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
}

export async function getPhoto(id) {
  const store = await tx('readonly');
  return reqToPromise(store.get(id));
}

export async function putPhoto(photo) {
  const store = await tx('readwrite');
  await reqToPromise(store.put(photo));
  return photo.id;
}

export async function bulkPut(photos) {
  const store = await tx('readwrite');
  await Promise.all(photos.map(p => reqToPromise(store.put(p))));
}

export async function deletePhoto(id) {
  const store = await tx('readwrite');
  return reqToPromise(store.delete(id));
}

export async function clearAll() {
  const store = await tx('readwrite');
  return reqToPromise(store.clear());
}
