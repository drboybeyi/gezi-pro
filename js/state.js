/* Gezi Pro — basit reaktif state deposu.
   IndexedDB source-of-truth'tan beslenir (bkz. idb.js); view'lar
   subscribe ile dinler. Sprint 1'de tek koleksiyon: 'photos'. */

const _state = {
  photos: [],   // [{ id, lat, lng, title, note, takenAt, thumb, ... }]
  user:   null, // { uid, email }
};

const _subs = new Map(); // key -> Set<callback>

export function getState(key) {
  return key ? _state[key] : _state;
}

export function setState(key, value) {
  _state[key] = value;
  (_subs.get(key) || []).forEach(cb => {
    try { cb(value); } catch (e) { console.error('[state] subscriber error', e); }
  });
}

export function subscribe(key, cb) {
  if (!_subs.has(key)) _subs.set(key, new Set());
  _subs.get(key).add(cb);
  return () => _subs.get(key)?.delete(cb); // unsubscribe
}
