/* Gezi Pro — senkron köprüsü (FIREBASE İÇERMEZ).
   photos.js / categories.js local bir değişiklik yapınca burayı çağırır;
   giriş yapılmışsa db.js kendini kancalar (setSyncHooks) ve RTDB'ye push eder.
   Giriş yoksa kancalar null -> hiçbir şey olmaz (saf offline). Bu modülün
   firebase import ETMEMESİ önemli: boot yolunu firebase'siz tutar. */

let _hooks = null;

/** db.js (giriş sonrası) push fonksiyonlarını buraya kaydeder. */
export function setSyncHooks(hooks) { _hooks = hooks; }
export function clearSyncHooks()    { _hooks = null; }

export function onPhotoChanged(rec)   { try { _hooks?.photoChanged?.(rec); }   catch (e) { console.warn('[sync] photoChanged', e); } }
export function onPhotoDeleted(id)    { try { _hooks?.photoDeleted?.(id); }    catch (e) { console.warn('[sync] photoDeleted', e); } }
export function onCategoryChanged(c)  { try { _hooks?.categoryChanged?.(c); }  catch (e) { console.warn('[sync] categoryChanged', e); } }
export function onCategoryDeleted(k)  { try { _hooks?.categoryDeleted?.(k); }  catch (e) { console.warn('[sync] categoryDeleted', e); } }
