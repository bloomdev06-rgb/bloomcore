// Vérifications RBAC — exécuter : npx tsx server/rbac.check.ts
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { resolveRoles, buildContext, assertCanWrite, filterReadable } = await import('./rbac.ts');
const { applyWrite } = await import('./guards.ts');
const { setKv } = await import('./db.ts');
const { GuardError } = await import('./guards.ts');

const baseMember = (over: any = {}) => ({
  id: 'm1', firstName: 'A', lastName: 'B', phone: '+225', gender: 'H', birthDate: '2000-01-01',
  maritalStatus: 'Célibataire', profession: '', branch: 'church', level: 'Stagiaire',
  pastoralCursus: 'Aucun', baptismStatus: 'Non baptisé', departments: {}, entryDate: '2026-01-01',
  healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
  ...over,
});

// --- resolveRoles ---
const superAdmin = baseMember({ id: 'mem_sa' });
const admins = [{ id: 'adm_mem_sa', name: 'SA', subtitle: '', role: 'Super Admin' as const }];
assert.ok(resolveRoles(superAdmin as any, admins as any, []).includes('Super Admin'), 'Super Admin via admins');

const pasteur = baseMember({ id: 'm2', pastoralCursus: 'Pasteur Titulaire' });
assert.ok(resolveRoles(pasteur as any, [], []).includes('Pasteur'), 'Pasteur via cursus');

const ministre = baseMember({ id: 'm3' });
const ministries = [{ id: 'min1', name: 'M', description: '', tuteurId: 'm3' }];
assert.ok(resolveRoles(ministre as any, [], ministries as any).includes('Ministre'), 'Ministre via tuteurId');

const resp = baseMember({ id: 'm4', departments: { d1: 'Responsable' } });
assert.ok(resolveRoles(resp as any, [], []).includes('Responsable'), 'Responsable via departments');

const simple = baseMember({ id: 'm5' });
assert.deepEqual(resolveRoles(simple as any, [], []), ['Membre'], 'simple membre');

// --- assertCanWrite via contexte réel (DB :memory:) ---
setKv('permissions', { view_members: { Responsable: true } });
applyWrite('members', [superAdmin, pasteur, ministre, resp, simple, baseMember({ id: 'm6', departments: { d1: 'Membre' } })]);
applyWrite('admins', admins as any);
applyWrite('ministries', ministries as any);
applyWrite('departments', [{ id: 'd1', name: 'D1', ministryId: 'min1', type: 'normal' }]);

const ctxSimple = buildContext('m5')!;
assert.throws(
  () => assertCanWrite('permissions', ctxSimple, []),
  (e: any) => e instanceof GuardError && e.status === 403,
  'permissions refusé au simple membre',
);
assert.throws(
  () => assertCanWrite('members', ctxSimple, []),
  (e: any) => e instanceof GuardError && e.status === 403,
  'members refusé sans capacité view_members',
);

const ctxSA = buildContext('mem_sa')!;
assertCanWrite('permissions', ctxSA, []); // ne lève pas
assertCanWrite('members', ctxSA, []);

// Responsable : capacité OK (matrice), scope département — m6 partage d1, m5 non.
const ctxResp = buildContext('m4')!;
const allMembers = [superAdmin, pasteur, ministre, resp, simple, baseMember({ id: 'm6', departments: { d1: 'Membre' } })];
// Écriture whole-array (usage réel du client) éditant m6 dans son scope → OK.
assertCanWrite('members', ctxResp, allMembers.map((m: any) => (m.id === 'm6' ? { ...m, profession: 'edit' } : m)));
// Éditer un membre hors scope (m5) → rejeté.
assert.throws(
  () => assertCanWrite('members', ctxResp, allMembers.map((m: any) => (m.id === 'm5' ? { ...m, profession: 'edit' } : m))),
  (e: any) => e instanceof GuardError && e.status === 403,
  'édition hors scope département rejetée',
);
// S3 — suppression par omission : un tableau partiel qui omet des membres hors scope
// les tombstoniserait → doit être rejeté (avant, ça passait silencieusement).
assert.throws(
  () => assertCanWrite('members', ctxResp, [allMembers[5]]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'suppression par omission hors scope rejetée (S3)',
);

// Délégation : simple membre avec délégation toId obtient la capacité.
applyWrite('delegations', [{ id: 'del1', from: 'm4', to: 'M5', toId: 'm5', scope: 'd1', right: 'view_members' }]);
assertCanWrite('members', buildContext('m5')!, []); // capacité via délégation, aucun item touché

// Interdiction de déléguer le rapport spirituel Bloom Bus.
const ctxRespB = buildContext('m4')!;
assert.throws(
  () => assertCanWrite('delegations', ctxRespB, [{ id: 'del2', from: 'm4', to: 'X', toId: 'm6', scope: 'd1', right: 'rapport_bloom_bus_member' }]),
  (e: any) => e instanceof GuardError && e.status === 400,
  'délégation rapport_bloom_bus_member interdite',
);

// Scoping branche sur events pour non-privilégié.
assert.throws(
  () => assertCanWrite('events', ctxRespB, [{ id: 'ev1', title: 'X', type: 'special_inside', date: '2026-07-06', branch: 'light', closed: false }]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'event autre branche rejeté pour Responsable church',
);

// S4 — journal non falsifiable : un membre ne peut s'attribuer les actions d'autrui.
assert.throws(
  () => assertCanWrite('audits', ctxResp, [{ id: 'aud_x', operatorId: 'mem_sa', actionType: 'X' }]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'audit avec operatorId falsifié rejeté (S4)',
);
assertCanWrite('audits', ctxResp, [{ id: 'aud_y', operatorId: 'm4', actionType: 'X' }]); // son propre id → OK

// S4 — émission de notification vers autrui réservée à l'encadrement.
assert.throws(
  () => assertCanWrite('notifications', ctxSimple, [{ id: 'n1', targetMemberId: 'm3', title: 'x' }]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'notification vers autrui rejetée pour simple membre (S4)',
);
assertCanWrite('notifications', ctxSimple, [{ id: 'n2', targetMemberId: 'm5', title: 'x' }]); // la sienne → OK
assertCanWrite('notifications', ctxResp, [{ id: 'n3', targetMemberId: 'm3', title: 'x' }]); // encadrement → OK

// S2 — lecture filtrée par rôle réel (le confidentiel et la PII ne sont plus envoyés).
const reportSet = [
  { id: 'r_pub', targetBranch: 'church', confidential: false },
  { id: 'r_conf', targetBranch: 'church', confidential: true },
];
assert.ok(
  !filterReadable('reports', ctxSimple, reportSet).some((r: any) => r.confidential),
  'rapport confidentiel masqué au simple membre (S2)',
);
assert.ok(
  filterReadable('reports', buildContext('m3')!, reportSet).some((r: any) => r.confidential),
  'corps pastoral (Ministre) voit le confidentiel (S2)',
);
assert.deepEqual(
  filterReadable('members', ctxSimple, allMembers).map((m: any) => m.id),
  ['m5'],
  'simple membre ne lit que sa propre fiche (S2)',
);
assert.equal(
  filterReadable('members', buildContext('m2')!, allMembers).length,
  allMembers.length,
  'Pasteur (périmètre global) lit tous les membres (S2)',
);
assert.deepEqual(
  filterReadable('admins', ctxSimple, admins as any),
  [],
  'liste admins invisible au simple membre (S2)',
);

console.log('rbac.check OK');
