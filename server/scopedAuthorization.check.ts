import assert from 'node:assert/strict';
import type { Member, Department, Ministry, BloomBusEntity, Report } from '../packages/domain/types.ts';
process.env.BLOOMCORE_DB = ':memory:';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
const { setCollection, setKv } = await import('./datastore.ts');
const { buildContext, assertCanWrite, filterReadable } = await import('./rbac.ts');
const { deltaToWhole, GuardError } = await import('./guards.ts');
const { busInScope, canAssignBusRole, directReportsOf } = await import('../packages/domain/scope.ts');
const { canReadScopedReport } = await import('../packages/domain/reportScope.ts');
const { accessibleBranches } = await import('../packages/domain/authorization.ts');
const member = (id: string, over: Partial<Member> = {}): Member => ({ id, firstName: 'Fixture', lastName: id,
  phone: '0000000000', email: 'fixture@example.invalid', branch: 'church', level: 'stagiaire', pastoralCursus: 'aucun', departments: {},
  gender: 'H', birthDate: '', maritalStatus: 'Célibataire', profession: '', entryDate: '2026-01-01', baptismStatus: 'non_baptise',
  healthKPIs: { spirituel: 3, social: 3, physique: 3, financier: 3, presenceCulte: 3, presenceService: 3 }, ...over });
const departments: Department[] = ['a', 'b', 'c'].map(id => ({ id, name: id, type: 'normal', ministryId: id === 'c' ? 'external' : 'intimite', description: '' }));
const ministries: Ministry[] = [{ id: 'intimite', name: 'Intimité', description: '', tuteurId: 'minister' }];
const op = member('op', { level: 'coach', departments: { a: 'responsable', b: 'adjoint' } });
const a = member('ma', { departments: { a: 'membre' } }), b = member('mb', { departments: { b: 'membre' } });
const cross = member('cross', { level: 'coach', departments: { a: 'responsable' }, deptBranches: { a: 'light' } });
const light = member('light', { branch: 'light', departments: { a: 'membre' } });
const pole = member('pole', { departments: { a: 'responsable_section' }, deptSections: { a: 's1' } });
const pastor = member('pastor', { pastoralCursus: 'pasteur_titulaire' });
const all = [op, a, b, cross, light, pole, pastor, member('shared', { departments: { a: 'membre', b: 'membre', c: 'membre' } }), member('minister'), member('admin')];
await setCollection('members', all); await setCollection('departments', departments); await setCollection('ministries', ministries);
await setCollection('admins', [{ id: 'adm_admin', role: 'Super Admin' }]);
await setKv('permissions', { view_members: { Responsable: true, Adjoint: true, Coach: true, 'Responsable de section': true, Pasteur: true },
  consulter_situation_financiere: { Responsable: true } });
const ctx = (await buildContext('op'))!;
const denied = (action: () => Promise<unknown>, label: string) => assert.rejects(action, (e: unknown) => e instanceof GuardError && e.status === 403, label);
const change = async (actor: string, target: Member, patch: Partial<Member>, pastoralNomination = false) => {
  const body = await deltaToWhole('members', [{ ...target, ...patch }], []);
  await assertCanWrite('members', (await buildContext(actor))!, body, { pastoralNomination });
};
assert.deepEqual((await filterReadable('members', ctx, [a, b, member('outside')])).map(m => m.id), ['ma', 'mb']);
await change('op', a, { departments: { a: 'adjoint' } });
await denied(() => change('op', b, { departments: { b: 'adjoint' } }), 'responsable A ne nomme pas adjoint B');
await denied(() => change('op', a, { departments: { a: 'membre', c: 'adjoint' } }), 'pas de fonction étrangère');
await denied(() => change('op', a, { pastoralCursus: 'pasteur_titulaire' }), 'promotion par PATCH générique refusée');
await denied(() => change('admin', a, { pastoralCursus: 'serviteur' }), 'même admin passe par le cursus');
await change('admin', a, { pastoralCursus: 'serviteur' }, true);
await denied(() => change('op', a, { pastoralCursus: 'serviteur' }, true), 'autorité pastorale requise');
await denied(() => change('op', op, { deptBranches: { a: 'light' } }), 'auto-branche refusée');
await denied(() => change('pole', pole, { deptSections: { a: 's2' } }), 'auto-pôle refusé');
await change('op', a, { level: 'coach' });
await denied(() => change('op', a, { departments: { a: 'responsable' } }), 'pas de nomination de rang égal/supérieur');
assert.deepEqual(accessibleBranches(cross, ['Responsable', 'Coach']), ['church', 'light']);
const report = (id: string, departmentId: string, targetBranch: 'church' | 'light' = 'church'): Report => ({
  id, departmentId, targetBranch, date: new Date().toISOString(), authorId: 'other', authorName: 'Fixture', authorRole: 'Responsable',
  confidential: true, reportType: 'rapport_suivi_coach', content: { memberId: targetBranch === 'light' ? light.id : 'shared', notes: 'Fixture' } });
const reports = [report('ra', 'a'), report('rb', 'b'), report('rc', 'c')];
assert.deepEqual((await filterReadable('reports', ctx, reports)).map(r => r.id), ['ra', 'rb']);
const single = { member: { ...op, departments: { a: 'responsable' as const, b: 'membre' as const } }, roles: ['Responsable', 'Coach', 'Membre'] };
assert.deepEqual((await filterReadable('reports', single, reports)).map(r => r.id), ['ra']);
assert.deepEqual((await filterReadable('reports', (await buildContext('minister'))!, reports)).map(r => r.id), ['ra', 'rb']);
assert.equal((await filterReadable('reports', (await buildContext('pastor'))!, [...reports, report('rl', 'a', 'light')])).length, 3);
assert.equal((await filterReadable('reports', (await buildContext('admin'))!, [...reports, report('rl', 'a', 'light')])).length, 4);
assert.equal((await filterReadable('reports', (await buildContext('cross'))!, [report('rl', 'a', 'light')])).length, 1);
const mentorReport = { ...report('mentor', 'a'), departmentId: undefined };
assert.equal((await filterReadable('reports', ctx, [mentorReport])).length, 0, 'Coach ne lit pas un suivi hors mentorat via son rôle Responsable');
assert.equal((await filterReadable('members', ctx, [b]))[0].healthKPIs.financier, undefined, 'capacité Responsable ne fuit pas sur B adjoint');
const buses: BloomBusEntity[] = [{ id: 'ba', name: 'A', commune: 'Cocody', zone: 'Centre', branch: 'church', centerLat: 5, centerLng: -4 },
  { id: 'bb', name: 'B', commune: 'Yopougon', zone: 'Centre', branch: 'church', centerLat: 5, centerLng: -4 },
  { id: 'bl', name: 'L', commune: 'Cocody', zone: 'Centre', branch: 'light', centerLat: 5, centerLng: -4 }];
const zone = member('zone', { busRole: 'responsable_zone', bloomBusId: 'ba' });
assert.equal(busInScope(zone, buses[1], 'Responsable de Zone', buses, departments), false, 'zone homonyme autre commune');
assert.equal(canAssignBusRole(pastor, ['Pasteur'], member('lc', { branch: 'light', bloomBusId: 'bl' }), 'Capitaine de Bus', buses, departments), false);
const captain = member('cap', { bloomBusId: 'ba', busRoles: ['capitaine', 'responsable_commune'] });
const busDepartment: Department = { id: 'bus_dept', name: 'Bloom Bus', type: 'special', specialFunction: 'bloom_bus', ministryId: 'retention', description: '' };
const crossBusLead = member('cross_bus', { bloomBusId: 'ba', busRoles: ['capitaine'], departments: { bus_dept: 'responsable' }, deptBranches: { bus_dept: 'light' } });
const plainCrossBusLead = { ...crossBusLead, busRoles: [], busRole: undefined };
const churchBusReport = { ...report('church_bus_report', 'bus_dept'), reportType: 'rapport_bloom_bus_member' as const, content: { memberId: 'church_subject', busId: 'ba' } };
assert.equal(canReadScopedReport(plainCrossBusLead, ['Responsable'], churchBusReport,
  [member('church_subject', { bloomBusId: 'ba' })], [busDepartment], [], buses), false, 'simple passager Church ne lit pas autrui via son rang Light');
assert.equal(canReadScopedReport(crossBusLead, ['Responsable', 'Capitaine de Bus'], churchBusReport,
  [member('church_subject', { bloomBusId: 'ba' })], [busDepartment], [], buses), true, 'capitaine Church lit les suivis de son bus');
assert.equal(canAssignBusRole(crossBusLead, ['Responsable', 'Capitaine de Bus'], member('church_cap', { bloomBusId: 'ba' }), 'Capitaine de Bus', buses, [busDepartment]), false, 'rang Light ne se combine pas au territoire capitaine Church');
assert.equal(canAssignBusRole(crossBusLead, ['Responsable', 'Capitaine de Bus'], member('church_member', { bloomBusId: 'ba' }), 'Membre', buses, [busDepartment]), true, 'capitaine Church conserve son droit local');
assert.equal(canAssignBusRole(crossBusLead, ['Responsable', 'Capitaine de Bus'], member('light_lead', { bloomBusId: 'bl', branch: 'light' }), 'Responsable de Commune', buses, [busDepartment]), true, 'responsable Light conserve son droit dans Light');
assert.deepEqual(directReportsOf(zone, 'Responsable de Zone', [captain], buses, departments).map(m => m.id), ['cap'], 'capitaine cumulant une autre fonction reste affiché');
console.log('scopedAuthorization.check OK');
