// Data-scope restriction for MembersView (P4.3) — narrows which members a role
// can see, below the page-level `view_members` gate (that gate only decides who
// can open the tab at all).
import { Member, BloomBusEntity, Department, Ministry } from '../types';

const FULL_SCOPE_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'];
// ponytail: proxy via shared department, not a real mentor/filleul link — upgrade
// to a dedicated relation once that model exists.
const DEPARTMENT_PROXY_ROLES = ['Responsable', 'Adjoint', 'Coach', 'Leader'];

export function inMemberScope(
  operator: Member,
  target: Member,
  role: string,
  busLines: BloomBusEntity[],
  departments: Department[],
  ministries: Ministry[] = [],
): boolean {
  if (target.id === operator.id) return true;
  if (FULL_SCOPE_ROLES.includes(role)) return true;

  if (role === 'Ministre') {
    const ownMinistryIds = ministries.filter(m => m.tuteurId === operator.id).map(m => m.id);
    const targetDeptIds = Object.keys(target.departments);
    return departments.some(d => targetDeptIds.includes(d.id) && ownMinistryIds.includes(d.ministryId));
  }

  if (role === 'Capitaine') {
    return !!operator.bloomBusId && operator.bloomBusId === target.bloomBusId;
  }

  if (role === 'Responsable de Zone') {
    const operatorZone = busLines.find(b => b.id === operator.bloomBusId)?.zone;
    const targetZone = busLines.find(b => b.id === target.bloomBusId)?.zone;
    return !!operatorZone && operatorZone === targetZone;
  }

  if (role === 'Responsable de Commune') {
    const operatorCommune = busLines.find(b => b.id === operator.bloomBusId)?.commune ?? operator.gps?.commune;
    const targetCommune = busLines.find(b => b.id === target.bloomBusId)?.commune ?? target.gps?.commune;
    return !!operatorCommune && operatorCommune === targetCommune;
  }

  if (DEPARTMENT_PROXY_ROLES.includes(role)) {
    const operatorDeptIds = Object.keys(operator.departments);
    const targetDeptIds = Object.keys(target.departments);
    return operatorDeptIds.some(id => targetDeptIds.includes(id));
  }

  // ponytail: fail-open for roles not covered above — the page-level
  // `view_members` gate already restricts who reaches this far.
  return true;
}
