/* Gezi Pro — uzak orijinal indirme köprüsü (FIREBASE İÇERMEZ).
   photoViewer.js tam çözünürlüğü önce yerel orijinalden dener; yoksa (ör. başka
   cihazdan inmiş yer) bu köprü üzerinden Storage indirme URL'ini ister.
   db.js (giriş sonrası) gerçek indiriciyi kaydeder; giriş yoksa null döner.
   Bu modülün firebase import ETMEMESİ boot yolunu firebase'siz tutar. */

let _downloader = null;

export function setOriginalDownloader(fn) { _downloader = fn; }
export function clearOriginalDownloader()  { _downloader = null; }

/** storagePath -> indirme URL'i (string) ya da null. */
export async function fetchRemoteOriginal(storagePath) {
  if (!_downloader || !storagePath) return null;
  try { return await _downloader(storagePath); }
  catch (e) { console.warn('[originals] indirilemedi', e); return null; }
}
