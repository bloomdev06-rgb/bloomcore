// One-shot, idempotent : migre les fichiers déjà présents sur le volume disque
// (/data/uploads en prod) vers l'adaptateur de stockage actif (server/storage.ts) — utile
// quand on bascule un déploiement existant du mode disque vers S3/MinIO (Phase 5, T5.4).
// Ne fait RIEN d'utile si le mode actif est déjà 'disk' (l'adaptateur disque écrirait dans
// le même dossier qu'il lit) — averti explicitement plutôt que de tourner pour rien.
//
// Usage (terminal du conteneur, une fois S3_ENDPOINT/S3_BUCKET/... configurés) :
//   npx tsx server/migrate-uploads.ts
//
// Ne supprime AUCUN fichier local — la suppression du volume disque reste une décision
// manuelle, après validation complète en prod (voir Playbook T5.4).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStorage, storageMode } from './storage.ts';
import { getKv, setKv } from './datastore.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(
  process.env.BLOOMCORE_DB ? path.dirname(process.env.BLOOMCORE_DB) : __dirname,
  'uploads',
);

async function main() {
  const storage = getStorage(UPLOAD_DIR);
  const mode = storageMode();
  if (mode !== 's3') {
    console.log(`[migrate-uploads] mode actif = '${mode}' — S3_ENDPOINT doit être défini avant de lancer cette migration. Rien à faire.`);
    return;
  }
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log(`[migrate-uploads] ${UPLOAD_DIR} n'existe pas — rien à migrer.`);
    return;
  }
  const files = fs.readdirSync(UPLOAD_DIR).filter((f) => fs.statSync(path.join(UPLOAD_DIR, f)).isFile());
  console.log(`[migrate-uploads] ${files.length} fichier(s) local(aux) trouvé(s) dans ${UPLOAD_DIR}.`);

  let migrated = 0;
  let alreadyPresent = 0;
  const failures: string[] = [];
  for (const key of files) {
    try {
      if (await storage.exists(key)) {
        alreadyPresent++; // idempotent : ré-exécution ne re-transfère pas ce qui l'est déjà.
        continue;
      }
      const buf = fs.readFileSync(path.join(UPLOAD_DIR, key));
      const ext = key.split('.').pop() ?? '';
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      await storage.putObject(key, buf, contentType);
      migrated++;
      if (migrated % 50 === 0) console.log(`[migrate-uploads] ${migrated} migré(s)...`);
    } catch (e) {
      failures.push(key);
      console.error(`[migrate-uploads] échec pour ${key} :`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[migrate-uploads] terminé : ${migrated} migré(s), ${alreadyPresent} déjà présent(s), ${failures.length} échec(s).`);
  if (failures.length) console.log(`[migrate-uploads] fichiers en échec : ${failures.join(', ')}`);
  else await setKv('uploads_migrated', 1); // flag KV — journalisation de complétion (T5.4), pas un gate applicatif.

  console.log('[migrate-uploads] fichiers locaux CONSERVÉS (aucune suppression automatique) — à retirer manuellement après validation complète.');
}

await main();
