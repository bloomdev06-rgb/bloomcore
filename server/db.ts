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
import { fileURLToPath } from 'node:url';

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
    password_hash TEXT NOT NULL
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
`);

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
