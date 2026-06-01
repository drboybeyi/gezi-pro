/* Gezi Pro — foto ekleme servisi (offline-first, local).
   Akış: dosya -> EXIF GPS oku -> yoksa cihaz konumu -> thumbnail üret ->
   IndexedDB (metadata + orijinal) -> state güncelle.
   Firebase Storage'a yükleme + senkron: Sprint 3 (Auth ile birlikte). */

import { putPhoto, putOriginal, getAllPhotos, getPhoto, deletePhoto } from './idb.js';
import { setState } from './state.js';
import { readExif, getDeviceLocation } from './utils/exif.js';
import { makeThumbnail } from './utils/thumbnail.js';
import { DEFAULT_CATEGORY } from './categories.js';

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
export async function buildDraft(file) {
  console.log('[photos] buildDraft başladı:', file.name, file.type, `${Math.round(file.size/1024)}KB`);

  // 1) EXIF — 3sn timeout. Takılırsa/başarısızsa konumsuz devam.
  const exif = await withTimeout(
    readExif(file), 3000, { lat: null, lng: null, takenAt: null }, 'EXIF');

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

  // 3) Thumbnail — 10sn timeout. Üretilemezse thumb'suz ama kaydedilebilir.
  const thumb = await withTimeout(makeThumbnail(file), 10000, null, 'THUMB');
  const takenAt = exif.takenAt || file.lastModified || Date.now();

  const record = {
    id: uid(),
    title: '',
    note: '',
    category: DEFAULT_CATEGORY,   // formdaki seçici üzerine yazar
    lat, lng, locSource, locError,
    thumb: thumb?.dataUrl || null,
    w: thumb?.width || 0, h: thumb?.height || 0,
    takenAt,
    createdAt: Date.now(),
    syncState: 'local',
  };
  console.log(`[photos] taslak hazır: locSource=${locSource} locError=${locError} thumb=${!!record.thumb}`);
  return { record, original: file };
}

/** Taslağı (başlık/not düzenlenmiş) kalıcı kaydet + state'i tazele. */
export async function savePhoto(record, originalBlob) {
  await putPhoto(record);
  if (originalBlob) await putOriginal(record.id, originalBlob);
  await refresh();
  return record.id;
}

export async function removePhoto(id) {
  await deletePhoto(id);
  await refresh();
}

/** Var olan bir kaydı kısmen güncelle (ör. kategori değişimi) + state tazele. */
export async function updatePhoto(id, patch) {
  const cur = await getPhoto(id);
  if (!cur) return;
  await putPhoto({ ...cur, ...patch });
  await refresh();
}
