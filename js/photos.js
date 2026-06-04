/* Gezi Pro — foto ekleme servisi (offline-first, local).
   Akış: dosya -> EXIF GPS oku -> yoksa cihaz konumu -> thumbnail üret ->
   IndexedDB (metadata + orijinal) -> state güncelle.
   Firebase Storage'a yükleme + senkron: Sprint 3 (Auth ile birlikte). */

import { putPhoto, putOriginal, getAllPhotos, getPhoto, deletePhoto, deleteOriginal } from './idb.js';
import { setState } from './state.js';
import { readExif, getDeviceLocation } from './utils/exif.js';
import { makeThumbnail } from './utils/thumbnail.js';
import { DEFAULT_CATEGORY } from './categories.js';
import { onPhotoChanged, onPhotoDeleted } from './sync-hooks.js';

function uid() {
  return (crypto.randomUUID?.() ||
    `p${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`);
}

/**
 * Bir promise'i zaman aşımına/ hataya karşı sarmalar. ASLA reject etmez:
 * süre dolarsa ya da promise reject ederse `fallback` ile resolve eder.
 * Böylece hiçbir adım akışı kilitleyemez.
 */
function withTimeout(promise, ms, fallback, label) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => {
      if (!done) { console.warn(`[photos] ${label}: ${ms}ms zaman aşımı — atlanıyor`); finish(fallback); }
    }, ms);
    Promise.resolve(promise).then(finish, (e) => {
      console.warn(`[photos] ${label}: hata — atlanıyor`, e);
      finish(fallback);
    });
  });
}

/** state['photos']'ı IndexedDB'den yeniden yükle. */
export async function refresh() {
  setState('photos', await getAllPhotos());
}

/**
 * Dosyadan kaydedilmemiş bir taslak kayıt üretir: konumu çözer + thumbnail.
 * (photoForm önce bunu çağırır, kullanıcı başlık/not girer, sonra savePhoto.)
 * @returns {Promise<{record:object, original:Blob}>}
 */
/** Tek dosyadan foto girdisi (thumbnail) üretir — KONUM OKUMAZ. */
async function buildPhotoEntry(file, now) {
  const thumb = await withTimeout(makeThumbnail(file), 10000, null, 'THUMB');
  return {
    photo: {
      id: uid(),
      thumb: thumb?.dataUrl || null,
      w: thumb?.width || 0, h: thumb?.height || 0,
      takenAt: file.lastModified || now, createdAt: now,
    },
    blob: file,
  };
}

export async function buildDraft(files) {
  const list = Array.isArray(files) ? files : [files];
  const first = list[0];
  console.log(`[photos] buildDraft başladı: ${list.length} dosya, ilk:`, first.name, first.type, `${Math.round(first.size/1024)}KB`);

  // ===== KONUM OKUMA (yalnız İLK fotoğraftan) — DEĞİŞTİRİLMEDİ =====
  // 1) EXIF — 3sn timeout. Takılırsa/başarısızsa konumsuz devam.
  const exif = await withTimeout(
    readExif(first), 3000, { lat: null, lng: null, takenAt: null }, 'EXIF');

  let lat = exif.lat, lng = exif.lng, locSource = 'none', locError = null;

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    locSource = 'exif';
  } else {
    // 2) Cihaz konumu — 8sn timeout (iç + dış güvenlik ağı). Gelmezse konumsuz.
    const dev = await withTimeout(
      getDeviceLocation(8000), 9000, { error: 'timeout' }, 'GEO');
    if (Number.isFinite(dev?.lat) && Number.isFinite(dev?.lng)) {
      lat = dev.lat; lng = dev.lng; locSource = 'device';
    } else {
      lat = null; lng = null; locSource = 'none';
      locError = dev?.error || 'timeout';
    }
  }
  // ===== /KONUM =====

  const now = Date.now();
  // 3) Tüm dosyalar için thumbnail. İlk fotonun takenAt'i EXIF tarihini tercih eder.
  const entries = [];
  for (const f of list) entries.push(await buildPhotoEntry(f, now));
  if (entries[0]) entries[0].photo.takenAt = exif.takenAt || entries[0].photo.takenAt;

  const record = {
    id: uid(),
    title: '',
    note: '',
    category: DEFAULT_CATEGORY,   // formdaki seçici üzerine yazar
    lat, lng, locSource, locError,
    takenAt: exif.takenAt || first.lastModified || now,
    createdAt: now,
    syncState: 'local',
    photos: entries.map(e => e.photo),
  };
  const originals = entries.map(e => ({ id: e.photo.id, blob: e.blob }));
  console.log(`[photos] taslak hazır: ${record.photos.length} foto, locSource=${locSource} locError=${locError}`);
  return { record, originals };
}

/** Taslağı (başlık/not düzenlenmiş) kalıcı kaydet + state'i tazele.
    originals: [{ id, blob }] — her orijinal photoId altında (yalnız local). */
export async function savePhoto(record, originals = []) {
  record.updatedAt = Date.now();          // senkron (last-write-wins) için
  await putPhoto(record);
  for (const o of originals) if (o?.blob) await putOriginal(o.id, o.blob);
  await refresh();
  onPhotoChanged(record);                 // giriş varsa buluta push (yoksa no-op)
  return record.id;
}

/** Mevcut yere sonradan foto(lar) ekle (KONUM OKUMAZ — yer konumu sabit). */
export async function addPhotosToPlace(placeId, files) {
  const place = await getPhoto(placeId);
  if (!place) return null;
  const list = Array.from(files || []);
  if (!list.length) return place;
  const now = Date.now();
  const added = [];
  for (const f of list) {
    const e = await buildPhotoEntry(f, now);
    await putOriginal(e.photo.id, e.blob);
    added.push(e.photo);
  }
  const next = { ...place, photos: [...(place.photos || []), ...added], updatedAt: now };
  await putPhoto(next);
  await refresh();
  onPhotoChanged(next);
  return next;
}

/** Yerden tek foto sil. Son foto silinirse yerin tamamı silinir.
    @returns {object|null} güncel yer; yer silindiyse null. */
export async function removePhotoFromPlace(placeId, photoId) {
  const place = await getPhoto(placeId);
  if (!place) return null;
  const remaining = (place.photos || []).filter(p => p.id !== photoId);
  await deleteOriginal(photoId);          // local orijinal (B2: Storage'dan da)
  if (!remaining.length) { await removePhoto(placeId); return null; }  // son foto -> yeri sil
  const next = { ...place, photos: remaining, updatedAt: Date.now() };
  await putPhoto(next);
  await refresh();
  onPhotoChanged(next);
  return next;
}

export async function removePhoto(id) {
  await deletePhoto(id);
  await refresh();
  onPhotoDeleted(id);                      // buluta tombstone
}

/** Toplu silme: hepsini sil, TEK refresh, her biri için tombstone push. */
export async function removePhotos(ids) {
  if (!ids?.length) return;
  for (const id of ids) await deletePhoto(id);
  await refresh();
  ids.forEach(id => onPhotoDeleted(id));
}

/** Var olan bir kaydı kısmen güncelle (ör. kategori değişimi) + state tazele. */
export async function updatePhoto(id, patch) {
  const cur = await getPhoto(id);
  if (!cur) return;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await putPhoto(next);
  await refresh();
  onPhotoChanged(next);
}
