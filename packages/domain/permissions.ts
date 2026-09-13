import { PermissionMatrix, Delegation, Member, CapabilityOverride, SpecialAuthorization } from './types.ts';
import type { Department, Ministry, BloomBusEntity } from './types.ts';
import { effectiveBranchFor, inMemberScopeForRoles, CROSS_BRANCH_ROLES } from './scope.ts';
import { departmentAuthority } from './authorization.ts';

export function resolveTargetCapability(matrix: PermissionMatrix, capability: string, operator: Member,
  roles: Iterable<string>, target: Member, departments: Department[], ministries: Ministry[], buses: BloomBusEntity[],
  delegations: Delegation[] = [], overrides: CapabilityOverride[] = [], specialAuths: SpecialAuthorization[] = []): boolean {
  const held = [...roles];
  if (held.some(r => CROSS_BRANCH_ROLES.includes(r)) || (held.includes('Pasteur') && operator.branch === target.branch)) return true;
  for (const id of Object.keys(target.departments ?? {})) {
    const branch = effectiveBranchFor(target, id);
    const authority = departmentAuthority(operator, held, id, branch, departments, ministries);
    const delegated = delegations.some(d => !d.deletedAt && d.toId === operator.id && d.departmentId === id && d.right === capability)
      && effectiveBranchFor(operator, id) === branch;
    if (authority || delegated) {
      const localOperator = { ...operator, branch, departments: { [id]: operator.departments?.[id] } } as Member;
      if (resolveCapability(matrix, capability, localOperator, authority ?? 'Membre', delegations, overrides, specialAuths, id)) return true;
    }
  }
  // Non-department pathways keep their own scope (mentor, own profile, territory).
  return held.filter(r => !['Responsable', 'Adjoint', 'Ministre', 'Responsable de section'].includes(r))
    .some(role => inMemberScopeForRoles(operator, target, [role], buses, departments, ministries)
      && resolveCapability(matrix, capability, operator, role, [], overrides.filter(o => o.subjectType !== 'function'), specialAuths));
}

// Garde-fou : le Super Admin voit toujours tout (impossible de s'auto-verrouiller).
// Source unique — Sidebar.tsx (filtrage du nav) et App.tsx (re-validation au changement
// de rôle) doivent utiliser la même règle pour ne jamais diverger.
export function canView(permissionMatrix: PermissionMatrix, tabId: string, role: string): boolean {
  return role === 'Super Admin' || !!permissionMatrix[`view_${tabId}`]?.[role];
}

export function canViewAnyRole(permissionMatrix: PermissionMatrix, tabId: string, roles: Iterable<string>): boolean {
  return [...roles].some(role => canView(permissionMatrix, tabId, role));
}

// §11.3 — une capacité déléguable (DELEGABLE_CAPS) est accordée si le rôle l'a nativement
// dans la matrice, OU si une délégation active cible cet opérateur précis (toId). Sans ce
// second membre, la console de délégation reste un formulaire sans effet (cf. audit B5).
export function hasCapability(
  permissionMatrix: PermissionMatrix,
  capability: string,
  role: string,
  operatorId: string | undefined,
  delegations: Delegation[],
  resourceDepartmentId?: string,
): boolean {
  if (role === 'Super Admin' || !!permissionMatrix[capability]?.[role]) return true;
  return !!operatorId && !!resourceDepartmentId && delegations.some(d =>
    !d.deletedAt && d.right === capability && d.toId === operatorId
    && !!d.fromId && d.departmentId === resourceDepartmentId);
}

// Un membre "matche" un override selon l'axe ciblé et la branche (§2.6).
function memberMatchesOverride(member: Member, o: CapabilityOverride): boolean {
  if (o.branchId !== member.branch) return false;
  switch (o.subjectType) {
    case 'level': return member.level === o.subjectValue;
    case 'cursus': return member.pastoralCursus === o.subjectValue;
    case 'function': return Object.values(member.departments ?? {}).some((fn) => String(fn) === o.subjectValue);
    default: return false;
  }
}

// §5 — capabilities(member) = base ⊕ overrides ⊕ specialAuth.
//   base       = matrice de rôle + délégation active (hasCapability, inchangé).
//   overrides  = ajustement par CLASSE (niveau/fonction/cursus) scopé branche : accorde/révoque.
//   specialAuth= exception NOMINATIVE : ré-accorde, ne retire jamais.
// Sans override ni specialAuth (collections vides), le résultat est IDENTIQUE à hasCapability —
// donc brancher resolveCapability là où on appelait hasCapability ne change rien tant qu'aucune
// règle dynamique n'existe.
export function resolveCapability(
  permissionMatrix: PermissionMatrix,
  capability: string,
  operator: Member | undefined,
  role: string,
  delegations: Delegation[],
  overrides: CapabilityOverride[] = [],
  specialAuths: SpecialAuthorization[] = [],
  resourceDepartmentId?: string,
): boolean {
  const base = hasCapability(permissionMatrix, capability, role, operator?.id, delegations, resourceDepartmentId);
  if (!operator) return base;
  const matching = overrides.filter(
    (o) => !o.deletedAt && o.capability === capability && memberMatchesOverride(operator, o),
  );
  // ponytail: deny-wins — si UN override applicable révoque, il l'emporte (conservateur) ; sinon
  // un override qui accorde ; sinon on garde la base. Resserrer si le métier impose un ordre de
  // priorité entre axes (niveau > fonction > cursus, p.ex.).
  const afterOverride = matching.length ? matching.every((o) => o.enabled) : base;
  // Exception nominative : ré-accorde même si la classe révoque (jamais l'inverse).
  const special = specialAuths.some(
    (s) => !s.deletedAt && s.memberId === operator.id && s.capability === capability
      && (s.branchId == null || s.branchId === operator.branch),
  );
  return afterOverride || special;
}
