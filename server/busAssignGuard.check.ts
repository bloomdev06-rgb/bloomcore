// §27 côté SERVEUR : l'attribution d'une fonction Bloom Bus est refusée hors périmètre ou
// au-dessus de son niveau, quel que soit le chemin d'écriture (formulaire, import, appel API
// direct). Le contrôle ne peut pas vivre seulement dans l'interface : c'est précisément par un
// appel direct qu'on le contournerait.
//
// Depuis la séparation DÉPARTEMENT / MODULE, la fonction territoriale vit dans `busRole` ;
// `departments[<dept bloom_bus>]` ne porte plus que de vraies fonctions de département.
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { setCollection, setKv } = await import('./datastore.ts');
const { assertCanWrite, buildContext } = await import('./rbac.ts');
const { GuardError } = await import('./guards.ts');

await setCollection('departments', [
  { id: 'dept_bloom_bus', name: 'Bloom Bus', type: 'special', specialFunction: 'bloom_bus', ministryId: 'min_expansion', description: '' },
]);
await setCollection('ministries', [{ id: 'min_expansion', name: 'Expansion', description: '', tuteurId: 'ministre' }]);
await setCollection('admins', [{ id: 'adm_boss', name: 'Boss', subtitle: '', role: 'Admin' }]);
await setCollection('bus_lines', [
  { id: 'bus_a', name: 'A', zone: 'Zone Nord', commune: 'Abobo', centerLat: 5, centerLng: -4 },
  { id: 'bus_c', name: 'C', zone: 'Zone Sud', commune: 'Koumassi', centerLat: 5, centerLng: -4 },
]);

const base = (id: string, busRole: string | undefined, busId?: string, deptFn?: string) => ({
  id, firstName: id, lastName: '', phone: `+225${id}`, email: `${id}@x.test`, gender: 'H',
  birthDate: '1990-01-01', maritalStatus: 'Célibataire', profession: 'X', entryDate: '2026-01-01',
  branch: 'church', level: 'boss', pastoralCursus: 'aucun', bloomBusId: busId, busRole,
  departments: deptFn ? { dept_bloom_bus: deptFn } : {},
  healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
  baptismStatus: 'non_baptise',
});
await setCollection('members', [
  base('rz', 'responsable_zone', 'bus_a'),   // Responsable de Zone Nord (fonction du MODULE)
  base('proche', undefined, 'bus_a'),        // dans sa zone
  base('loin', undefined, 'bus_c'),          // autre zone
  base('boss', undefined),                   // compte Admin
]);
await setKv('permissions', { view_members: { Membre: true, Admin: true, 'Responsable de Zone': true } });

const all = async () => (await import('./guards.ts')).readCollection('members');
// Modification de la fonction TERRITORIALE (module).
const withBusRole = async (id: string, busRole: string | undefined) =>
  (await all()).map((m: any) => (m.id === id ? { ...m, busRole } : m));
// Modification de la fonction DE DÉPARTEMENT.
const withDeptFn = async (id: string, fn: string) =>
  (await all()).map((m: any) => (m.id === id ? { ...m, departments: { dept_bloom_bus: fn } } : m));

const rejette = async (payload: any, ctxId: string, status: number, why: string) => {
  const ctx = await buildContext(ctxId);
  await assert.rejects(
    () => assertCanWrite('members', ctx!, payload),
    (e: any) => e instanceof GuardError && e.status === status,
    why,
  );
};
const accepte = async (payload: any, ctxId: string, why: string) => {
  const ctx = await buildContext(ctxId);
  await assertCanWrite('members', ctx!, payload); // ne doit pas lever
  assert.ok(true, why);
};

// --- Fonction territoriale (busRole) ------------------------------------------------------
// Dans sa zone, sous son niveau : autorisé.
await accepte(await withBusRole('proche', 'capitaine'), 'rz', 'un Resp. de Zone nomme un capitaine de sa zone');
// Hors de sa zone : refusé.
await rejette(await withBusRole('loin', 'capitaine'), 'rz', 403, 'hors de sa zone, ce doit être refusé');
// Son propre niveau : refusé.
await rejette(await withBusRole('proche', 'responsable_zone'), 'rz', 403, 'à son propre niveau, ce doit être refusé');
// Au-dessus : refusé.
await rejette(await withBusRole('proche', 'responsable_commune'), 'rz', 403, 'au-dessus de son niveau, ce doit être refusé');
// Un compte Admin passe partout (décision d).
await accepte(await withBusRole('loin', 'responsable_commune'), 'boss', 'un Admin nomme sans restriction');

// Le RETRAIT est contrôlé comme l'attribution, au rang de la fonction retirée : sinon un
// capitaine destituerait un responsable de commune en le « ramenant » à un rang qu'il domine.
await setCollection('members', [
  ...(await all()).filter((m: any) => m.id !== 'proche'),
  base('proche', 'responsable_commune', 'bus_a'),
]);
await rejette(await withBusRole('proche', undefined), 'rz', 403, 'on ne destitue pas plus haut que soi');
await accepte(await withBusRole('proche', undefined), 'boss', 'un Admin peut destituer');

// --- Emplacement département : plus aucun vocabulaire territorial -------------------------
// La valeur territoriale est refusée AVANT toute question de périmètre (400, pas 403) : c'est
// une erreur de modèle, pas de permission. Même un Admin ne peut pas la réintroduire, sinon
// deux chemins d'attribution coexisteraient à nouveau.
await rejette(await withDeptFn('proche', 'capitaine'), 'boss', 400,
  'une fonction territoriale n\'entre plus dans l\'emplacement département');

// Une VRAIE fonction de département reste une affectation ordinaire : elle n'ouvre pas le
// module et ne passe donc pas par la hiérarchie territoriale.
await accepte(await withDeptFn('proche', 'adjoint'), 'boss', 'adjoint du département = affectation ordinaire');

console.log('busAssignGuard.check OK');
