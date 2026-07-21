// Vérifications RBAC — exécuter : npx tsx server/rbac.check.ts
import assert from 'node:assert';
process.env.BLOOMCORE_DB = ':memory:';
const { resolveRoles, buildContext, assertCanWrite, filterReadable, preservedIds } = await import('./rbac.ts');
const { applyWrite, readCollection } = await import('./guards.ts');
const { setKv } = await import('./db.ts');
const { GuardError } = await import('./guards.ts');

const baseMember = (over: any = {}) => ({
  id: 'm1', firstName: 'A', lastName: 'B', phone: '+225', gender: 'H', birthDate: '2000-01-01',
  maritalStatus: 'Célibataire', profession: '', branch: 'church', level: 'stagiaire',
  pastoralCursus: 'aucun', baptismStatus: 'non_baptise', departments: {}, entryDate: '2026-01-01',
  healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
  ...over,
});

// --- resolveRoles ---
const superAdmin = baseMember({ id: 'mem_sa' });
const admins = [{ id: 'adm_mem_sa', name: 'SA', subtitle: '', role: 'Super Admin' as const }];
assert.ok(resolveRoles(superAdmin as any, admins as any, []).includes('Super Admin'), 'Super Admin via admins');

const pasteur = baseMember({ id: 'm2', pastoralCursus: 'pasteur_titulaire' });
assert.ok(resolveRoles(pasteur as any, [], []).includes('Pasteur'), 'Pasteur via cursus');

const ministre = baseMember({ id: 'm3' });
const ministries = [{ id: 'min1', name: 'M', description: '', tuteurId: 'm3' }];
assert.ok(resolveRoles(ministre as any, [], ministries as any).includes('Ministre'), 'Ministre via tuteurId');

const resp = baseMember({ id: 'm4', departments: { d1: 'responsable' } });
assert.ok(resolveRoles(resp as any, [], []).includes('Responsable'), 'Responsable via departments');

const simple = baseMember({ id: 'm5' });
assert.deepEqual(resolveRoles(simple as any, [], []), ['Membre'], 'simple membre');

// --- assertCanWrite via contexte réel (DB :memory:) ---
setKv('permissions', { view_members: { Responsable: true } });
await applyWrite('members', [superAdmin, pasteur, ministre, resp, simple, baseMember({ id: 'm6', departments: { d1: 'membre' } }), baseMember({ id: 'm7' })]);
await applyWrite('admins', [...admins, { id: 'adm_m7', name: 'AD', subtitle: '', role: 'Admin' }] as any);
await applyWrite('ministries', ministries as any);
await applyWrite('departments', [{ id: 'd1', name: 'D1', ministryId: 'min1', type: 'normal' }]);

const ctxSimple = (await buildContext('m5'))!;
await assert.rejects(
  () => assertCanWrite('permissions', ctxSimple, []),
  (e: any) => e instanceof GuardError && e.status === 403,
  'permissions refusé au simple membre',
);
await assert.rejects(
  () => assertCanWrite('members', ctxSimple, []),
  (e: any) => e instanceof GuardError && e.status === 403,
  'members refusé sans capacité view_members',
);

const ctxSA = (await buildContext('mem_sa'))!;
await assertCanWrite('permissions', ctxSA, []); // ne lève pas
await assertCanWrite('members', ctxSA, []);

// Responsable : capacité OK (matrice), scope département — m6 partage d1, m5 non.
const ctxResp = (await buildContext('m4'))!;
const allMembers = [superAdmin, pasteur, ministre, resp, simple, baseMember({ id: 'm6', departments: { d1: 'membre' } })];
// Écriture whole-array (usage réel du client) éditant m6 dans son scope → OK.
await assertCanWrite('members', ctxResp, allMembers.map((m: any) => (m.id === 'm6' ? { ...m, profession: 'edit' } : m)));
// Éditer un membre hors scope (m5) → rejeté.
await assert.rejects(
  () => assertCanWrite('members', ctxResp, allMembers.map((m: any) => (m.id === 'm5' ? { ...m, profession: 'edit' } : m))),
  (e: any) => e instanceof GuardError && e.status === 403,
  'édition hors scope département rejetée',
);
// S3 (modèle merge scope-aware) — un client scopé renvoie SON sous-ensemble ; les membres
// hors-scope absents sont PRÉSERVÉS (ni 403, ni tombstone) au lieu d'être supprimés. Avant,
// l'omission hors-scope provoquait un 403 sur tout le write, bloquant aussi les ajouts légitimes
// (ex. l'enregistrement Bloom Bus par un Capitaine).
const scopedSubset = [resp, allMembers[5]]; // m4 (self) + m6 (dans le scope de m4)
await assertCanWrite('members', ctxResp, scopedSubset); // ne lève plus
const preserve = await preservedIds('members', ctxResp);
assert.ok(preserve.has('mem_sa') && preserve.has('m5'), 'membres hors-scope marqués à préserver');
await applyWrite('members', scopedSubset, undefined, preserve);
const afterMerge = await readCollection('members', true);
assert.ok(afterMerge.find((m: any) => m.id === 'm5' && !m.deletedAt), 'm5 hors-scope préservé (pas tombstoné)');
assert.ok(afterMerge.find((m: any) => m.id === 'mem_sa' && !m.deletedAt), 'mem_sa hors-scope préservé');

// Délégation : simple membre avec délégation toId obtient la capacité.
await applyWrite('delegations', [{ id: 'del1', from: 'm4', to: 'M5', toId: 'm5', scope: 'd1', right: 'view_members' }]);
await assertCanWrite('members', (await buildContext('m5'))!, []); // capacité via délégation, aucun item touché
// #5 écriture fail-closed : m5 a la capacité view_members (déléguée, non scopée dans ce chemin)
// mais AUCUN rôle de périmètre → il ne peut éditer que sa propre fiche, pas celle d'autrui.
await assert.rejects(
  async () => assertCanWrite('members', (await buildContext('m5'))!, [{ id: 'm6', firstName: 'Hack' }]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'écriture scope-less sur autrui rejetée (#5)',
);
await assertCanWrite('members', (await buildContext('m5'))!, [{ ...simple, profession: 'edit-self' }]); // sa fiche → OK

// Interdiction de déléguer le rapport spirituel Bloom Bus.
const ctxRespB = (await buildContext('m4'))!;
await assert.rejects(
  () => assertCanWrite('delegations', ctxRespB, [{ id: 'del2', from: 'm4', to: 'X', toId: 'm6', scope: 'd1', right: 'rapport_bloom_bus_member' }]),
  (e: any) => e instanceof GuardError && e.status === 400,
  'délégation rapport_bloom_bus_member interdite',
);

// Scoping branche sur events pour non-privilégié.
await assert.rejects(
  () => assertCanWrite('events', ctxRespB, [{ id: 'ev1', title: 'X', type: 'special_inside', date: '2026-07-06', branch: 'light', closed: false }]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'event autre branche rejeté pour Responsable church',
);

// S4 — journal non falsifiable : un membre ne peut s'attribuer les actions d'autrui.
await assert.rejects(
  () => assertCanWrite('audits', ctxResp, [{ id: 'aud_x', operatorId: 'mem_sa', actionType: 'X' }]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'audit avec operatorId falsifié rejeté (S4)',
);
await assertCanWrite('audits', ctxResp, [{ id: 'aud_y', operatorId: 'm4', actionType: 'X' }]); // son propre id → OK

// --- M3 §2.6/§5 : gouvernance des couches de capacités dynamiques ---
const ctxMinistre = (await buildContext('m3'))!;
const ctxAdmin = (await buildContext('m7'))!;
const ctxPasteur = (await buildContext('m2'))!;
// capability_overrides = matrice dynamique → §11.2 : Admin / Pasteur Principal / Super Admin
const co = (id: string) => [{ id, subjectType: 'level', subjectValue: 'Leader', branchId: 'church', capability: 'x', enabled: true }];
await assertCanWrite('capability_overrides', ctxSA, co('co1'));      // Super Admin → OK
await assertCanWrite('capability_overrides', ctxAdmin, co('co1b'));  // Admin → OK (§11.2, plus large que la matrice statique)
// refusé au Pasteur SIMPLE (non listé), Ministre, Responsable, membre
for (const [ctx, who] of [[ctxPasteur, 'Pasteur simple'], [ctxResp, 'Responsable'], [ctxMinistre, 'Ministre'], [ctxSimple, 'membre']] as const) {
  await assert.rejects(
    () => assertCanWrite('capability_overrides', ctx, co('co2')),
    (e: any) => e instanceof GuardError && e.status === 403,
    `capability_overrides refusé au ${who}`,
  );
}
// special_authorizations : accordé par Ministre/Pasteur, PAS un Responsable/membre
const saItem = (over: any = {}) => ({ id: 'sa1', memberId: 'm6', capability: 'x', grantedById: 'm3', createdAt: '2026-01-01', ...over });
await assertCanWrite('special_authorizations', ctxMinistre, [saItem()]); // Ministre octroie à autrui → OK
await assert.rejects(() => assertCanWrite('special_authorizations', ctxResp, [saItem({ grantedById: 'm4' })]), (e: any) => e instanceof GuardError && e.status === 403, 'special_auth refusé au Responsable');
await assert.rejects(() => assertCanWrite('special_authorizations', ctxSimple, [saItem({ grantedById: 'm5' })]), (e: any) => e instanceof GuardError && e.status === 403, 'special_auth refusé au membre');
// anti-escalade : un Ministre ne s'auto-octroie pas
await assert.rejects(() => assertCanWrite('special_authorizations', ctxMinistre, [saItem({ memberId: 'm3' })]), (e: any) => e instanceof GuardError && e.status === 403, 'auto-octroi interdit (non Super Admin)');
// Super Admin exempté de l'anti-auto-octroi
await assertCanWrite('special_authorizations', ctxSA, [saItem({ id: 'sa_self', memberId: 'mem_sa', grantedById: 'mem_sa' })]);

// --- M3-report §240/§5 : visibilité des rapports de SUIVI de membre (confidentiels) ---
// Re-seed les membres du scénario (les tests de scope plus haut ont tombstoné m8 via un PUT scopé).
await applyWrite('members', [superAdmin, pasteur, ministre, resp, simple, baseMember({ id: 'm6', departments: { d1: 'membre' } }), baseMember({ id: 'm8', departments: { d1: 'Coach' } })]);
const suivi = { id: 'rep_suivi', reportType: 'rapport_suivi_coach', confidential: true, content: { memberId: 'm6' }, targetBranch: 'church', date: '2026-07-15', authorId: 'm8' };
const suiviM5 = { ...suivi, id: 'rep_suivi5', content: { memberId: 'm5' } }; // sujet hors périmètre de m4
const ctxCoach = (await buildContext('m8'))!;
const seesSuivi = async (ctx: any, items: any[]) => (await filterReadable('reports', ctx, items)).some((r: any) => r.id === 'rep_suivi');
// Coach dont le membre suivi relève du périmètre (partage un département) → voit
assert.ok(await seesSuivi(ctxCoach, [suivi]), 'Coach voit le suivi de son membre (§240)');
// Responsable non-Coach sans autorisation → ne voit pas
assert.ok(!(await seesSuivi(ctxResp, [suivi])), 'Responsable non-Coach ne voit pas le suivi sans autorisation');
// corps pastoral → voit (règle de confidentialité existante préservée)
assert.ok(await seesSuivi(ctxMinistre, [suivi]), 'corps pastoral voit les rapports confidentiels');
// exception nominative : SpecialAuthorization à m4 → ouvre le suivi de son périmètre
await applyWrite('special_authorizations', [{ id: 'sa_suivi', memberId: 'm4', capability: 'consulter_rapports_suivi_membre', branchId: 'church', grantedById: 'm3', createdAt: '2026-01-01' }]);
assert.ok(await seesSuivi(ctxResp, [suivi]), 'SpecialAuthorization ouvre le suivi au non-Coach (§5)');
// bornée au périmètre : un suivi d'un membre HORS scope reste invisible
assert.ok(!(await filterReadable('reports', ctxResp, [suiviM5])).some((r: any) => r.id === 'rep_suivi5'), 'autorisation bornée au périmètre (sujet hors scope invisible)');
// une autorisation portant sur une AUTRE capacité ne donne pas accès (remplace la précédente)
await applyWrite('special_authorizations', [{ id: 'sa_other', memberId: 'm4', capability: 'autre_chose', branchId: 'church', grantedById: 'm3', createdAt: '2026-01-01' }]);
assert.ok(!(await seesSuivi(ctxResp, [suivi])), 'autorisation d\'une autre capacité ne donne pas accès');

// S4 — émission de notification vers autrui réservée à l'encadrement.
await assert.rejects(
  () => assertCanWrite('notifications', ctxSimple, [{ id: 'n1', targetMemberId: 'm3', title: 'x' }]),
  (e: any) => e instanceof GuardError && e.status === 403,
  'notification vers autrui rejetée pour simple membre (S4)',
);
await assertCanWrite('notifications', ctxSimple, [{ id: 'n2', targetMemberId: 'm5', title: 'x' }]); // la sienne → OK
await assertCanWrite('notifications', ctxResp, [{ id: 'n3', targetMemberId: 'm3', title: 'x' }]); // encadrement → OK

// S2 — lecture filtrée par rôle réel (le confidentiel et la PII ne sont plus envoyés).
const reportSet = [
  { id: 'r_pub', targetBranch: 'church', confidential: false },
  { id: 'r_conf', targetBranch: 'church', confidential: true },
];
assert.ok(
  !(await filterReadable('reports', ctxSimple, reportSet)).some((r: any) => r.confidential),
  'rapport confidentiel masqué au simple membre (S2)',
);
assert.ok(
  (await filterReadable('reports', (await buildContext('m3'))!, reportSet)).some((r: any) => r.confidential),
  'corps pastoral (Ministre) voit le confidentiel (S2)',
);
assert.deepEqual(
  (await filterReadable('members', ctxSimple, allMembers)).map((m: any) => m.id),
  ['m5'],
  'simple membre ne lit que sa propre fiche (S2)',
);
assert.equal(
  (await filterReadable('members', (await buildContext('m2'))!, allMembers)).length,
  allMembers.length,
  'Pasteur (périmètre global) lit tous les membres (S2)',
);
assert.deepEqual(
  await filterReadable('admins', ctxSimple, admins as any),
  [],
  'liste admins invisible au simple membre (S2)',
);

// Lot 4 — cloisonnement lecture des events par branche : un simple membre (church) ne
// reçoit pas les événements light ; global/both passent ; le Pasteur reçoit tout.
{
  const evSet = [
    { id: 'e_c', title: 'C', type: 'Culte', date: '2026-07-19', branch: 'church', closed: false },
    { id: 'e_l', title: 'L', type: 'Culte', date: '2026-07-19', branch: 'light', closed: false },
    { id: 'e_g', title: 'G', type: '80/20', date: '2026-07-17', branch: 'global', scope: 'both', closed: false },
  ];
  assert.deepEqual(
    (await filterReadable('events', ctxSimple, evSet)).map((e: any) => e.id),
    ['e_c', 'e_g'],
    'membre mono-branche (church) ne lit pas les events light (lot 4)',
  );
  assert.equal(
    (await filterReadable('events', (await buildContext('m2'))!, evSet)).length,
    3,
    'Pasteur (multi-branche) lit les events des 2 branches (lot 4)',
  );
}

// Scale — les rapports de plus de 24 mois ne sont plus servis (archives), les récents
// et ceux sans date lisible passent.
{
  const old = { id: 'r_old', reportType: 'rapport_service', targetBranch: 'church', date: '2020-01-05', confidential: false, content: {} };
  const recent = { id: 'r_new', reportType: 'rapport_service', targetBranch: 'church', date: '2026-06-29', confidential: false, content: {} };
  const ids = (await filterReadable('reports', (await buildContext('m2'))!, [old, recent])).map((r: any) => r.id);
  assert.deepEqual(ids, ['r_new'], 'rapport de plus de 24 mois archivé (non servi)');
}

// Audit sécurité — #2 journal d'audit réservé à l'encadrement supérieur ;
// #3 notifications personnelles filtrées par destinataire.
{
  const audits = [{ id: 'a1', operatorId: 'mem_sa', actionType: 'PASSWORD_RESET_ISSUED' }];
  assert.deepEqual(await filterReadable('audits', ctxSimple, audits), [], "journal d'audit invisible au simple membre (#2)");
  assert.equal((await filterReadable('audits', ctxResp, audits)).length, 0, "journal d'audit invisible au Responsable (hors encadrement supérieur) (#2)");
  assert.equal((await filterReadable('audits', ctxSA, audits)).length, 1, 'Super Admin lit le journal d\'audit (#2)');

  const notifs = [
    { id: 'n_broadcast', title: 'B' },                    // sans cible → tout le monde
    { id: 'n_mine', targetMemberId: 'm5', title: 'M' },   // destinée à m5 (ctxSimple)
    { id: 'n_other', targetMemberId: 'm3', title: 'O' },  // destinée à un autre
  ];
  assert.deepEqual(
    (await filterReadable('notifications', ctxSimple, notifs)).map((n: any) => n.id),
    ['n_broadcast', 'n_mine'],
    'simple membre : notif personnelle d\'un autre masquée (#3)',
  );
  assert.equal(
    (await filterReadable('notifications', ctxResp, notifs)).length,
    3,
    'encadrement voit toutes les notifications pour supervision (#3)',
  );
}

// --- §13.2 — confidentialité des champs de santé : masquage lecture + repinçage écriture
//     + application SERVEUR de la matrice dynamique (révocation par override) ---
{
  await applyWrite('members', [superAdmin, pasteur, ministre, resp, simple,
    baseMember({ id: 'm6', departments: { d1: 'membre' }, healthKPIs: { spirituel: 3, social: 3, financier: 7, physique: 3, presenceCulte: 4, presenceService: 4 } }),
    baseMember({ id: 'm8', departments: { d1: 'Coach' } })]);
  // Responsable a la cap finances, Coach non ; présence accordée aux deux.
  setKv('permissions', {
    view_members: { Responsable: true, Coach: true },
    consulter_situation_financiere: { Responsable: true },
    consulter_historique_presence: { Responsable: true, Coach: true },
    inscrire_formations_certifications: { Responsable: true },
  });
  const readM6 = async (mid: string) =>
    (await filterReadable('members', (await buildContext(mid))!, await readCollection('members'))).find((m: any) => m.id === 'm6');
  assert.equal((await readM6('m4')).healthKPIs.financier, 7, 'Responsable avec cap : financier visible');
  const coachM6 = await readM6('m8');
  assert.equal(coachM6.healthKPIs.financier, undefined, 'Coach sans cap : financier MASQUÉ (§13.2)');
  assert.equal(coachM6.healthKPIs.presenceCulte, 4, 'Coach avec cap présence : présence visible');

  // Repinçage écriture : le Coach met financier=99 sur m6 → restauré à la valeur stockée (7).
  const tampered = { ...(await readCollection('members')).find((m: any) => m.id === 'm6'), healthKPIs: { spirituel: 3, social: 3, financier: 99, physique: 3, presenceCulte: 4, presenceService: 4 } };
  await assertCanWrite('members', (await buildContext('m8'))!, [baseMember({ id: 'm8', departments: { d1: 'Coach' } }), tampered]);
  assert.equal(tampered.healthKPIs.financier, 7, 'financier repincé à la valeur stockée (Coach sans cap) — ni effacement ni falsification');

  // Matrice dynamique enforced serveur : un override qui RÉVOQUE la cap certifs bloque l'écriture.
  await assertCanWrite('certifications', (await buildContext('m4'))!, [{ id: 'cert_ok', memberId: 'm6' }]); // cap présente → OK
  await applyWrite('capability_overrides', [{ id: 'ovr_cert', subjectType: 'function', subjectValue: 'responsable', branchId: 'church', capability: 'inscrire_formations_certifications', enabled: false }]);
  const ctxM4 = (await buildContext('m4'))!;
  await assert.rejects(
    () => assertCanWrite('certifications', ctxM4, [{ id: 'cert_ko', memberId: 'm6' }]),
    (e: any) => e instanceof GuardError && e.status === 403,
    'override de révocation appliqué côté serveur (avant : ignoré, cap UI-only)',
  );
}

// --- §8.1 — cascade de visibilité LECTURE des rapports par FILIÈRE (bus vs département) ---
{
  await applyWrite('departments', [
    { id: 'd1', name: 'D1', ministryId: 'min1', type: 'normal' },
    { id: 'd2', name: 'D2', ministryId: 'min1', type: 'normal' },
    { id: 'dept_bloom_bus', name: 'Bloom Bus', ministryId: 'min1', type: 'normal', specialFunction: 'bloom_bus' },
  ]);
  await applyWrite('bus_lines', [{ id: 'bus1', name: 'B1', commune: 'Cocody', zone: 'Est' }] as any);
  await applyWrite('members', [
    superAdmin, pasteur, ministre,
    baseMember({ id: 'm4', departments: { d1: 'responsable' } }),
    baseMember({ id: 'mBus', departments: { d1: 'membre' }, bloomBusId: 'bus1' }),
    baseMember({ id: 'mCap', departments: { dept_bloom_bus: 'capitaine' }, bloomBusId: 'bus1' }),
    baseMember({ id: 'mOut', departments: { d2: 'responsable' } }),
  ]);

  const deptReport = { id: 'r_dept', reportType: 'rapport_service', departmentId: 'd1', confidential: false, targetBranch: 'church', date: '2026-07-15', authorId: 'mem_sa', content: {} };
  // Rapport Bloom Bus rempli par le membre lui-même (authorId=mBus) → teste la visibilité par
  // filière, pas le raccourci "auteur voit le sien".
  const busReport = { id: 'r_bus', reportType: 'rapport_bloom_bus_member', departmentId: 'dept_bloom_bus', confidential: false, targetBranch: 'church', date: '2026-07-15', authorId: 'mBus', content: { memberId: 'mBus' } };
  const sees = async (mid: string, r: any) => (await filterReadable('reports', (await buildContext(mid))!, [r])).some((x: any) => x.id === r.id);

  // Rapport de département → hiérarchie du département.
  assert.ok(await sees('m4', deptReport), 'Responsable du dépt voit le rapport de son département');
  assert.ok(!(await sees('mOut', deptReport)), 'Responsable d’un AUTRE dépt ne voit pas le rapport (cascade dépt)');
  assert.ok(await sees('m3', deptReport), 'Ministre (corps pastoral) voit le rapport de département');

  // Rapport Bloom Bus → hiérarchie Bloom Bus, PAS la hiérarchie département du membre.
  assert.ok(!(await sees('m4', busReport)), 'Responsable de dépt ne voit PAS le rapport Bloom Bus de son membre (cloisonnement filière)');
  assert.ok(await sees('mCap', busReport), 'Capitaine du bus du membre voit son rapport Bloom Bus');
}

console.log('rbac.check OK');
