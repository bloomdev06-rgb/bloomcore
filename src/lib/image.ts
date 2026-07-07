// Réduit une image à `max` px sur son plus grand côté (JPEG qualité 0.8) et renvoie une
// data URL. Borne la taille avant stockage localStorage — une photo 12 MP brute (~10-15 Mo
// base64) dépasse le quota (~5 Mo) et fait throw setItem (C2). Gère aussi l'échec de décodage
// (HEIC iPhone, fichier corrompu) via reject plutôt qu'un no-op silencieux (B6).
export function downscaleImage(file: File, max = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas 2d indisponible')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Image non prise en charge (format non supporté, ex. HEIC)'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
    reader.readAsDataURL(file);
  });
}
