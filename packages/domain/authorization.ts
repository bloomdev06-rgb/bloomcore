import type { Branch, Department, Member, Ministry, PastoralCursus } from './types.ts';
import { CROSS_BRANCH_ROLES, effectiveBranchFor, rankOf } from './scope.ts';

/** An authority belongs to an assignment, never to the member's highest title. */
export function departmentAuthority(operator: Member, roles: Iterable<string>, departmentId: string,
  branch: Branch, departments: Department[], ministries: Ministry[]): string | undefined {
  const held = [...roles];
  const global = CROSS_BRANCH_ROLES.find(role => held.includes(role));
  if (global) return global;
  if (branch === 'global') return undefined;
  if (held.includes('Pasteur') && operator.branch === branch) return 'Pasteur';
  const department = departments.find(d => d.id === departmentId);
  if (!department || (department.branch && department.branch !== branch)) return undefined;
  if (operator.branch === branch && ministries.some(m => m.id === department.ministryId && m.tuteurId === operator.id)) return 'Ministre';
  if (effectiveBranchFor(operator, departmentId) !== branch) return undefined;
  const fn = operator.departments?.[departmentId];
  return fn === 'responsable' ? 'Responsable' : fn === 'adjoint' ? 'Adjoint'
    : fn === 'responsable_section' ? 'Responsable de section' : undefined;
}

export function accessibleBranches(operator: Member, roles: Iterable<string>): Branch[] {
  if ([...roles].some(r => CROSS_BRANCH_ROLES.includes(r))) return ['church', 'light', 'global'];
  return [...new Set([operator.branch, ...Object.keys(operator.departments ?? {})
    .map(id => effectiveBranchFor(operator, id))])].filter(b => b !== 'global');
}

export function memberInBranch(member: Member, branch: Branch): boolean {
  return branch === 'global' || member.branch === branch
    || Object.keys(member.departments ?? {}).some(id => effectiveBranchFor(member, id) === branch);
}

export const PASTORAL_ORDER: PastoralCursus[] = ['aucun', 'appele', 'serviteur', 'gagneur_ame',
  'assistant_pasteur', 'pasteur_assistant', 'pasteur_titulaire'];

// Keep nominations above the pastoral line; ordinary department responsibility is
// not a pastoral appointment power. Used by the dedicated endpoint and its UI.
export function canNominatePastoral(operator: Member, roles: Iterable<string>, target: Member): boolean {
  return operator.id !== target.id && [...roles].some(r => CROSS_BRANCH_ROLES.includes(r));
}

export function canAssignDepartmentFunction(authority: string | undefined, role: string): boolean {
  return !!authority && authority !== 'Responsable de section' && rankOf(authority) < rankOf(role);
}
