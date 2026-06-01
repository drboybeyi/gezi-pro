/* Gezi Pro — IndexedDB source-of-truth (offline-first).
   İki store:
     - photos    : hafif metadata + thumbnail (state'e yüklenir, render bunu kullanır)
     - originals  : tam çözünürlüklü orijinal blob'lar (yalnız gerektiğinde okunur;
                    Sprint 3'te Firebase Storage'a bu yüklenecek)
   Firebase yalnızca senkron katmanıdır (bkz. db.js). */

const DB_NAME    = 'gezi-pro';
const DB_VERSION = 2;
const STORE      = 'photos';
const ORIG       = 'originals';

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
      }
      if (!idb.objectStoreNames.contains(ORIG)) {
        idb.createObjectStore(ORIG, { keyPath: 'id' }); // { id, blob }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

function store(name, mode) {
  return openDB().then(idb => idb.transaction(name, mode).objectStore(name));
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

// --- photos (metadata) ---

export async function getAllPhotos() {
  const s = await store(STORE, 'readonly');
  const all = await reqToPromise(s.getAll());
  return all.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0)); // en yeni üstte
}

export async function getPhoto(id) {
  const s = await store(STORE, 'readonly');
  return reqToPromise(s.get(id));
}

export async function putPhoto(photo) {
  const s = await store(STORE, 'readwrite');
  await reqToPromise(s.put(photo));
  return photo.id;
}

export async function bulkPut(photos) {
  const s = await store(STORE, 'readwrite');
  await Promise.all(photos.map(p => reqToPromise(s.put(p))));
}

export async function deletePhoto(id) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const t = idb.transaction([STORE, ORIG], 'readwrite');
    t.objectStore(STORE).delete(id);
    t.objectStore(ORIG).delete(id);
    t.oncomplete = () => resolve();
    t.onerror    = () => reject(t.error);
  });
}

export async function clearAll() {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const t = idb.transaction([STORE, ORIG], 'readwrite');
    t.objectStore(STORE).clear();
    t.objectStore(ORIG).clear();
    t.oncomplete = () => resolve();
    t.onerror    = () => reject(t.error);
  });
}

// --- originals (tam çözünürlük blob) ---

export async function putOriginal(id, blob) {
  const s = await store(ORIG, 'readwrite');
  return reqToPromise(s.put({ id, blob }));
}

export async function getOriginal(id) {
  const s = await store(ORIG, 'readonly');
  const rec = await reqToPromise(s.get(id));
  return rec?.blob || null;
}
