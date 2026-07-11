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

// H1 — les 18 profils de test + comptes admin de test (mem_test_*/adm_mem_test_*) ne sont
// seedés QUE là où un mot de passe démo est prévu (dev/staging via SEED_DEMO_PASSWORD).
// En prod sans SEED_DEMO_PASSWORD : aucun compte admin de test, aucune PII de test en base.
const SEED_TEST_PROFILES = !!(process.env.SEED_DEMO_PASSWORD || process.env.NODE_ENV !== 'production');
const isTestSeedId = (id: string) => id.startsWith('mem_test_') || id.startsWith('adm_mem_test_');
const seedMembers = SEED_TEST_PROFILES ? INITIAL_MEMBERS : INITIAL_MEMBERS.filter((m) => !isTestSeedId(m.id));
const seedAdmins = SEED_TEST_PROFILES ? INITIAL_ADMINS : INITIAL_ADMINS.filter((a) => !isTestSeedId(a.id));

const ARRAY_SEEDS: Record<string, any[]> = {
  members: seedMembers,
  events: INITIAL_EVENTS,
  reports: INITIAL_REPORTS,
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

  reconcileSeedMembers();
}

// Réconcilie les membres/admins seed manquants dans une base déjà peuplée (ex. nouveaux
// profils de test ajoutés après le premier seed) SANS écraser les données existantes :
// ajoute uniquement ceux dont l'id est absent, et garantit un credential démo pour chacun.
// Idempotent — exécuté à chaque démarrage.
function reconcileSeedMembers(): void {
  if (!DEMO_PASSWORD) return;

  const members = getCollection('members');
  const memberIds = new Set(members.map((m: any) => m.id));
  const missingMembers = INITIAL_MEMBERS.filter((m) => !memberIds.has(m.id));
  if (missingMembers.length) {
    setCollection('members', [...members, ...missingMembers]);
    console.log(`[seed] ${missingMembers.length} membre(s) seed ajouté(s) : ${missingMembers.map((m) => m.id).join(', ')}`);
  }

  const admins = getCollection('admins');
  const adminIds = new Set(admins.map((a: any) => a.id));
  const missingAdmins = INITIAL_ADMINS.filter((a) => !adminIds.has(a.id));
  if (missingAdmins.length) setCollection('admins', [...admins, ...missingAdmins]);

  const hasCred = db.prepare('SELECT 1 FROM credentials WHERE member_id = ?');
  const insertCred = db.prepare('INSERT OR IGNORE INTO credentials (member_id, password_hash) VALUES (?, ?)');
  for (const m of INITIAL_MEMBERS) {
    if (!hasCred.get(m.id)) insertCred.run(m.id, hashPassword(DEMO_PASSWORD));
  }
}
