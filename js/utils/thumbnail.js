/* Gezi Pro — thumbnail üretimi. SPRINT 2 (foto ekleme akışında kullanılacak).
   Plan: createImageBitmap + canvas ile kısa kenarı ~320px'e indir, JPEG
   blob/dataURL üret; galeri grid'inde gösterilir, orijinal Storage'a gider.
   Sprint 1 yalnızca imza/iskelet. */

/**
 * @param {Blob|File} file
 * @param {number} maxEdge  Kısa kenar hedef px
 * @returns {Promise<Blob|null>}
 */
export async function makeThumbnail(/* file, maxEdge = 320 */) {
  // TODO(sprint2): createImageBitmap -> OffscreenCanvas/canvas -> toBlob('image/jpeg', 0.8)
  return null;
}
