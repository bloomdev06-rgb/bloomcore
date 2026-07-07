// Vérifications des invariants guards.ts — exécuter : npx tsx server/guards.check.ts
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { applyWrite, readCollection, GuardError } = await import('./guards.ts');
const { getCollection } = await import('./db.ts');

// --- audits : append-only ---
applyWrite('audits', [{ id: 'a1', actionType: 'X', details: 'un' }]);
applyWrite('audits', [{ id: 'a1', actionType: 'X', details: 'un' }, { id: 'a2', details: 'deux' }]);
assert.equal(getCollection('audits').length, 2, 'append ok');

// clés réordonnées = identique (canonical)
applyWrite('audits', [{ details: 'un', id: 'a1', actionType: 'X' }, { id: 'a2', details: 'deux' }]);
assert.equal(getCollection('audits').length, 2, 'réordonnancement de clés toléré');

// mutation d'une entrée existante → 409
assert.throws(
  () => applyWrite('audits', [{ id: 'a1', actionType: 'X', details: 'MODIFIÉ' }, { id: 'a2', details: 'deux' }]),
  (e: any) => e instanceof GuardError && e.status === 409,
  'mutation audit rejetée',
);

// suppression d'une entrée existante → 409
assert.throws(
  () => applyWrite('audits', [{ id: 'a2', details: 'deux' }]),
  (e: any) => e instanceof GuardError && e.status === 409,
  'suppression audit rejetée',
);

// --- soft-delete générique ---
applyWrite('members', [{ id: 'm1', name: 'Alice' }, { id: 'm2', name: 'Bob' }]);
applyWrite('members', [{ id: 'm1', name: 'Alice' }]); // Bob "supprimé" côté UI
const all = getCollection('members');
const bob = all.find((m: any) => m.id === 'm2');
assert.ok(bob && bob.deletedAt, 'tombstone deletedAt posé');
assert.equal(readCollection('members').length, 1, 'tombstone invisible en lecture');
assert.equal(readCollection('members', true).length, 2, 'includeDeleted montre la corbeille');

// résurrection LWW documentée : re-push de l'ancien Bob sans deletedAt le ranime
applyWrite('members', [{ id: 'm1', name: 'Alice' }, { id: 'm2', name: 'Bob' }]);
assert.equal(readCollection('members').length, 2, 'LWW: re-push ranime (comportement documenté)');

// --- notifications : dismiss = tombstone, pas de 409 ---
applyWrite('notifications', [{ id: 'n1' }, { id: 'n2' }]);
applyWrite('notifications', [{ id: 'n1' }]);
assert.equal(readCollection('notifications').length, 1, 'dismiss notification ok');

console.log('guards.check OK');
