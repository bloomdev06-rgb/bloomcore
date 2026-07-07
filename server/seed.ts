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
} from '../src/mockData.ts';

const ARRAY_SEEDS: Record<string, any[]> = {
  members: INITIAL_MEMBERS,
  events: INITIAL_EVENTS,
  reports: INITIAL_REPORTS,
  audits: INITIAL_AUDITS,
  notifications: INITIAL_NOTIFICATIONS,
  forms: INITIAL_FORMS,
  ministries: INITIAL_MINISTRIES,
  departments: INITIAL_DEPARTMENTS,
  activities: INITIAL_ACTIVITIES,
  admins: INITIAL_ADMINS,
  delegations: [],
  certifications: [],
  integration_reports: [],
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
}
