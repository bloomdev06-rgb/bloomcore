// First-run seeding, reusing the exact same seed data the frontend already
// uses (src/mockData.ts) so the API and the offline/localStorage fallback
// never disagree about "what's in the demo data".
import { db } from './db.ts';
import { getCollection, setCollection, getKv, setKv } from './datastore.ts';
import { hashPassword } from './auth.ts';
import { isLegacySeedEventId } from '../src/data/events.ts';
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
import { buildTestDataset, patchTestProfiles, attachAllToBus } from './testDataset.ts';

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
let testData: { members: any[]; reports: any[]; newBuses: any[]; ministryTuteurs: { ministryId: string; memberId: string }[]; credentialMemberIds: string[] } =
  { members: [], reports: [], newBuses: [], ministryTuteurs: [], credentialMemberIds: [] };
if (SEED_TEST_PROFILES) {
  patchTestProfiles(seedMembers, INITIAL_MINISTRIES);
  testData = buildTestDataset(INITIAL_DEPARTMENTS, INITIAL_BUS_LINES, seedMembers);
  // Ministres de test = tuteurs de ministères (rôle Ministre dérivé de ministry.tuteurId).
  for (const { ministryId, memberId } of testData.ministryTuteurs) {
    const mi = INITIAL_MINISTRIES.find((m) => m.id === ministryId);
    if (mi) mi.tuteurId = memberId;
  }
  // TOUS les membres rattachés à un bus (profils test réutilisés + membres seed de base).
  attachAllToBus(seedMembers, [...INITIAL_BUS_LINES, ...testData.newBuses]);
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
  bus_lines: [...INITIAL_BUS_LINES, ...testData.newBuses],
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

export async function ensureSeeded(): Promise<void> {
  for (const [name, seed] of Object.entries(ARRAY_SEEDS)) {
    if ((await getCollection(name)).length === 0) await setCollection(name, seed);
  }
  for (const [key, seed] of Object.entries(KV_SEEDS)) {
    if ((await getKv(key)) === null) await setKv(key, seed);
  }
  const row = db.prepare('SELECT COUNT(*) as n FROM credentials').get() as { n: number };
  if (row.n === 0 && DEMO_PASSWORD) {
    const insert = db.prepare('INSERT OR IGNORE INTO credentials (member_id, password_hash) VALUES (?, ?)');
    for (const m of INITIAL_MEMBERS) insert.run(m.id, hashPassword(DEMO_PASSWORD));
    for (const id of testData.credentialMemberIds) insert.run(id, hashPassword(DEMO_PASSWORD)); // ministres de test
  } else if (row.n === 0) {
    console.log('[seed] production sans SEED_DEMO_PASSWORD → aucun credential seedé, activation requise.');
  }

  // Events : contenu seed NON sensible → réconcilié dans TOUS les environnements, pour que les
  // cultes récurrents ajoutés après le premier seed apparaissent sur une base déjà peuplée.
  const addedEvents = await reconcileMissingById('events', INITIAL_EVENTS);
  if (addedEvents) console.log(`[seed] ${addedEvents} événement(s) seed ajouté(s).`);

  // Jeu de test Bloom Bus (dev/staging) : REFRESH à chaque démarrage. Les ids `stds_` étant
  // déterministes, on retire l'ancien jeu puis on ré-injecte la génération COURANTE → toute
  // évolution (noms, structure) s'applique au simple redéploiement, sans wipe. Les données
  // NON-`stds_` (membres réels, profils test, édits) sont conservées.
  if (SEED_TEST_PROFILES) {
    const keepMembers = (await getCollection('members')).filter((m: any) => !String(m.id).startsWith('stds_'));
    const keepReports = (await getCollection('reports')).filter((r: any) =>
      !String(r.id).startsWith('stds_')
      && !String(r.content?.memberId ?? '').startsWith('stds_')
      && !String(r.content?.busId ?? '').startsWith('stds_'));
    const keepBuses = (await getCollection('bus_lines')).filter((b: any) => !String(b.id).startsWith('stds_'));
    const curMinistries = await getCollection('ministries');
    patchTestProfiles(keepMembers, curMinistries);
    for (const { ministryId, memberId } of testData.ministryTuteurs) {
      const mi = curMinistries.find((m: any) => m.id === ministryId);
      if (mi) mi.tuteurId = memberId;
    }
    const allBuses = [...keepBuses, ...testData.newBuses];
    const allMembers = [...keepMembers, ...testData.members];
    attachAllToBus(allMembers, allBuses); // tous les membres rattachés à un bus
    await setCollection('bus_lines', allBuses);
    await setCollection('members', allMembers);
    await setCollection('reports', [...keepReports, ...testData.reports]);
    await setCollection('ministries', curMinistries);
    if (DEMO_PASSWORD) {
      const hasCred = db.prepare('SELECT 1 FROM credentials WHERE member_id = ?');
      const insertCred = db.prepare('INSERT OR IGNORE INTO credentials (member_id, password_hash) VALUES (?, ?)');
      for (const id of testData.credentialMemberIds) if (!hasCred.get(id)) insertCred.run(id, hashPassword(DEMO_PASSWORD));
    }
    console.log(`[seed] jeu de test Bloom Bus rafraîchi : ${testData.members.length} membres, ${testData.reports.length} rapports.`);
  }

  await reconcileSeedMembers();
  await reconcileLot3();
  await reconcileLot4();
}

// Lot 4 — remplacement des événements. Deux purges :
// - les anciens events seed (evt_1..5, evt_culte_*) : à chaque boot (idempotent) ;
// - TOUT le reste non canonique (events de test créés à la main : « Conférence »,
//   « Culte test récurrent d3 »…) : UNE SEULE FOIS (drapeau kv), pour ne pas détruire
//   les événements que les utilisateurs créeront légitimement après le lot 4.
// Les canoniques (evt4_*, ids déterministes par date) sont réinsérés par
// reconcileMissingById à chaque boot, l'horizon avance tout seul.
async function reconcileLot4(): Promise<void> {
  const events = await getCollection('events');
  const oneShot = !(await getKv('lot4_events_purged'));
  const kept = (events as any[]).filter((e) =>
    !isLegacySeedEventId(e.id) && (!oneShot || e.id.startsWith('evt4_')),
  );
  if (kept.length !== events.length) {
    await setCollection('events', kept);
    console.log(`[seed] lot 4 : ${events.length - kept.length} ancien(s) événement(s) purgé(s).`);
  }
  if (oneShot) await setKv('lot4_events_purged', true);
}

// Lot 3 — réconciliation ciblée d'une base déjà peuplée (idempotente, à chaque boot) :
// - Event.endTime des cultes seed : reconcileMissingById n'update pas les events existants,
//   les cultes d'avant ce champ resteraient sans heure de fin.
// - Profils de test GDC/ADN : 'Membre' → 'Adjoint' (le RBAC serveur exige une fonction
//   d'encadrement pour écrire des reports) — profils de test, donc gardé par DEMO_PASSWORD.
async function reconcileLot3(): Promise<void> {
  const events = await getCollection('events');
  const seedById = new Map(INITIAL_EVENTS.map((e: any) => [e.id, e]));
  let touched = 0;
  for (const e of events as any[]) {
    const seed = seedById.get(e.id) as any;
    if (seed?.endTime && e.endTime !== seed.endTime) { e.endTime = seed.endTime; touched++; }
  }
  if (touched) {
    await setCollection('events', events);
    console.log(`[seed] endTime appliqué à ${touched} événement(s) existant(s).`);
  }

  if (!DEMO_PASSWORD) return;
  const members = await getCollection('members');
  let fixed = 0;
  for (const m of members as any[]) {
    if (m.testRole === 'GDC' && m.departments?.dept_gdc === 'Membre') { m.departments.dept_gdc = 'Adjoint'; fixed++; }
    if (m.testRole === 'ADN' && m.departments?.dept_adn === 'Membre') { m.departments.dept_adn = 'Adjoint'; fixed++; }
  }
  if (fixed) {
    await setCollection('members', members);
    console.log(`[seed] ${fixed} profil(s) de test GDC/ADN passé(s) Adjoint.`);
  }
}

// Ajoute les items seed absents (par id) d'une collection SANS écraser l'existant ni
// ressusciter un tombstone (un id présent, même supprimé, est ignoré). Idempotent.
async function reconcileMissingById(name: string, seed: any[]): Promise<number> {
  const current = await getCollection(name);
  const ids = new Set(current.map((x: any) => x.id));
  const missing = seed.filter((x) => !ids.has(x.id));
  if (missing.length) await setCollection(name, [...current, ...missing]);
  return missing.length;
}

// Réconcilie les membres/admins seed manquants dans une base déjà peuplée (ex. nouveaux
// profils de test ajoutés après le premier seed) SANS écraser les données existantes :
// ajoute uniquement ceux dont l'id est absent, et garantit un credential démo pour chacun.
// Idempotent — exécuté à chaque démarrage. Gardé par DEMO_PASSWORD (données/credentials de test).
async function reconcileSeedMembers(): Promise<void> {
  if (!DEMO_PASSWORD) return;

  const addedMembers = await reconcileMissingById('members', INITIAL_MEMBERS);
  if (addedMembers) console.log(`[seed] ${addedMembers} membre(s) seed ajouté(s).`);
  await reconcileMissingById('admins', INITIAL_ADMINS);

  const hasCred = db.prepare('SELECT 1 FROM credentials WHERE member_id = ?');
  const insertCred = db.prepare('INSERT OR IGNORE INTO credentials (member_id, password_hash) VALUES (?, ?)');
  for (const m of INITIAL_MEMBERS) {
    if (!hasCred.get(m.id)) insertCred.run(m.id, hashPassword(DEMO_PASSWORD));
  }
}
