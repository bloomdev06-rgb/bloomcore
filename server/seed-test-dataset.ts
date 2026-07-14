// =============================================================================
// Jeu de données de TEST Bloom Bus — exécution MANUELLE sur une base live.
// (La génération est aussi bakée dans server/seed.ts → apparaît sur une base fraîche
//  ou au redémarrage via reconcile.)
//
//   Seed    : npx tsx server/seed-test-dataset.ts
//   Nettoyer: npx tsx server/seed-test-dataset.ts --clean
//
// Entités préfixées `stds_` + marqueur nom "(TEST)". IDEMPOTENT. Les mises à jour de comptes
// test / ministères sont sauvegardées dans le KV `stds_backup` et restaurées au --clean.
// =============================================================================
import { getCollection, setCollection, getKv, setKv, db } from './db.ts';
import { hashPassword } from './auth.ts';
import { buildTestDataset, patchTestProfiles, STDS_PREFIX } from './testDataset.ts';
import type { Member, Ministry } from '../src/types.ts';

db.exec('PRAGMA busy_timeout = 8000'); // attendre si le serveur écrit en même temps

const BACKUP_KEY = 'stds_backup';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'bloom2026');
const CLEAN = process.argv.includes('--clean');

const dropStds = (arr: any[]) => arr.filter((x) => !String(x.id).startsWith(STDS_PREFIX));
function stripStds() {
  setCollection('members', dropStds(getCollection('members')));
  setCollection('bus_lines', dropStds(getCollection('bus_lines')));
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
  console.log('✓ Jeu de test Bloom Bus supprimé (entités `stds_` retirées, comptes test/ministères restaurés).');
  process.exit(0);
}

// ---- SEED ----
restoreBackup();
stripStds();

const members = getCollection('members') as Member[];
const ministries = getCollection('ministries') as Ministry[];
const departments = getCollection('departments') as any[];
const busLines = getCollection('bus_lines') as any[];

// Génération pure (aucune mutation ici).
const ds = buildTestDataset(departments, busLines, members);

// Sauvegarde AVANT patch (comptes test + tous les ministères touchés).
const touchedMinistryIds = new Set(['min_expansion', ...ds.ministryTuteurs.map((t) => t.ministryId)]);
const backup: Record<string, any[]> = { members: [], ministries: [] };
for (const id of ['mem_test_6', 'mem_test_10']) { const m = members.find((x) => x.id === id); if (m) backup.members.push(structuredClone(m)); }
for (const mi of ministries) if (touchedMinistryIds.has(mi.id)) backup.ministries.push(structuredClone(mi));
setKv(BACKUP_KEY, backup);

// Patchs de cohérence.
patchTestProfiles(members, ministries);
for (const { ministryId, memberId } of ds.ministryTuteurs) {
  const mi = ministries.find((m) => m.id === ministryId);
  if (mi) mi.tuteurId = memberId;
}

// Écriture.
setCollection('members', [...members, ...ds.members]);
setCollection('reports', [...getCollection('reports'), ...ds.reports]);
setCollection('ministries', ministries);
setCollection('bus_lines', [...busLines, ...ds.newBuses]);

// Comptes de connexion des ministres.
if (DEMO_PASSWORD) {
  const insert = db.prepare('INSERT OR IGNORE INTO credentials (member_id, password_hash) VALUES (?, ?)');
  for (const id of ds.credentialMemberIds) insert.run(id, hashPassword(DEMO_PASSWORD));
}

const pending = ds.members.filter((m) => m.deptAttachmentStatus === 'pending').length;
console.log('✓ Jeu de données de test Bloom Bus généré.');
console.log(`  Membres générés (stds_) : ${ds.members.length}  (dont ${pending} en attente « Origine Bloom Bus »)`);
console.log(`  Bloom Bus ajoutés        : ${ds.newBuses.length}`);
console.log(`  Rapports générés         : ${ds.reports.length}`);
console.log(`  Ministres avec login     : ${ds.credentialMemberIds.length}  (tél. +22505 98 00 00 0X / bloom2026)`);
console.log('  Nettoyage : npx tsx server/seed-test-dataset.ts --clean');
