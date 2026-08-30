import assert from 'node:assert';
import { departmentToolRoles, memberCanReadProject } from './access.ts';
import type { Department, Member, Ministry, Project } from './types.ts';

const member = { id: 'm1', branch: 'church', departments: { gdc: 'responsable', adn: 'responsable', eden: 'membre' } } as unknown as Member;
const departments = [
  { id: 'gdc', ministryId: 'min1', specialFunction: 'gestion_cultes' },
  { id: 'adn', ministryId: 'min1', specialFunction: 'adn' },
  { id: 'eden', ministryId: 'min1', specialFunction: 'parcours_etapes' },
  { id: 'bapteme', ministryId: 'min1', specialFunction: 'bapteme' },
] as Department[];
assert.deepEqual([...departmentToolRoles(member, departments)].sort(), ['ADN', 'GDC'], 'cumule les outils des départements réels sans assimiler Eden au Baptême');

const minister = { id: 'minister', branch: 'church', departments: {} } as unknown as Member;
const ministries = [{ id: 'min1', tuteurId: 'minister' }] as Ministry[];
const ministerDepartments = [
  { id: 'b1', ministryId: 'min1', branch: 'church', specialFunction: 'bapteme' },
  { id: 'g2', ministryId: 'min1', branch: 'light', specialFunction: 'gestion_cultes' },
] as Department[];
assert.deepEqual([...departmentToolRoles(minister, ministerDepartments, ministries)], ['Baptême'], 'le Ministre ne reçoit que les outils de son ministère dans sa branche');

const project = { id: 'p', pmoId: 'm1', team: [{ member: 'Homonyme', memberId: 'm2', role: 'Membre' }] } as Project;
assert.equal(memberCanReadProject('m1', project), true);
assert.equal(memberCanReadProject('m2', project), true);
assert.equal(memberCanReadProject('m3', project), false, 'un nom identique sans id ne donne aucun accès');

console.log('access.check OK');
