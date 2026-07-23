// Réduction d'image côté client avant stockage. Deux tailles :
//  - vignette 200 px (avatars, listes) → légère, chargée partout ;
//  - large 800 px (lightbox du profil) → chargée à la demande seulement.
// JPEG qualité 0.8. Borne la taille AVANT stockage/upload — une photo 12 MP brute
// (~10-15 Mo base64) dépasse le quota localStorage et sature le volume (~4000 photos).
// Gère l'échec de décodage (HEIC iPhone, fichier corrompu) via reject (B6).
const THUMB_MAX = 200;
const LARGE_MAX = 800;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image non prise en charge (format non supporté, ex. HEIC)'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
    reader.readAsDataURL(file);
  });
}

function scaleToDataUrl(img: HTMLImageElement, max: number): string {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponible');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** Réduit une image à `max` px sur son plus grand côté (JPEG q0.8), renvoie une data URL. */
export async function downscaleImage(file: File, max = THUMB_MAX): Promise<string> {
  return scaleToDataUrl(await loadImage(file), max);
}

// Downscale (2 tailles) puis téléversement : en ligne → URL vignette légère (/uploads/<hash>-t.jpg)
// dans le JSON, la large (/uploads/<hash>.jpg) stockée à côté pour le lightbox ; hors-ligne →
// dataURL vignette conservé (offline-first), migré côté serveur au prochain boot.
export async function downscaleAndUpload(file: File): Promise<string> {
  const { apiUpload } = await import('../data/api');
  const img = await loadImage(file); // décodé une seule fois
  const thumb = scaleToDataUrl(img, THUMB_MAX);
  const large = scaleToDataUrl(img, LARGE_MAX);
  return (await apiUpload(thumb, large)) ?? thumb;
}
