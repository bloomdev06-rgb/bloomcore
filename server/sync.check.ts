// Vérifications /sync/batch (logique idempotence + pipeline) — npx tsx server/sync.check.ts
// Teste la mécanique sans HTTP : mêmes primitives que la route (sync_ops + applyWrite).
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { db } = await import('./db.ts');
const { applyWrite, readCollection } = await import('./guards.ts');

// Simule le corps de la route pour un batch d'ops (sans RBAC — couvert par rbac.check).
function runBatch(ops: { opId: string; name: string; value: any[] }[]) {
  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: { opId: string; error: string }[] = [];
  const seen = db.prepare('SELECT 1 FROM sync_ops WHERE op_id = ?');
  const mark = db.prepare('INSERT INTO sync_ops (op_id, applied_at) VALUES (?, ?)');
  for (const { opId, name, value } of ops) {
    if (seen.get(opId)) { skipped.push(opId); continue; }
    try {
      applyWrite(name, value);
      mark.run(opId, new Date().toISOString());
      applied.push(opId);
    } catch (e: any) {
      errors.push({ opId, error: e.message });
    }
  }
  return { applied, skipped, errors };
}

// Application + idempotence
const r1 = runBatch([{ opId: 'op1', name: 'members', value: [{ id: 'm1', name: 'A' }] }]);
assert.deepEqual(r1.applied, ['op1'], 'op appliquée');
const r2 = runBatch([{ opId: 'op1', name: 'members', value: [{ id: 'm1', name: 'DIFFÉRENT' }] }]);
assert.deepEqual(r2.skipped, ['op1'], 'op rejouée = skipped, pas réappliquée');
assert.equal(readCollection('members')[0].name, 'A', 'valeur du replay ignorée');

// Ordre : deux ops sur la même collection, la 2e gagne (LWW dans l ordre du batch)
runBatch([
  { opId: 'op2', name: 'members', value: [{ id: 'm1', name: 'B' }] },
  { opId: 'op3', name: 'members', value: [{ id: 'm1', name: 'C' }] },
]);
assert.equal(readCollection('members')[0].name, 'C', 'ordre du batch respecté');

// Une erreur n'avorte pas le batch
applyWrite('audits', [{ id: 'a1', x: 1 }]);
const r3 = runBatch([
  { opId: 'op4', name: 'audits', value: [{ id: 'a1', x: 'MUTÉ' }] }, // 409 guard
  { opId: 'op5', name: 'members', value: [{ id: 'm1', name: 'D' }] },
]);
assert.equal(r3.errors.length, 1, 'erreur isolée');
assert.deepEqual(r3.applied, ['op5'], 'les autres ops passent');
assert.equal(readCollection('members')[0].name, 'D');

console.log('sync.check OK');
