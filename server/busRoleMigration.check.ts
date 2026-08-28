// §27 — la migration qui rend possible le CUMUL « fonction de département + fonction
// territoriale ». Elle tourne au démarrage du serveur : elle doit être idempotente, ne jamais
// rétrograder personne, et ne jamais écrire si quelqu'un y perdrait sa fonction.
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { setCollection, getCollection } = await import('./datastore.ts');
const { migrateBusRoles } = await import('./migrateBusRoles.ts');
const { bloomBusRoleOf } = await import('../packages/domain/scope.ts');

const DEPTS = [
  { id: 'bus_church', name: 'Bloom Bus', specialFunction: 'bloom_bus', branch: 'church', type: 'special', ministryId: 'm', description: '' },
  { id: 'bus_light', name: 'Light Bus', specialFunction: 'bloom_bus', branch: 'light', type: 'special', ministryId: 'm', description: '' },
  { id: 'praise', name: 'Bloom Praise', type: 'normal', ministryId: 'm', description: '' },
];
const M = (id: string, departments: any, extra: any = {}) =>
  ({ id, firstName: id, lastName: '', departments, ...extra });

await setCollection('departments', DEPTS);
await setCollection('members', [
  M('cap', { bus_church: 'capitaine' }, { deptBranches: { bus_church: 'church' } }),
  M('respDept', { bus_church: 'responsable', praise: 'membre' }),
  M('cumulTerr', { bus_church: 'capitaine', bus_light: 'responsable_commune' }),
  M('adjointEtCap', { bus_light: 'adjoint', bus_church: 'responsable_zone' }),
  M('ancienFormat', { bus_church: 'Capitaine de Bus' }),
  M('dejaBusRole', { bus_church: 'capitaine' }, { busRole: 'responsable_commune' }),
  M('horsBus', { praise: 'responsable' }),
]);

const r = await migrateBusRoles(true);
assert.equal(r.applied, true);
assert.deepEqual(r.wouldLose, [], 'personne ne doit perdre sa fonction');

const apres = new Map((await getCollection('members')).map((m: any) => [m.id, m]));
const m = (id: string) => apres.get(id) as any;

// La fonction territoriale a changé d'emplacement, sans changer de valeur.
assert.equal(m('cap').busRole, 'capitaine');
assert.deepEqual(m('cap').departments, {}, 'sans fonction propre au département, il en sort');
assert.equal(m('cap').deptBranches, undefined, 'la branche de l\'affectation retirée part avec elle');

// LE CUMUL, la raison d'être de cette migration : adjoint DU DÉPARTEMENT et responsable de
// zone DU MODULE coexistent désormais, ce qui était impossible dans un emplacement unique.
assert.deepEqual(m('adjointEtCap').departments, { bus_light: 'adjoint' });
assert.equal(m('adjointEtCap').busRole, 'responsable_zone');
assert.equal(bloomBusRoleOf(m('adjointEtCap'), DEPTS as any), 'Responsable de Zone');

// Une vraie fonction de département n'est pas touchée : le responsable reste responsable, et
// le pont lui donne le sommet du module sans busRole.
assert.deepEqual(m('respDept').departments, { bus_church: 'responsable', praise: 'membre' });
assert.equal(m('respDept').busRole, undefined);
assert.equal(bloomBusRoleOf(m('respDept'), DEPTS as any), 'Responsable');

// Cumul de deux valeurs territoriales (une par branche) : la plus haute l'emporte.
assert.equal(m('cumulTerr').busRole, 'responsable_commune');
// Orthographe d'avant M5, migrée elle aussi.
assert.equal(m('ancienFormat').busRole, 'capitaine');
// Jamais de rétrogradation d'un busRole déjà en place.
assert.equal(m('dejaBusRole').busRole, 'responsable_commune');
// Aucun rapport avec Bloom Bus : intouché.
assert.deepEqual(m('horsBus').departments, { praise: 'responsable' });
assert.equal(m('horsBus').updatedAt, undefined, 'pas de réécriture inutile');

// IDEMPOTENCE — c'est ce qui autorise l'exécution à chaque démarrage.
const r2 = await migrateBusRoles(true);
assert.equal(r2.changes.length, 0, 'second passage : rien à faire');
assert.equal(r2.applied, false, 'et donc aucune écriture');

// Base sans département Bloom Bus : pas d'exception, pas d'écriture.
await setCollection('departments', [DEPTS[2]]);
const r3 = await migrateBusRoles(true);
assert.deepEqual([r3.busDepartments.length, r3.changes.length, r3.applied], [0, 0, false]);

console.log('busRoleMigration.check OK');
