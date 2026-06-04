/* Gezi Pro — "yer" (place) modeli yardımcıları.
   Çoklu fotoğraf: her yer kaydı tek thumb yerine bir `photos[]` listesi tutar;
   tüm fotoğraflar aynı yere ait (tek konum/isim/kategori/not).

   Yer kaydı:
     { id, title, note, category, lat, lng, locSource, locError,
       takenAt, createdAt, updatedAt, syncState,
       photos: [ { id, thumb, w, h, takenAt, createdAt, storagePath? } ] }

   GERİYE DÖNÜK UYUMLULUK: eski tek-fotoğraflı kayıtlar (üst düzey thumb/w/h,
   photos[] yok) okunurken/göç edilirken otomatik tek-elemanlı listeye dönüşür.
   Migrasyonda foto id'si = yer id'si (orijinal blob anahtarı korunur). */

/** Eski-şekil kaydı yeni-şekle çevirir; zaten yeni-şekilse aynen döner. (pure) */
export function normalizePlace(rec) {
  if (!rec || Array.isArray(rec.photos)) return rec;
  const { thumb = null, w = 0, h = 0, ...rest } = rec;
  return {
    ...rest,
    photos: [{
      id: rec.id,                                  // migrasyon: foto id = yer id
      thumb,
      w, h,
      takenAt: rec.takenAt ?? rec.createdAt ?? null,
      createdAt: rec.createdAt ?? null,
    }],
  };
}

/** Galeri/harita kartı için kapak thumbnail'i (ilk foto). */
export const coverThumb = (place) => normalizePlace(place)?.photos?.[0]?.thumb || null;

/** Yerdeki fotoğraf sayısı. */
export const photoCount = (place) => normalizePlace(place)?.photos?.length || 0;
