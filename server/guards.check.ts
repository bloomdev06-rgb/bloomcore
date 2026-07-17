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

// --- asOf : conflits de version par item ---
applyWrite('projects', [{ id: 'p1', name: 'Alpha' }]);
const stampedP1 = getCollection('projects').find((p: any) => p.id === 'p1');
assert.ok(stampedP1.updatedAt, 'updatedAt stampé sur écriture');

// client périmé (asOf antérieur à la dernière écriture serveur) édite → conflit, valeur serveur conservée
const staleAsOf = new Date(Date.parse(stampedP1.updatedAt) - 1000).toISOString();
const r1 = applyWrite('projects', [{ id: 'p1', name: 'Alpha (stale edit)' }], staleAsOf);
assert.deepEqual(r1.conflicts, ['p1'], 'édition périmée détectée en conflit');
assert.equal(getCollection('projects').find((p: any) => p.id === 'p1').name, 'Alpha', 'valeur serveur non écrasée par un client périmé');

// client périmé omet p1 (ignorait son existence) → conflit, pas de tombstone
const r2 = applyWrite('projects', [], staleAsOf);
assert.deepEqual(r2.conflicts, ['p1'], 'suppression implicite périmée détectée en conflit');
assert.equal(readCollection('projects').length, 1, 'client périmé : pas de tombstone sur un item hors de sa connaissance');

// client à jour (asOf = updatedAt courant) édite sans conflit
const r3 = applyWrite('projects', [{ id: 'p1', name: 'Alpha v2' }], stampedP1.updatedAt);
assert.equal(r3.conflicts.length, 0, 'client à jour : pas de conflit');
assert.equal(getCollection('projects').find((p: any) => p.id === 'p1').name, 'Alpha v2', 'édition à jour appliquée');

// asOf omis : comportement LWW historique inchangé (cf. test ligne 40)
const r4 = applyWrite('projects', [], undefined);
assert.equal(r4.conflicts.length, 0, 'asOf omis : pas de détection de conflit (comportement historique)');
assert.equal(readCollection('projects').length, 0, 'asOf omis : suppression par omission toujours appliquée (LWW)');

// --- #12 validation structurelle aux frontières ---
const badItem = (item: any) => () => applyWrite('members', [{ id: 'm1', name: 'Alice' }, item]);
assert.throws(badItem('pas-un-objet'), (e: any) => e instanceof GuardError && e.status === 400, 'item non-objet rejeté');
assert.throws(badItem(null), (e: any) => e instanceof GuardError && e.status === 400, 'item null rejeté');
assert.throws(badItem([1, 2]), (e: any) => e instanceof GuardError && e.status === 400, 'item tableau rejeté');
assert.throws(badItem({ name: 'sans id' }), (e: any) => e instanceof GuardError && e.status === 400, 'id manquant rejeté');
assert.throws(badItem({ id: 42 }), (e: any) => e instanceof GuardError && e.status === 400, 'id non-string rejeté');
// pollution de prototype : JSON.parse fait de "__proto__" une propriété propre énumérable
assert.throws(
  () => applyWrite('members', JSON.parse('[{"id":"m9","__proto__":{"admin":true}}]')),
  (e: any) => e instanceof GuardError && e.status === 400,
  'clé __proto__ rejetée',
);

console.log('guards.check OK');
