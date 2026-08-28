// §27 côté SERVEUR : l'attribution d'une fonction Bloom Bus est refusée hors périmètre ou
// au-dessus de son niveau, quel que soit le chemin d'écriture (formulaire, import, appel API
// direct). Le contrôle ne peut pas vivre seulement dans l'interface : c'est précisément par un
// appel direct qu'on le contournerait.
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

const base = (id: string, fn: string | undefined, busId?: string) => ({
  id, firstName: id, lastName: '', phone: `+225${id}`, email: `${id}@x.test`, gender: 'H',
  birthDate: '1990-01-01', maritalStatus: 'Célibataire', profession: 'X', entryDate: '2026-01-01',
  branch: 'church', level: 'boss', pastoralCursus: 'aucun', bloomBusId: busId,
  departments: fn ? { dept_bloom_bus: fn } : {},
  healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
  baptismStatus: 'non_baptise',
});
await setCollection('members', [
  base('rz', 'responsable_zone', 'bus_a'),   // Responsable de Zone Nord
  base('proche', 'membre', 'bus_a'),         // dans sa zone
  base('loin', 'membre', 'bus_c'),           // autre zone
  base('boss', undefined),                   // compte Admin
]);
await setKv('permissions', { view_members: { Membre: true, Admin: true, 'Responsable de Zone': true } });

const all = async () => (await import('./guards.ts')).readCollection('members');
const withFn = async (id: string, fn: string) =>
  (await all()).map((m: any) => (m.id === id ? { ...m, departments: { dept_bloom_bus: fn } } : m));

const refuse = async (ctxId: string, id: string, fn: string, why: string) => {
  const ctx = await buildContext(ctxId);
  const payload = await withFn(id, fn);
  await assert.rejects(
    () => assertCanWrite('members', ctx!, payload),
    (e: any) => e instanceof GuardError && e.status === 403,
    why,
  );
};
const accepte = async (ctxId: string, id: string, fn: string, why: string) => {
  const ctx = await buildContext(ctxId);
  await assertCanWrite('members', ctx!, await withFn(id, fn)); // ne doit pas lever
  assert.ok(true, why);
};

// Dans sa zone, sous son niveau : autorisé.
await accepte('rz', 'proche', 'capitaine', 'un Resp. de Zone nomme un capitaine de sa zone');
// Hors de sa zone : refusé.
await refuse('rz', 'loin', 'capitaine', 'hors de sa zone, ce doit être refusé');
// Son propre niveau : refusé.
await refuse('rz', 'proche', 'responsable_zone', 'à son propre niveau, ce doit être refusé');
// Au-dessus : refusé.
await refuse('rz', 'proche', 'responsable_commune', 'au-dessus de son niveau, ce doit être refusé');
// Un compte Admin passe partout (décision d).
await accepte('boss', 'loin', 'responsable_commune', 'un Admin nomme sans restriction');

console.log('busAssignGuard.check OK');
