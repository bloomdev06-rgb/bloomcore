// ponytail: SQLite via node:sqlite (native, zero new dependency) instead of
// Prisma+PostgreSQL (ARCHITECTURE_TECHNIQUE.md's target). Storage is a
// document store — one row per item, JSON blob — because the frontend already
// treats each collection as a whole array it loads/replaces wholesale
// (src/data/index.ts's load/save). A fully-normalized relational schema would
// buy nothing today. Upgrade path: swap this file for a real Prisma/Postgres
// client if multi-writer concurrency or relational queries are ever needed —
// every route in index.ts only calls the functions below, so that's the only
// file that would change.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalize } from '../packages/shared/migrate.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// BLOOMCORE_DB : surchargable pour les scripts *.check.ts (':memory:').
export const db = new DatabaseSync(process.env.BLOOMCORE_DB || path.join(__dirname, 'bloomcore.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    name TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (name, id)
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS credentials (
    member_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    pwd_version INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sync_ops (
    op_id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    received_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    signature TEXT UNIQUE,
    processed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key TEXT UNIQUE,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'simulated',
    created_at TEXT NOT NULL,
    sent_at TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_member ON push_subscriptions(member_id);
`);

// Migration idempotente : pwd_version pour révoquer les tokens au changement de mot de passe (#11).
// ALTER échoue si la colonne existe → on la teste via PRAGMA d'abord.
if (!(db.prepare('PRAGMA table_info(credentials)').all() as { name: string }[]).some((c) => c.name === 'pwd_version')) {
  db.exec('ALTER TABLE credentials ADD COLUMN pwd_version INTEGER NOT NULL DEFAULT 0');
}

// M5 — backfill unique des valeurs vers le snake_case §3 (packages/shared/migrate).
// Idempotent : gardé par un flag kv `_m5_migrated`. Normalise les blobs existants une fois ;
// la normalisation en écriture (guards.applyWrite) prend le relais ensuite. Dump de sécurité
// avant réécriture (les maps sont bijectives, mais on garde un filet de rollback).
if (!(db.prepare("SELECT 1 FROM kv WHERE key = '_m5_migrated'").get())) {
  const names = (db.prepare('SELECT DISTINCT name FROM collections').all() as { name: string }[]).map((r) => r.name);
  if (names.length) {
    try {
      const dump: Record<string, unknown[]> = {};
      for (const n of names) dump[n] = getCollection(n);
      fs.writeFileSync(path.join(__dirname, 'collections.pre-m5.json'), JSON.stringify(dump));
    } catch { /* dump best-effort — n'empêche pas la migration */ }
    for (const n of names) setCollection(n, getCollection(n).map((it) => canonicalize(n, it)));
  }
  db.prepare('INSERT INTO kv (key, data) VALUES (?, ?)').run('_m5_migrated', JSON.stringify(new Date().toISOString()));
}

// Whole-array collections: the frontend always replaces the full array on
// save (never per-item patches), so the API mirrors that instead of exposing
// per-item CRUD nobody calls.
export function getCollection(name: string): any[] {
  const rows = db.prepare('SELECT data FROM collections WHERE name = ? ORDER BY rowid').all(name) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data));
}

export function setCollection(name: string, items: any[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM collections WHERE name = ?').run(name);
    const insert = db.prepare('INSERT INTO collections (name, id, data) VALUES (?, ?, ?)');
    for (const item of items) {
      insert.run(name, String(item.id), JSON.stringify(item));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Insertion pure (audits, notifications dérivées par le scheduler) — jamais de
// DELETE : le support physique du "journal inviolable".
export function appendToCollection(name: string, items: any[]): void {
  if (items.length === 0) return;
  db.exec('BEGIN');
  try {
    const insert = db.prepare('INSERT OR IGNORE INTO collections (name, id, data) VALUES (?, ?, ?)');
    for (const item of items) insert.run(name, String(item.id), JSON.stringify(item));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Upsert des items entrants + réinjection des tombstones (soft-delete) — en une
// transaction. Contrairement à setCollection, ne supprime jamais de ligne.
export function mergeCollection(name: string, items: any[]): void {
  db.exec('BEGIN');
  try {
    const upsert = db.prepare(
      'INSERT INTO collections (name, id, data) VALUES (?, ?, ?) ON CONFLICT(name, id) DO UPDATE SET data = excluded.data',
    );
    for (const item of items) upsert.run(name, String(item.id), JSON.stringify(item));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getKv<T>(key: string): T | null {
  const row = db.prepare('SELECT data FROM kv WHERE key = ?').get(key) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as T) : null;
}

export function setKv(key: string, value: unknown): void {
  db
    .prepare('INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data')
    .run(key, JSON.stringify(value));
}

// --- Auth : credentials + tokens à usage unique (backend SQLite sync) ---
// Le hachage reste dans auth.ts (db.ts ne doit pas importer auth.ts → cycle) :
// ces fonctions reçoivent un hash déjà calculé.
export function getCredential(memberId: string): { password_hash: string; pwd_version: number } | null {
  return (db.prepare('SELECT password_hash, pwd_version FROM credentials WHERE member_id = ?').get(memberId) as
    | { password_hash: string; pwd_version: number }
    | undefined) ?? null;
}

// Changement de mot de passe : ON CONFLICT ++pwd_version (révoque les tokens antérieurs, #11).
export function upsertCredential(memberId: string, passwordHash: string): void {
  db.prepare(
    `INSERT INTO credentials (member_id, password_hash, pwd_version) VALUES (?, ?, 0)
     ON CONFLICT(member_id) DO UPDATE SET password_hash = excluded.password_hash, pwd_version = pwd_version + 1`,
  ).run(memberId, passwordHash);
}

// Seed : n'écrase jamais un credential existant, ne touche pas pwd_version.
export function insertCredentialIfAbsent(memberId: string, passwordHash: string): void {
  db.prepare('INSERT OR IGNORE INTO credentials (member_id, password_hash) VALUES (?, ?)').run(memberId, passwordHash);
}

export function countCredentials(): number {
  return (db.prepare('SELECT COUNT(*) as n FROM credentials').get() as { n: number }).n;
}

export function insertToken(token: string, memberId: string, purpose: string, expiresAt: number): void {
  db.prepare('INSERT INTO tokens (token, member_id, purpose, expires_at) VALUES (?, ?, ?, ?)').run(
    token, memberId, purpose, expiresAt,
  );
}

// Consomme un token (usage unique) — null si inconnu, expiré ou déjà utilisé.
export function consumeToken(token: string, now: number): { memberId: string; purpose: string } | null {
  const row = db.prepare('SELECT member_id, purpose, expires_at, used_at FROM tokens WHERE token = ?').get(token) as
    | { member_id: string; purpose: string; expires_at: number; used_at: number | null }
    | undefined;
  if (!row || row.used_at || now > row.expires_at) return null;
  db.prepare('UPDATE tokens SET used_at = ? WHERE token = ?').run(now, token);
  return { memberId: row.member_id, purpose: row.purpose };
}

// --- Tables auxiliaires : sync_ops / webhook_events / outbox (backend SQLite sync) ---

// sync_ops — idempotence de la file offline (/sync/batch).
export function syncOpSeen(opId: string): boolean {
  return !!db.prepare('SELECT 1 FROM sync_ops WHERE op_id = ?').get(opId);
}
export function markSyncOp(opId: string, appliedAt: string): void {
  db.prepare('INSERT OR IGNORE INTO sync_ops (op_id, applied_at) VALUES (?, ?)').run(opId, appliedAt);
}

// webhook_events — anti-rejeu (signature UNIQUE) + stockage payload.
export function insertWebhookEvent(source: string, receivedAt: string, payload: string, signature: string): { id: number; inserted: boolean } {
  const res = db.prepare('INSERT OR IGNORE INTO webhook_events (source, received_at, payload, signature) VALUES (?, ?, ?, ?)').run(
    source, receivedAt, payload, signature,
  );
  return { id: Number(res.lastInsertRowid), inserted: res.changes > 0 };
}
export function markWebhookProcessed(id: number): void {
  db.prepare('UPDATE webhook_events SET processed = 1 WHERE id = ?').run(id);
}

// outbox — file de notifications hors-app (dedupe_key UNIQUE).
export type OutboxRow = { id: number; channel: string; recipient: string; subject: string; body: string };
export function insertOutboxIfAbsent(
  dedupeKey: string, channel: string, recipient: string, subject: string, body: string, status: string, createdAt: string,
): { inserted: boolean } {
  const res = db.prepare(
    'INSERT OR IGNORE INTO outbox (dedupe_key, channel, recipient, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(dedupeKey, channel, recipient, subject, body, status, createdAt);
  return { inserted: res.changes > 0 };
}
export function listPendingOutbox(limit: number): OutboxRow[] {
  return db.prepare("SELECT id, channel, recipient, subject, body FROM outbox WHERE status = 'pending' ORDER BY id LIMIT ?").all(limit) as OutboxRow[];
}
export function markOutboxSent(id: number, sentAt: string): void {
  db.prepare("UPDATE outbox SET status = 'sent', sent_at = ? WHERE id = ?").run(sentAt, id);
}
export function markOutboxFailed(id: number, error: string): void {
  db.prepare("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?").run(error, id);
}

// --- Web Push subscriptions ---
export type PushSubRow = { endpoint: string; p256dh: string; auth: string };
export function insertPushSub(endpoint: string, memberId: string, p256dh: string, auth: string, createdAt: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO push_subscriptions (endpoint, member_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(endpoint, memberId, p256dh, auth, createdAt);
}
export function listPushSubsForMember(memberId: string): PushSubRow[] {
  return db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ?').all(memberId) as PushSubRow[];
}
export function deletePushSub(endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}
