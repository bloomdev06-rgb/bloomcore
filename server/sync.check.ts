// Vérifications /sync/batch (logique idempotence + pipeline) — npx tsx server/sync.check.ts
// Teste la mécanique sans HTTP : mêmes primitives que la route (sync_ops + applyWrite).
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { db } = await import('./db.ts');
const { applyWrite, readCollection } = await import('./guards.ts');

// Simule le corps de la route pour un batch d'ops (sans RBAC — couvert par rbac.check).
async function runBatch(ops: { opId: string; name: string; value: any[] }[]) {
  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: { opId: string; error: string }[] = [];
  const seen = db.prepare('SELECT 1 FROM sync_ops WHERE op_id = ?');
  const mark = db.prepare('INSERT INTO sync_ops (op_id, applied_at) VALUES (?, ?)');
  for (const { opId, name, value } of ops) {
    if (seen.get(opId)) { skipped.push(opId); continue; }
    try {
      await applyWrite(name, value);
      mark.run(opId, new Date().toISOString());
      applied.push(opId);
    } catch (e: any) {
      errors.push({ opId, error: e.message });
    }
  }
  return { applied, skipped, errors };
}

// Application + idempotence
const r1 = await runBatch([{ opId: 'op1', name: 'members', value: [{ id: 'm1', name: 'A' }] }]);
assert.deepEqual(r1.applied, ['op1'], 'op appliquée');
const r2 = await runBatch([{ opId: 'op1', name: 'members', value: [{ id: 'm1', name: 'DIFFÉRENT' }] }]);
assert.deepEqual(r2.skipped, ['op1'], 'op rejouée = skipped, pas réappliquée');
assert.equal((await readCollection('members'))[0].name, 'A', 'valeur du replay ignorée');

// Ordre : deux ops sur la même collection, la 2e gagne (LWW dans l ordre du batch)
await runBatch([
  { opId: 'op2', name: 'members', value: [{ id: 'm1', name: 'B' }] },
  { opId: 'op3', name: 'members', value: [{ id: 'm1', name: 'C' }] },
]);
assert.equal((await readCollection('members'))[0].name, 'C', 'ordre du batch respecté');

// Une erreur n'avorte pas le batch
await applyWrite('audits', [{ id: 'a1', x: 1 }]);
const r3 = await runBatch([
  { opId: 'op4', name: 'audits', value: [{ id: 'a1', x: 'MUTÉ' }] }, // 409 guard
  { opId: 'op5', name: 'members', value: [{ id: 'm1', name: 'D' }] },
]);
assert.equal(r3.errors.length, 1, 'erreur isolée');
assert.deepEqual(r3.applied, ['op5'], 'les autres ops passent');
assert.equal((await readCollection('members'))[0].name, 'D');

// --- Contrat delta {upserts, deletes} (route PUT via deltaToWhole → pipeline inchangé) ---
const { deltaToWhole } = await import('./guards.ts');
// État de base : 3 events indépendants.
await applyWrite('events', [{ id: 'e1', t: 'A' }, { id: 'e2', t: 'B' }, { id: 'e3', t: 'C' }]);
const e2Before = (await readCollection('events')).find((e: any) => e.id === 'e2').updatedAt;

// Delta : upsert e1, delete e3, e2 non mentionné → doit rester INTACT.
const whole = await deltaToWhole('events', [{ id: 'e1', t: 'A2' }], ['e3']);
await applyWrite('events', whole);
const after = await readCollection('events'); // vivants seulement

assert.equal(after.find((e: any) => e.id === 'e1')?.t, 'A2', 'delta: upsert appliqué');
assert.ok(!after.find((e: any) => e.id === 'e3'), 'delta: delete explicite → tombstoné');
const e2After = after.find((e: any) => e.id === 'e2');
assert.ok(e2After, 'delta: item non mentionné NON supprimé (pas de tombstone par omission)');
assert.equal(e2After.updatedAt, e2Before, 'delta: item inchangé non réécrit (updatedAt préservé)');

console.log('sync.check OK');
