/* Gezi Pro — foto ekleme servisi (offline-first, local).
   Akış: dosya -> EXIF GPS oku -> yoksa cihaz konumu -> thumbnail üret ->
   IndexedDB (metadata + orijinal) -> state güncelle.
   Firebase Storage'a yükleme + senkron: Sprint 3 (Auth ile birlikte). */

import { putPhoto, putOriginal, getAllPhotos, deletePhoto } from './idb.js';
import { setState } from './state.js';
import { readExif, getDeviceLocation } from './utils/exif.js';
import { makeThumbnail } from './utils/thumbnail.js';

function uid() {
  return (crypto.randomUUID?.() ||
    `p${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`);
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
  const exif = await readExif(file);
  let lat = exif.lat, lng = exif.lng, locSource = 'exif';

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const dev = await getDeviceLocation();
    if (dev) { lat = dev.lat; lng = dev.lng; locSource = 'device'; }
    else     { lat = null;    lng = null;    locSource = 'none'; }
  }

  const thumb = await makeThumbnail(file);
  const takenAt = exif.takenAt || file.lastModified || Date.now();

  const record = {
    id: uid(),
    title: '',
    note: '',
    lat, lng, locSource,
    thumb: thumb.dataUrl,
    w: thumb.width, h: thumb.height,
    takenAt,
    createdAt: Date.now(),
    syncState: 'local',
  };
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
