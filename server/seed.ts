// First-run seeding, reusing the exact same seed data the frontend already
// uses (src/mockData.ts) so the API and the offline/localStorage fallback
// never disagree about "what's in the demo data".
import { getCollection, setCollection, getKv, setKv, db } from './db.ts';
import { hashPassword } from './auth.ts';
import {
  INITIAL_MEMBERS,
  INITIAL_EVENTS,
  INITIAL_REPORTS,
  INITIAL_AUDITS,
  INITIAL_NOTIFICATIONS,
  DEFAULT_PERMISSION_MATRIX,
  INITIAL_SETTINGS,
  INITIAL_FORMS,
  INITIAL_MINISTRIES,
  INITIAL_DEPARTMENTS,
  INITIAL_ACTIVITIES,
  INITIAL_ADMINS,
  INITIAL_PROJECTS,
  INITIAL_BUS_LINES,
} from '../src/mockData.ts';
import { buildTestDataset, patchTestProfiles } from './testDataset.ts';

// H1 — les 18 profils de test + comptes admin de test (mem_test_*/adm_mem_test_*) ne sont
// seedés QUE là où un mot de passe démo est prévu (dev/staging via SEED_DEMO_PASSWORD).
// En prod sans SEED_DEMO_PASSWORD : aucun compte admin de test, aucune PII de test en base.
const SEED_TEST_PROFILES = !!(process.env.SEED_DEMO_PASSWORD || process.env.NODE_ENV !== 'production');
const isTestSeedId = (id: string) => id.startsWith('mem_test_') || id.startsWith('adm_mem_test_');
const seedMembers = SEED_TEST_PROFILES ? INITIAL_MEMBERS : INITIAL_MEMBERS.filter((m) => !isTestSeedId(m.id));
const seedAdmins = SEED_TEST_PROFILES ? INITIAL_ADMINS : INITIAL_ADMINS.filter((a) => !isTestSeedId(a.id));

// Jeu de données de test Bloom Bus (dev/staging uniquement, même gate que les profils de test) :
// baké dans le seed pour apparaître sur une base FRAÎCHE. Patch aussi mem_test_6 (Responsable
// dept Bloom Bus), mem_test_10 (GPS) et min_expansion.tuteurId (= mem_test_5). Exclu en prod.
let testData: { members: any[]; reports: any[] } = { members: [], reports: [] };
if (SEED_TEST_PROFILES) {
  patchTestProfiles(seedMembers, INITIAL_MINISTRIES);
  testData = buildTestDataset(INITIAL_DEPARTMENTS, INITIAL_BUS_LINES, seedMembers);
}

const ARRAY_SEEDS: Record<string, any[]> = {
  members: [...seedMembers, ...testData.members],
  events: INITIAL_EVENTS,
  reports: [...INITIAL_REPORTS, ...testData.reports],
  audits: INITIAL_AUDITS,
  notifications: INITIAL_NOTIFICATIONS,
  forms: INITIAL_FORMS,
  ministries: INITIAL_MINISTRIES,
  departments: INITIAL_DEPARTMENTS,
  activities: INITIAL_ACTIVITIES,
  admins: seedAdmins,
  delegations: [],
  certifications: [],
  integration_reports: [],
  projects: INITIAL_PROJECTS,
  bus_lines: INITIAL_BUS_LINES,
};

const KV_SEEDS: Record<string, unknown> = {
  permissions: DEFAULT_PERMISSION_MATRIX,
  settings: INITIAL_SETTINGS,
};

// S7 — mot de passe démo partagé UNIQUEMENT hors production. En prod, aucun credential
// n'est seedé : chaque membre active son compte (flux activation/reset par token). Un mot
// de passe démo explicite reste possible via SEED_DEMO_PASSWORD (démos/staging).
const DEMO_PASSWORD =
  process.env.SEED_DEMO_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'bloom2026');

export function ensureSeeded(): void {
  for (const [name, seed] of Object.entries(ARRAY_SEEDS)) {
    if (getCollection(name).length === 0) setCollection(name, seed);
  }
  for (const [key, seed] of Object.entries(KV_SEEDS)) {
    if (getKv(key) === null) setKv(key, seed);
  }
  const row = db.prepare('SELECT COUNT(*) as n FROM credentials').get() as { n: number };
  if (row.n === 0 && DEMO_PASSWORD) {
    const insert = db.prepare('INSERT INTO credentials (member_id, password_hash) VALUES (?, ?)');
    for (const m of INITIAL_MEMBERS) {
      insert.run(m.id, hashPassword(DEMO_PASSWORD));
    }
  } else if (row.n === 0) {
    console.log('[seed] production sans SEED_DEMO_PASSWORD → aucun credential seedé, activation requise.');
  }

  // Events : contenu seed NON sensible → réconcilié dans TOUS les environnements, pour que les
  // cultes récurrents ajoutés après le premier seed apparaissent sur une base déjà peuplée.
  const addedEvents = reconcileMissingById('events', INITIAL_EVENTS);
  if (addedEvents) console.log(`[seed] ${addedEvents} événement(s) seed ajouté(s).`);

  // Jeu de test Bloom Bus (dev/staging) : réconcilié aussi sur une base DÉJÀ peuplée, pour
  // qu'un simple redémarrage suffise à faire apparaître les membres/rapports de test (sans wipe).
  if (SEED_TEST_PROFILES) {
    const tm = reconcileMissingById('members', testData.members);
    const tr = reconcileMissingById('reports', testData.reports);
    // Réapplique les patchs de cohérence même sur une base existante (mem_test_6 = Responsable
    // dept Bloom Bus, mem_test_10 GPS, min_expansion.tuteurId) → redéploiement sans wipe suffit.
    const curMembers = getCollection('members');
    const curMinistries = getCollection('ministries');
    patchTestProfiles(curMembers, curMinistries);
    setCollection('members', curMembers);
    setCollection('ministries', curMinistries);
    if (tm || tr) console.log(`[seed] jeu de test Bloom Bus réconcilié : +${tm} membre(s), +${tr} rapport(s).`);
  }

  reconcileSeedMembers();
}

// Ajoute les items seed absents (par id) d'une collection SANS écraser l'existant ni
// ressusciter un tombstone (un id présent, même supprimé, est ignoré). Idempotent.
function reconcileMissingById(name: string, seed: any[]): number {
  const current = getCollection(name);
  const ids = new Set(current.map((x: any) => x.id));
  const missing = seed.filter((x) => !ids.has(x.id));
  if (missing.length) setCollection(name, [...current, ...missing]);
  return missing.length;
}

// Réconcilie les membres/admins seed manquants dans une base déjà peuplée (ex. nouveaux
// profils de test ajoutés après le premier seed) SANS écraser les données existantes :
// ajoute uniquement ceux dont l'id est absent, et garantit un credential démo pour chacun.
// Idempotent — exécuté à chaque démarrage. Gardé par DEMO_PASSWORD (données/credentials de test).
function reconcileSeedMembers(): void {
  if (!DEMO_PASSWORD) return;

  const addedMembers = reconcileMissingById('members', INITIAL_MEMBERS);
  if (addedMembers) console.log(`[seed] ${addedMembers} membre(s) seed ajouté(s).`);
  reconcileMissingById('admins', INITIAL_ADMINS);

  const hasCred = db.prepare('SELECT 1 FROM credentials WHERE member_id = ?');
  const insertCred = db.prepare('INSERT OR IGNORE INTO credentials (member_id, password_hash) VALUES (?, ?)');
  for (const m of INITIAL_MEMBERS) {
    if (!hasCred.get(m.id)) insertCred.run(m.id, hashPassword(DEMO_PASSWORD));
  }
}
