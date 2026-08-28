// Régression : « comment un onglet resté ouvert a-t-il pu écraser des données plus récentes,
// alors que j'avais bien enregistré ? »
//
// La protection anti-écrasement d'applyWrite était CONDITIONNÉE à la présence d'`asOf` :
//     if (old && asOf && old.updatedAt > asOf) → conflit
// Sans `asOf`, la condition est fausse et le serveur acceptait tout, en pur
// dernier-écrivain-gagne. Or seule une ÉCRITURE réussie posait un `asOf` côté client : un
// navigateur qui venait de charger l'application, ou dont le cache avait été vidé, écrivait
// donc sans aucune protection. C'est ainsi que des promotions de membres ont été effacées.
//
// Règle désormais : une écriture de SYNCHRONISATION client sans `asOf` ne peut qu'AJOUTER.
// Elle ne modifie ni ne supprime l'existant — ce qu'elle ne peut pas prouver avoir lu, elle
// n'a pas le droit de le détruire. Les écritures serveur ciblées (POST/PATCH /members…)
// gardent leur comportement : elles sont explicites et déjà contrôlées par le RBAC.
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { applyWrite, readCollection } = await import('./guards.ts');

// État serveur : un membre promu responsable.
await applyWrite('members', [{ id: 'm1', firstName: 'Awa', departments: { dept_bus: 'responsable' } }]);
const promu = (await readCollection('members')).find((m: any) => m.id === 'm1');
assert.equal(promu.departments.dept_bus, 'responsable');

// Un onglet périmé repousse SA version : le membre n'a pas encore été promu, et il ignore
// tout de la promotion. Sans asOf et en mode synchronisation client, la modification est
// refusée et signalée en conflit.
const perime = [{ id: 'm1', firstName: 'Awa', departments: { dept_bus: 'membre' } }];
const r1 = await applyWrite('members', perime, undefined, new Set(), true);
assert.deepEqual(r1.conflicts, ['m1'], 'la modification sans asOf doit être refusée');
assert.equal(
  (await readCollection('members')).find((m: any) => m.id === 'm1').departments.dept_bus,
  'responsable',
  'la promotion doit survivre à la poussée périmée',
);

// Le même onglet périmé peut toujours AJOUTER : un nouveau membre saisi hors ligne n'est
// jamais perdu, c'est tout l'intérêt du repli offline-first.
const r2 = await applyWrite(
  'members',
  [...perime, { id: 'm2', firstName: 'Nouveau', departments: {} }],
  undefined, new Set(), true,
);
assert.ok(r2.added.some((m: any) => m.id === 'm2'), 'un ajout reste possible sans asOf');
assert.equal((await readCollection('members')).length, 2);

// …et il ne peut pas non plus SUPPRIMER par omission : un payload qui ne contient pas m1
// ne doit pas le mettre à la corbeille.
const r3 = await applyWrite('members', [{ id: 'm2', firstName: 'Nouveau', departments: {} }], undefined, new Set(), true);
assert.ok(r3.conflicts.includes('m1'), 'la suppression par omission sans asOf doit être refusée');
assert.equal((await readCollection('members')).length, 2, 'm1 doit toujours être vivant');

// Écriture SERVEUR (clientSync=false, le défaut) : comportement inchangé, elle modifie.
await applyWrite('members', [{ id: 'm1', firstName: 'Awa', departments: { dept_bus: 'adjoint' } }]);
assert.equal(
  (await readCollection('members')).find((m: any) => m.id === 'm1').departments.dept_bus,
  'adjoint',
  'les écritures serveur ciblées restent autorisées',
);

console.log('staleWrite.check OK');
