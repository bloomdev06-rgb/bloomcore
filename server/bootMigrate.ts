// M6 — one-shot blob→Postgres migration at boot. No-op unless DATABASE_URL is
// set (legacy SQLite mode). Idempotent: guarded by the `_m6_migrated` KV flag in
// Postgres. Imports the existing SQLite document store (the /data volume) into
// Postgres ONCE, then flips the flag. store.ts is lazy-imported so the SQLite
// path (and *.check.ts suites) never pulls in Prisma.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runBootMigration(): Promise<void> {
  if (!process.env.DATABASE_URL) return; // legacy SQLite backend — nothing to do
  const store = await import('./store.ts');
  if (await store.getKv('_m6_migrated')) return; // already migrated

  const sqlitePath = process.env.BLOOMCORE_DB || path.join(__dirname, 'bloomcore.db');
  if (fs.existsSync(sqlitePath)) {
    const result = await store.migrateFromSqlite(sqlitePath);
    console.log('[M6] migration blob→PG', result);
  } else {
    console.log(`[M6] rien à migrer (pas de SQLite à ${sqlitePath})`);
  }
  await store.setKv('_m6_migrated', new Date().toISOString());
}
