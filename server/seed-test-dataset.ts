// =============================================================================
// Jeu de données de TEST Bloom Bus — exécution MANUELLE sur une base live.
// (La génération est aussi bakée dans server/seed.ts → apparaît sur une base fraîche.)
//
//   Seed    : npx tsx server/seed-test-dataset.ts
//   Nettoyer: npx tsx server/seed-test-dataset.ts --clean
//
// Toutes les entités portent l'id préfixe `stds_` + le marqueur nom "(TEST)" → supprimables
// en une commande. IDEMPOTENT (le seed nettoie d'abord). Les mises à jour de comptes test
// (mem_test_6/mem_test_10) + ministère (min_expansion) sont sauvegardées dans le KV
// `stds_backup` et restaurées au --clean.
// =============================================================================
import { getCollection, setCollection, getKv, setKv, db } from './db.ts';
import { buildTestDataset, patchTestProfiles, STDS_PREFIX } from './testDataset.ts';
import type { Member, Ministry } from '../src/types.ts';

// Attendre si le serveur écrit au même moment (SQLite, base partagée en conteneur).
db.exec('PRAGMA busy_timeout = 8000');

const BACKUP_KEY = 'stds_backup';
const CLEAN = process.argv.includes('--clean');

const dropStds = (arr: any[]) => arr.filter((x) => !String(x.id).startsWith(STDS_PREFIX));
function stripStds() {
  setCollection('members', dropStds(getCollection('members')));
  setCollection('reports', getCollection('reports').filter((r: any) =>
    !String(r.id).startsWith(STDS_PREFIX)
    && !String(r.content?.memberId ?? '').startsWith(STDS_PREFIX)
    && !String(r.content?.busId ?? '').startsWith(STDS_PREFIX)));
  setCollection('events', dropStds(getCollection('events')));
  setCollection('activities', dropStds(getCollection('activities')));
}
function restoreBackup() {
  const backup = getKv<any>(BACKUP_KEY);
  if (!backup) return;
  for (const [coll, items] of Object.entries(backup) as [string, any[]][]) {
    if (!Array.isArray(items) || !items.length) continue;
    const cur = getCollection(coll);
    const byId = new Map(cur.map((x: any) => [x.id, x]));
    for (const orig of items) byId.set(orig.id, orig);
    setCollection(coll, [...byId.values()]);
  }
  setKv(BACKUP_KEY, null);
}

if (CLEAN) {
  restoreBackup();
  stripStds();
  console.log('✓ Jeu de test Bloom Bus supprimé (entités `stds_` retirées, comptes test restaurés).');
  process.exit(0);
}

// ---- SEED ----
// 0) idempotence : repartir propre
restoreBackup();
stripStds();

const members = getCollection('members') as Member[];
const ministries = getCollection('ministries') as Ministry[];
const departments = getCollection('departments') as any[];
const busLines = getCollection('bus_lines') as any[];

// 1) Sauvegarde AVANT modification des comptes test / ministère
const backup: Record<string, any[]> = { members: [], ministries: [] };
for (const id of ['mem_test_6', 'mem_test_10']) { const m = members.find((x) => x.id === id); if (m) backup.members.push(structuredClone(m)); }
const minExp = ministries.find((m) => m.id === 'min_expansion'); if (minExp) backup.ministries.push(structuredClone(minExp));
setKv(BACKUP_KEY, backup);

// 2) Patch comptes test + ministère, puis génération (module partagé avec seed.ts)
patchTestProfiles(members, ministries);
const { members: gen, reports } = buildTestDataset(departments, busLines, members);

// 3) Écriture
setCollection('members', [...members, ...gen]);
setCollection('reports', [...getCollection('reports'), ...reports]);
setCollection('ministries', ministries);

const pending = gen.filter((m) => m.deptAttachmentStatus === 'pending').length;
console.log('✓ Jeu de données de test Bloom Bus généré.');
console.log(`  Membres générés (stds_) : ${gen.length}  (dont ${pending} en attente « Origine Bloom Bus »)`);
console.log(`  Rapports générés        : ${reports.length}`);
console.log(`  Comptes test mis à jour : mem_test_6 (Responsable dept Bloom Bus), mem_test_10 (GPS), min_expansion.tuteurId=mem_test_5`);
console.log('  Nettoyage : npx tsx server/seed-test-dataset.ts --clean');
