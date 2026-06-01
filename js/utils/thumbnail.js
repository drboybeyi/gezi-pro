/* Gezi Pro — thumbnail üretimi.
   Orijinali küçültüp galeri grid'i için JPEG dataURL üretir. EXIF yönü
   (orientation) createImageBitmap ile düzeltilir. Orijinal blob ayrıca
   IndexedDB 'originals' store'una kaydedilir (bkz. photos.js / idb.js). */

/**
 * @param {Blob|File} file
 * @param {number} maxEdge  Uzun kenar hedef px
 * @returns {Promise<{dataUrl:string, width:number, height:number}>}
 */
export async function makeThumbnail(file, maxEdge = 480) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await createImageBitmap(file); // orientation opsiyonu desteklenmiyorsa
  }
  const { width, height } = bmp;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), width: w, height: h };
}
