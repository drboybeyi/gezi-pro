/* Gezi Pro — IndexedDB source-of-truth (offline-first).
   Üç store:
     - photos     : hafif metadata + thumbnail (state'e yüklenir, render bunu kullanır)
     - originals  : tam çözünürlüklü orijinal blob'lar (yalnız gerektiğinde okunur;
                    Sprint 3'te Firebase Storage'a bu yüklenecek)
     - categories : kullanıcı yönetimli kategoriler ({ key, label, color, ... });
                    tek kaynak burası, ilk açılışta varsayılanlarla tohumlanır (bkz. categories.js)
   Firebase yalnızca senkron katmanıdır (bkz. db.js). */

const DB_NAME    = 'gezi-pro';
const DB_VERSION = 3;
const STORE      = 'photos';
const ORIG       = 'originals';
const CATS       = 'categories';

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
      if (!idb.objectStoreNames.contains(CATS)) {
        idb.createObjectStore(CATS, { keyPath: 'key' }); // { key, label, color, fg, emoji, order }
        // Not: varsayılan tohumlama categories.js loadCategories()'te (store boşsa) yapılır.
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

// --- categories (kullanıcı yönetimli) ---

export async function getAllCategories() {
  const s = await store(CATS, 'readonly');
  return reqToPromise(s.getAll());
}

export async function putCategory(cat) {
  const s = await store(CATS, 'readwrite');
  await reqToPromise(s.put(cat));
  return cat.key;
}

export async function bulkPutCategories(cats) {
  const s = await store(CATS, 'readwrite');
  await Promise.all(cats.map(c => reqToPromise(s.put(c))));
}

export async function deleteCategoryRecord(key) {
  const s = await store(CATS, 'readwrite');
  return reqToPromise(s.delete(key));
}

/** Bir kategori silinince ondaki tüm fotoğrafları `toKey`'e taşı (tek transaction).
    @returns {Promise<number>} taşınan fotoğraf sayısı. */
export async function reassignPhotosCategory(fromKey, toKey) {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const t = idb.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    let moved = 0;
    s.openCursor().onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) return;
      if (cur.value.category === fromKey) {
        cur.update({ ...cur.value, category: toKey });
        moved++;
      }
      cur.continue();
    };
    t.oncomplete = () => resolve(moved);
    t.onerror    = () => reject(t.error);
  });
}
