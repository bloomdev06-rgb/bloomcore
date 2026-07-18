// Proves server/store.ts works against the live Postgres (DATABASE_URL in .env).
// Run: npx tsx server/store.check.ts  → must print 'store.check OK'.
import 'dotenv/config';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { prisma, getCollection, setCollection, mergeCollection, getKv, setKv, migrateFromSqlite } from './store.ts';

// Every collection model + the projection + Kv, for the clean-slate wipe.
const MODELS = [
  'member', 'event', 'report', 'audit', 'notification', 'ministry', 'department',
  'activity', 'project', 'bloomBus', 'certification', 'integrationReport',
  'formDefinition', 'delegation', 'adminAccount', 'capabilityOverride', 'specialAuthorization',
];

async function cleanSlate() {
  await (prisma as any).departmentMembership.deleteMany({}); // FK-safe (also cascades on member wipe)
  for (const m of MODELS) await (prisma as any)[m].deleteMany({});
  await prisma.kv.deleteMany({});
}

async function main() {
  // 1. Clean slate.
  await cleanSlate();

  const m1 = { id: 'm1', branch: 'church', level: 'coach', departments: { dept_a: 'responsable', dept_b: 'membre' }, deptSections: { dept_a: 'sec1' } };
  const m2 = { id: 'm2', branch: 'church', level: 'boss', departments: { dept_c: 'membre' } };

  // 2. Round-trip.
  await setCollection('members', [m1, m2]);
  const got = await getCollection('members');
  assert.equal(got.length, 2, 'expected 2 members');
  assert.deepEqual(got.find((x) => x.id === 'm1'), m1, 'm1 data round-trip');
  assert.deepEqual(got.find((x) => x.id === 'm2'), m2, 'm2 data round-trip');
  assert.equal(await prisma.departmentMembership.count(), 3, 'expected 3 memberships (2 + 1)');
  const depA = await prisma.departmentMembership.findUnique({ where: { id: 'm1::dept_a' } });
  assert.ok(depA, 'm1::dept_a membership exists');
  assert.equal(depA!.function, 'responsable', 'dept_a function');
  assert.equal(depA!.sectionId, 'sec1', 'dept_a sectionId');

  // 3. Promoted columns.
  const rawM1 = await prisma.member.findUnique({ where: { id: 'm1' } });
  assert.equal(rawM1!.branch, 'church', 'promoted branch');
  assert.equal(rawM1!.level, 'coach', 'promoted level');

  // 4. mergeCollection tombstone — no delete, re-syncs memberships.
  await mergeCollection('members', [{ ...m1, deletedAt: '2026-01-01' }]);
  const afterMerge = await getCollection('members');
  assert.equal(afterMerge.length, 2, 'merge must not delete rows');
  assert.equal(afterMerge.find((x) => x.id === 'm1').deletedAt, '2026-01-01', 'm1.data.deletedAt set');
  const rawM1b = await prisma.member.findUnique({ where: { id: 'm1' } });
  assert.equal(rawM1b!.deletedAt, '2026-01-01', 'promoted deletedAt set');
  assert.equal(await prisma.departmentMembership.count({ where: { memberId: 'm1' } }), 2, 'm1 memberships re-synced');

  // 5. setCollection replace shrinks — m2 gone, memberships pruned.
  await setCollection('members', [m1]);
  assert.equal((await getCollection('members')).length, 1, 'setCollection shrinks to 1');
  assert.equal(await prisma.departmentMembership.count(), 2, "only m1's memberships remain");

  // 6. KV.
  await setKv('settings', { timezone: 'Africa/Abidjan' });
  const settings = await getKv<{ timezone: string }>('settings');
  assert.equal(settings!.timezone, 'Africa/Abidjan', 'kv round-trip');

  // 7. Migration from a temp SQLite with OLD enum values → canonicalized in PG.
  const tmpPath = path.join(os.tmpdir(), `store-check-${Date.now()}.db`);
  try {
    const sdb = new DatabaseSync(tmpPath);
    sdb.exec('CREATE TABLE collections (name TEXT, id TEXT, data TEXT, PRIMARY KEY(name,id)); CREATE TABLE kv (key TEXT PRIMARY KEY, data TEXT);');
    const oldMember = { id: 'mig1', branch: 'church', level: 'Boss', departments: { dept_x: 'Responsable de Zone' } };
    sdb.prepare('INSERT INTO collections (name, id, data) VALUES (?, ?, ?)').run('members', 'mig1', JSON.stringify(oldMember));
    sdb.prepare('INSERT INTO kv (key, data) VALUES (?, ?)').run('settings', JSON.stringify({ timezone: 'Africa/Abidjan' }));
    sdb.prepare('INSERT INTO kv (key, data) VALUES (?, ?)').run('_m5_migrated', JSON.stringify('x')); // internal → must be skipped
    sdb.close();

    const res = await migrateFromSqlite(tmpPath);
    assert.equal(res.collections.members, 1, 'migrated 1 member');
    assert.deepEqual(res.kv, ['settings'], 'only domain kv keys migrated');

    const migrated = (await getCollection('members')).find((x) => x.id === 'mig1');
    assert.ok(migrated, 'migrated member present');
    assert.equal(migrated.level, 'boss', 'level canonicalized Boss→boss');
    assert.equal(migrated.departments.dept_x, 'responsable_zone', 'dept fn canonicalized');
    const migMembership = await prisma.departmentMembership.findUnique({ where: { id: 'mig1::dept_x' } });
    assert.ok(migMembership, 'migrated membership exists');
    assert.equal(migMembership!.function, 'responsable_zone', 'membership function canonicalized');
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }

  console.log('store.check OK');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  await prisma.$disconnect().catch(() => {});
  throw e;
});
