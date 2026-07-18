// M6 — runtime backend selector for the 6 DOMAIN-data functions (collections + KV).
// SQLite (db.ts, native node:sqlite, sync) is the legacy/test backend; PostgreSQL
// (store.ts, async Prisma) is the prod backend. Chosen by DATABASE_URL at boot.
//
// store.ts is LAZY-loaded on purpose: it does `import 'dotenv/config'` and pulls
// @prisma/client. The *.check.ts suites run under tsx WITHOUT .env → DATABASE_URL
// unset → usePostgres false → we never touch store.ts/Prisma, and the sync SQLite
// path is wrapped in async here. Auxiliary tables (credentials/tokens/sync_ops/
// webhook_events/outbox + raw `db`) stay in db.ts, sync, untouched.
import {
  getCollection as dbGetCollection,
  setCollection as dbSetCollection,
  mergeCollection as dbMergeCollection,
  appendToCollection as dbAppendToCollection,
  getKv as dbGetKv,
  setKv as dbSetKv,
} from './db.ts';

export const usePostgres = !!process.env.DATABASE_URL;

let pg: typeof import('./store.ts') | null = null;
async function backend() {
  if (!usePostgres) return null;
  pg ??= await import('./store.ts');
  return pg;
}

export async function getCollection(name: string): Promise<any[]> {
  const b = await backend();
  return b ? b.getCollection(name) : dbGetCollection(name);
}

export async function setCollection(name: string, items: any[]): Promise<void> {
  const b = await backend();
  return b ? b.setCollection(name, items) : dbSetCollection(name, items);
}

export async function mergeCollection(name: string, items: any[]): Promise<void> {
  const b = await backend();
  return b ? b.mergeCollection(name, items) : dbMergeCollection(name, items);
}

export async function appendToCollection(name: string, items: any[]): Promise<void> {
  const b = await backend();
  return b ? b.appendToCollection(name, items) : dbAppendToCollection(name, items);
}

export async function getKv<T>(key: string): Promise<T | null> {
  const b = await backend();
  return b ? b.getKv<T>(key) : dbGetKv<T>(key);
}

export async function setKv(key: string, value: unknown): Promise<void> {
  const b = await backend();
  return b ? b.setKv(key, value) : dbSetKv(key, value);
}
