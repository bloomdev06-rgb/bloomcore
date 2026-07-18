// Vérifications des invariants guards.ts — exécuter : npx tsx server/guards.check.ts
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { applyWrite, readCollection, GuardError } = await import('./guards.ts');
const { getCollection } = await import('./db.ts');

// --- audits : append-only ---
await applyWrite('audits', [{ id: 'a1', actionType: 'X', details: 'un' }]);
await applyWrite('audits', [{ id: 'a1', actionType: 'X', details: 'un' }, { id: 'a2', details: 'deux' }]);
assert.equal(getCollection('audits').length, 2, 'append ok');

// clés réordonnées = identique (canonical)
await applyWrite('audits', [{ details: 'un', id: 'a1', actionType: 'X' }, { id: 'a2', details: 'deux' }]);
assert.equal(getCollection('audits').length, 2, 'réordonnancement de clés toléré');

// mutation d'une entrée existante → 409
await assert.rejects(
  () => applyWrite('audits', [{ id: 'a1', actionType: 'X', details: 'MODIFIÉ' }, { id: 'a2', details: 'deux' }]),
  (e: any) => e instanceof GuardError && e.status === 409,
  'mutation audit rejetée',
);

// suppression d'une entrée existante → 409
await assert.rejects(
  () => applyWrite('audits', [{ id: 'a2', details: 'deux' }]),
  (e: any) => e instanceof GuardError && e.status === 409,
  'suppression audit rejetée',
);

// --- soft-delete générique ---
await applyWrite('members', [{ id: 'm1', name: 'Alice' }, { id: 'm2', name: 'Bob' }]);
await applyWrite('members', [{ id: 'm1', name: 'Alice' }]); // Bob "supprimé" côté UI
const all = getCollection('members');
const bob = all.find((m: any) => m.id === 'm2');
assert.ok(bob && bob.deletedAt, 'tombstone deletedAt posé');
assert.equal((await readCollection('members')).length, 1, 'tombstone invisible en lecture');
assert.equal((await readCollection('members', true)).length, 2, 'includeDeleted montre la corbeille');

// résurrection LWW documentée : re-push de l'ancien Bob sans deletedAt le ranime
await applyWrite('members', [{ id: 'm1', name: 'Alice' }, { id: 'm2', name: 'Bob' }]);
assert.equal((await readCollection('members')).length, 2, 'LWW: re-push ranime (comportement documenté)');

// --- notifications : dismiss = tombstone, pas de 409 ---
await applyWrite('notifications', [{ id: 'n1' }, { id: 'n2' }]);
await applyWrite('notifications', [{ id: 'n1' }]);
assert.equal((await readCollection('notifications')).length, 1, 'dismiss notification ok');

// --- asOf : conflits de version par item ---
await applyWrite('projects', [{ id: 'p1', name: 'Alpha' }]);
const stampedP1 = getCollection('projects').find((p: any) => p.id === 'p1');
assert.ok(stampedP1.updatedAt, 'updatedAt stampé sur écriture');

// client périmé (asOf antérieur à la dernière écriture serveur) édite → conflit, valeur serveur conservée
const staleAsOf = new Date(Date.parse(stampedP1.updatedAt) - 1000).toISOString();
const r1 = await applyWrite('projects', [{ id: 'p1', name: 'Alpha (stale edit)' }], staleAsOf);
assert.deepEqual(r1.conflicts, ['p1'], 'édition périmée détectée en conflit');
assert.equal(getCollection('projects').find((p: any) => p.id === 'p1').name, 'Alpha', 'valeur serveur non écrasée par un client périmé');

// client périmé omet p1 (ignorait son existence) → conflit, pas de tombstone
const r2 = await applyWrite('projects', [], staleAsOf);
assert.deepEqual(r2.conflicts, ['p1'], 'suppression implicite périmée détectée en conflit');
assert.equal((await readCollection('projects')).length, 1, 'client périmé : pas de tombstone sur un item hors de sa connaissance');

// client à jour (asOf = updatedAt courant) édite sans conflit
const r3 = await applyWrite('projects', [{ id: 'p1', name: 'Alpha v2' }], stampedP1.updatedAt);
assert.equal(r3.conflicts.length, 0, 'client à jour : pas de conflit');
assert.equal(getCollection('projects').find((p: any) => p.id === 'p1').name, 'Alpha v2', 'édition à jour appliquée');

// asOf omis : comportement LWW historique inchangé (cf. test ligne 40)
const r4 = await applyWrite('projects', [], undefined);
assert.equal(r4.conflicts.length, 0, 'asOf omis : pas de détection de conflit (comportement historique)');
assert.equal((await readCollection('projects')).length, 0, 'asOf omis : suppression par omission toujours appliquée (LWW)');

// --- #12 validation structurelle aux frontières ---
const badItem = (item: any) => () => applyWrite('members', [{ id: 'm1', name: 'Alice' }, item]);
await assert.rejects(badItem('pas-un-objet'), (e: any) => e instanceof GuardError && e.status === 400, 'item non-objet rejeté');
await assert.rejects(badItem(null), (e: any) => e instanceof GuardError && e.status === 400, 'item null rejeté');
await assert.rejects(badItem([1, 2]), (e: any) => e instanceof GuardError && e.status === 400, 'item tableau rejeté');
await assert.rejects(badItem({ name: 'sans id' }), (e: any) => e instanceof GuardError && e.status === 400, 'id manquant rejeté');
await assert.rejects(badItem({ id: 42 }), (e: any) => e instanceof GuardError && e.status === 400, 'id non-string rejeté');
// pollution de prototype : JSON.parse fait de "__proto__" une propriété propre énumérable
await assert.rejects(
  () => applyWrite('members', JSON.parse('[{"id":"m9","__proto__":{"admin":true}}]')),
  (e: any) => e instanceof GuardError && e.status === 400,
  'clé __proto__ rejetée',
);
// __proto__ imbriquée (pas seulement au premier niveau) — la validation est récursive
await assert.rejects(
  () => applyWrite('members', JSON.parse('[{"id":"m10","content":{"__proto__":{"x":1}}}]')),
  (e: any) => e instanceof GuardError && e.status === 400,
  'clé __proto__ imbriquée rejetée',
);

// --- #12 bornes de taille/profondeur (anti-abus, laisse passer le métier) ---
// un Member à ~54 champs légitimes passe
const fatButLegit: any = { id: 'm11' };
for (let i = 0; i < 54; i++) fatButLegit['champ' + i] = 'ok';
await applyWrite('members', [fatButLegit]); // ne throw pas
assert.ok((await readCollection('members')).some((m: any) => m.id === 'm11'), 'item à 54 champs accepté');
// trop de champs
const tooManyKeys: any = { id: 'm12' };
for (let i = 0; i < 101; i++) tooManyKeys['k' + i] = 1;
await assert.rejects(() => applyWrite('members', [tooManyKeys]), (e: any) => e instanceof GuardError && e.status === 400, 'trop de champs rejeté');
// avatar base64 inline (fallback hors-ligne / legacy) sous le plafond image 2 Mo → accepté
await applyWrite('members', [{ id: 'm13b', avatarUrl: 'data:image/jpeg;base64,' + 'A'.repeat(500_000) }]);
assert.ok((await readCollection('members')).some((m: any) => m.id === 'm13b'), 'avatar base64 ~0,5 Mo accepté');
// chaîne énorme (blob au-delà du plafond) rejetée
await assert.rejects(() => applyWrite('members', [{ id: 'm13', bio: 'x'.repeat(3_000_001) }]), (e: any) => e instanceof GuardError && e.status === 400, 'chaîne trop longue rejetée');
// tableau énorme
await assert.rejects(() => applyWrite('members', [{ id: 'm14', tags: new Array(5001).fill(1) }]), (e: any) => e instanceof GuardError && e.status === 400, 'tableau trop long rejeté');
// depth-bomb : 9 niveaux imbriqués > MAX_DEPTH(8)
let deep: any = 'x';
for (let i = 0; i < 9; i++) deep = { n: deep };
await assert.rejects(() => applyWrite('members', [{ id: 'm15', ...deep }]), (e: any) => e instanceof GuardError && e.status === 400, 'imbrication trop profonde rejetée');

// --- M2 : enforcement Zod des payloads de rapport sur la sync (nouveaux/modifiés seulement) ---
const adnOk = { nouveauxH: 2, nouveauxF: 3, ojH: 1, ojF: 0 };
// rapport adn valide accepté
await applyWrite('reports', [{ id: 'rep1', reportType: 'rapport_adn', content: adnOk }]);
assert.ok((await readCollection('reports')).some((r: any) => r.id === 'rep1'), 'rapport adn valide écrit');
// rapport adn invalide (compteur négatif) → 400, rien écrit
await assert.rejects(
  () => applyWrite('reports', [{ id: 'rep1', reportType: 'rapport_adn', content: adnOk }, { id: 'rep2', reportType: 'rapport_adn', content: { ...adnOk, ojH: -5 } }]),
  (e: any) => e instanceof GuardError && e.status === 400,
  'nouveau rapport adn invalide rejeté',
);
assert.ok(!(await readCollection('reports')).some((r: any) => r.id === 'rep2'), 'rapport invalide non écrit');
// LEGACY-SAFE : un rapport déjà stocké mais invalide, renvoyé INCHANGÉ, ne bloque pas la sync.
// On l'injecte directement en base (contourne applyWrite) pour simuler du legacy pré-validation.
const { mergeCollection } = await import('./db.ts');
mergeCollection('reports', [{ id: 'legacy1', reportType: 'rapport_adn', content: { nouveauxH: -99 }, updatedAt: '2020-01-01' }]);
await applyWrite('reports', [{ id: 'rep1', reportType: 'rapport_adn', content: adnOk }, { id: 'legacy1', reportType: 'rapport_adn', content: { nouveauxH: -99 }, updatedAt: '2020-01-01' }]);
assert.ok((await readCollection('reports')).some((r: any) => r.id === 'legacy1'), 'rapport legacy invalide inchangé toléré');
// mais si on MODIFIE ce legacy avec un payload toujours invalide → rejeté
await assert.rejects(
  () => applyWrite('reports', [{ id: 'legacy1', reportType: 'rapport_adn', content: { nouveauxH: -1, nouveauxF: 0, ojH: 0, ojF: 0 } }]),
  (e: any) => e instanceof GuardError && e.status === 400,
  'modification de legacy vers payload invalide rejetée',
);
// type sans schéma (rapport_culte) → passe (tightening incrémental)
await applyWrite('reports', [{ id: 'rep3', reportType: 'rapport_culte', content: { anything: true } }]);
assert.ok((await readCollection('reports')).some((r: any) => r.id === 'rep3'), 'type non schématisé accepté');

console.log('guards.check OK');
