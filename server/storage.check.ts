// Run: npx tsx server/storage.check.ts
// Mode disque uniquement (sans S3_ENDPOINT) — le seul vérifiable dans ce sandbox (pas de
// démon Docker/MinIO). Le mode S3 est écrit et type-checké mais son comportement RÉEL
// (put/get/expiration d'URL signée) doit être vérifié contre un vrai MinIO/S3 — au
// déploiement Dokploy, pas ici (voir commentaire de storage.ts et le rapport de phase).
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

delete process.env.S3_ENDPOINT;
const { getStorage, storageMode, resetStorageForTests } = await import('./storage.ts');

resetStorageForTests();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-storage-check-'));
const storage = getStorage(dir);

assert.equal(storageMode(), 'disk', 'sans S3_ENDPOINT, le mode doit être disque');

const buf = Buffer.from('hello bloomcore');
await storage.putObject('test-key.txt', buf, 'text/plain');
assert.ok(fs.existsSync(path.join(dir, 'test-key.txt')), 'putObject doit écrire le fichier sur disque');
assert.equal(fs.readFileSync(path.join(dir, 'test-key.txt'), 'utf8'), 'hello bloomcore', 'contenu écrit doit correspondre');

assert.equal(await storage.exists('test-key.txt'), true, 'exists() doit voir le fichier écrit');
assert.equal(await storage.exists('absent-key.txt'), false, 'exists() doit renvoyer false pour un fichier absent');

const url = await storage.getSignedUrl('test-key.txt');
assert.equal(url, '/uploads/test-key.txt', 'mode disque : URL statique historique, pas de signature');

fs.rmSync(dir, { recursive: true, force: true });
console.log('storage.check OK');
