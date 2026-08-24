// Data-scope restriction for MembersView (P4.3) — narrows which members a role
// can see, below the page-level `view_members` gate (that gate only decides who
// can open the tab at all).
import { Member, BloomBusEntity, Department, Ministry, Report } from './types.ts';
import { roleForDeptFn } from '../shared/migrate.ts';

export interface DashboardScope {
  members: Member[];
  reports: Report[];
  deptIds: string[] | null; // null = global (aucune restriction)
  label: string;            // 'Global' | 'Ministère …' | 'Département …'
}

// Portée de l'accueil / des tendances selon le rôle (§13.3, PROFILS-INTERFACES) :
// staff pastoral (FULL_SCOPE) → global ; Ministre → ses ministères (tuteurId) ; Responsable/
// Coach/Leader → leur département. Les séries de tendances sont clés par content.memberId
// (departmentId rarement renseigné sur les rapports Bloom Bus) → on scope les rapports par
// MEMBRE en portée (union avec les rapports tagués d'un département en portée). Extrait de
// DashboardView : portée commune aux KPI et à la section Tendances de l'accueil.
export function dashboardScope(
  operator: Member | undefined,
  role: string,
  members: Member[],
  reports: Report[],
  departments: Department[],
  ministries: Ministry[],
): DashboardScope {
  const ownMinistry = role === 'Ministre' ? ministries.find(m => m.tuteurId === operator?.id) : undefined;
  const homeDeptId = ROLE_HOME_DEPT[role]
    || Object.entries(operator?.departments ?? {}).find(([, fn]) => fn === 'responsable')?.[0]
    || Object.keys(operator?.departments ?? {})[0];
  const deptIds: string[] | null =
    role === 'Ministre' ? (ownMinistry ? departments.filter(d => d.ministryId === ownMinistry.id).map(d => d.id) : [])
    : ['Responsable', 'Coach', 'Leader'].includes(role) ? (homeDeptId ? [homeDeptId] : [])
    : null; // Pasteur/Pasteur Principal/Admin/Super Admin → toute l'église.

  if (deptIds === null) return { members, reports, deptIds: null, label: 'Global' };

  const deptSet = new Set(deptIds);
  const scopedMembers = members.filter(m => Object.keys(m.departments).some(id => deptSet.has(id)));
  const memberIdSet = new Set(scopedMembers.map(m => m.id));
  const scopedReports = reports.filter(r =>
    (r.departmentId && deptSet.has(r.departmentId)) ||
    (r.content?.memberId && memberIdSet.has(r.content.memberId)));
  const label = ownMinistry ? ownMinistry.name // les noms de ministère contiennent déjà « Ministère … »
    : deptIds.length ? `Département ${departments.find(d => d.id === deptIds[0])?.name ?? ''}`
    : 'Ma portée';
  return { members: scopedMembers, reports: scopedReports, deptIds, label };
}

export const FULL_SCOPE_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'];
// PROFILS-INTERFACES : seuls la ligne pastorale/staff et le Coach (bi-branche) ont le
// commutateur de branche ; tous les autres profils sont verrouillés sur Member.branch.
export const MULTI_BRANCH_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre', 'Coach'];
// La vue « Global » (consolidation des 2 branches) est réservée au staff.
export const GLOBAL_VIEW_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre'];
// ponytail: proxy via shared department, not a real mentor/filleul link — upgrade
// to a dedicated relation once that model exists.
const DEPARTMENT_PROXY_ROLES = ['Responsable', 'Adjoint', 'Coach', 'Leader'];

// Point 1 — seuls ces rôles peuvent tenir un département secondaire dans l'AUTRE branche
// (Member.deptBranches) ; Leader et Membre restent cantonnés à leur branche d'attache.
// Appliqué aussi côté serveur (server/rbac.ts) — rien ne doit dépendre uniquement de l'UI.
export const COACH_AND_ABOVE = ['Coach', 'Adjoint', 'Responsable', 'Ministre', 'Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin'];

// Branche effective d'un membre POUR un département donné : son override (deptBranches)
// si posé, sinon sa branche d'attache. Utilisé partout où « même branche » doit être
// évalué au niveau du rattachement départemental plutôt qu'au niveau du membre entier.
export function effectiveBranchFor(m: Member, deptId: string): Member['branch'] {
  return m.deptBranches?.[deptId] ?? m.branch;
}

// Rôles qui gèrent leurs membres uniquement depuis l'onglet Membres de leur page
// Département, pas depuis l'onglet Membres global de la barre latérale.
export const MEMBERS_TAB_DEPT_ONLY_ROLES = ['Responsable', 'Adjoint'];

// Département "maison" d'un rôle sans affectation explicite (démo/simulation de profil).
export const ROLE_HOME_DEPT: Record<string, string> = {
  Responsable: 'dept_tech', Adjoint: 'dept_tech', Coach: 'dept_louange', Leader: 'dept_mres',
  ADN: 'dept_adn', Intégration: 'dept_integration', GDC: 'dept_gdc', Portier: 'dept_ushers',
};

// Global rank order for account-management ceiling (who can delete/promote whom).
// Territorial Bloom Bus tiers (Responsable du Département Bloom Bus → Responsable de
// Commune → Responsable de Zone → Capitaine de Bus) and 'Responsable de section' (a
// generic department-function role — ANY department can have sections, not just Bloom
// Bus, cf. DepartmentsView.tsx) all sit nested at the same point Responsable/Adjoint
// occupy in the general org — not a separate ranking, just these positions in sequence.
export const RANK_ORDER = [
  'Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre',
  'Responsable', 'Adjoint',
  'Responsable du Département Bloom Bus', 'Responsable de Commune',
  'Responsable de Zone', 'Responsable de section', 'Capitaine de Bus',
  'Membre', 'Nouveau',
];

export function rankOf(role: string): number {
  const i = RANK_ORDER.indexOf(role);
  return i === -1 ? RANK_ORDER.length : i; // rôle inconnu = rang le plus bas, fail-closed
}

export function bestRank(roles: string[]): number {
  return Math.min(...roles.map(rankOf), RANK_ORDER.length);
}

// Qui peut supprimer/rétrograder/promouvoir le compte de qui. Volontairement distinct
// de inMemberScope (qui régit l'édition ordinaire) : la portée structurelle (département/
// ministère/branche) reste une condition nécessaire, mais on exige EN PLUS un rang
// strictement supérieur. Super Admin/Admin/Pasteur Principal/Pasteur (FULL_SCOPE_ROLES)
// gèrent tout le monde, sans restriction de portée.
export function canManageAccountOf(
  operator: Member,
  operatorRoles: string[],
  target: Member,
  targetRoles: string[],
  scopeRole: string,
  busLines: BloomBusEntity[],
  departments: Department[],
  ministries: Ministry[] = [],
): boolean {
  if (target.id === operator.id) return false;
  if (FULL_SCOPE_ROLES.includes(scopeRole)) return true;
  if (!inMemberScope(operator, target, scopeRole, busLines, departments, ministries)) return false;
  return bestRank(operatorRoles) < bestRank(targetRoles);
}

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

  if (role === 'Capitaine de Bus') {
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
    // Correctif audit (validé, Phase 4) — un même département partagé entre les deux branches
    // ne donne portée que sur les membres qui y servent au nom de LA MÊME branche que
    // l'opérateur (branche d'attache, ou deptBranches pour un Coach+ en département
    // secondaire). Sans ce test, un Responsable Church voyait/gérait aussi les membres
    // Light du même département — la branche n'était jamais comparée.
    return operatorDeptIds.some(id =>
      targetDeptIds.includes(id) && effectiveBranchFor(operator, id) === effectiveBranchFor(target, id));
  }

  // ponytail: fail-open for roles not covered above — the page-level
  // `view_members` gate already restricts who reaches this far.
  return true;
}

// Bloom Bus hierarchy/cloisonnement (P4.4bis) — le TITRE organisationnel (Ministre,
// Responsable d'un autre département, Coach, etc.) ne donne AUCUN accès automatique au
// module Bloom Bus. Seul le rôle réellement occupé DANS Bloom Bus détermine la portée, et
// ce rôle doit être lu directement dans le département spécial dept_bloom_bus — jamais dans
// le rôle organisationnel résolu (resolveMemberRole), qui ne garde qu'un seul rôle par
// ordre de priorité globale et peut donc masquer la fonction Bloom Bus d'un membre si un
// autre titre (ex. Ministre, Responsable d'un autre département) est plus prioritaire.
// Seule exception : les pasteurs ont un accès global, indépendamment de tout rôle Bloom
// Bus (Super Admin/Admin gardent aussi un accès global, en tant que rôles système).
// M5 a fait passer DeptFunction en snake_case côté stockage, mais toute la logique de scope
// raisonne en noms de rôle capitalisés. On remappe donc la valeur stockée vers le nom de rôle.

export function bloomBusRoleOf(operator: Member, departments: Department[]): string | undefined {
  const busDept = departments.find(d => d.specialFunction === 'bloom_bus');
  const fn = busDept ? operator.departments?.[busDept.id] : undefined;
  return fn ? roleForDeptFn(fn) : undefined;
}

export function fullBloomBusAccess(operator: Member, role: string, departments: Department[]): boolean {
  if (FULL_SCOPE_ROLES.includes(role)) return true;
  return bloomBusRoleOf(operator, departments) === 'Responsable';
}

export function busInScope(
  operator: Member,
  bus: BloomBusEntity,
  role: string,
  busLines: BloomBusEntity[],
  departments: Department[] = [],
): boolean {
  if (fullBloomBusAccess(operator, role, departments)) return true;

  const bbRole = bloomBusRoleOf(operator, departments);
  if (bbRole === 'Responsable de Zone') {
    const operatorZone = busLines.find(b => b.id === operator.bloomBusId)?.zone;
    return !!operatorZone && operatorZone === bus.zone;
  }
  if (bbRole === 'Responsable de Commune') {
    const operatorCommune = busLines.find(b => b.id === operator.bloomBusId)?.commune ?? operator.gps?.commune;
    return !!operatorCommune && operatorCommune === bus.commune;
  }
  // Capitaine de Bus, Membre, ou aucune fonction Bloom Bus déclarée mais un bus rattaché
  // (bloomBusId) : cantonné à son propre bus. Pas de bus rattaché → aucun accès (fail-closed,
  // contrairement à inMemberScope — l'accès à Bloom Bus doit être explicite).
  return !!operator.bloomBusId && operator.bloomBusId === bus.id;
}

// Hiérarchie de remplissage de rapport (spec "semaines/saisie hiérarchique") — qui peut
// remplir le rapport de qui, à chaque palier Bloom Bus. Même primitive bloomBusRoleOf que
// busInScope, mais relation de subordination directe (pas de cloisonnement en lecture).
export function directReportsOf(
  operator: Member,
  role: string,
  members: Member[],
  busLines: BloomBusEntity[],
  departments: Department[],
): Member[] {
  const bbRole = bloomBusRoleOf(operator, departments);

  if (FULL_SCOPE_ROLES.includes(role)) {
    return members.filter((m) => bloomBusRoleOf(m, departments) === 'Responsable');
  }
  if (bbRole === 'Responsable') {
    return members.filter((m) => bloomBusRoleOf(m, departments) === 'Responsable de Commune');
  }
  if (bbRole === 'Responsable de Commune') {
    const operatorCommune = busLines.find((b) => b.id === operator.bloomBusId)?.commune ?? operator.gps?.commune;
    return members.filter((m) => {
      if (bloomBusRoleOf(m, departments) !== 'Responsable de Zone') return false;
      const mCommune = busLines.find((b) => b.id === m.bloomBusId)?.commune ?? m.gps?.commune;
      return !!operatorCommune && operatorCommune === mCommune;
    });
  }
  if (bbRole === 'Responsable de Zone') {
    const operatorZone = busLines.find((b) => b.id === operator.bloomBusId)?.zone;
    return members.filter((m) => {
      if (bloomBusRoleOf(m, departments) !== 'Capitaine de Bus') return false;
      const mZone = busLines.find((b) => b.id === m.bloomBusId)?.zone;
      return !!operatorZone && operatorZone === mZone;
    });
  }
  if (bbRole === 'Capitaine de Bus') {
    return operator.bloomBusId
      ? members.filter((m) => {
          if (m.id === operator.id || m.bloomBusId !== operator.bloomBusId) return false;
          const mRole = bloomBusRoleOf(m, departments);
          return !mRole || mRole === 'Membre';
        })
      : [];
  }
  return [];
}

// Enregistrement direct d'un membre par un responsable hiérarchique Bloom Bus (hors
// procédure ADN "nouveau", cf. spec) — Capitaine/Zone/Commune uniquement ; le
// dept-lead (Responsable) et les rôles à accès complet passent par le formulaire normal.
export function canRegisterMemberViaBloomBus(operator: Member, role: string, departments: Department[]): boolean {
  const bbRole = bloomBusRoleOf(operator, departments);
  return !!bbRole && ['Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune'].includes(bbRole);
}

// Qui peut remplir le rapport d'un membre :
//  - soi-même (auto-évaluation) ;
//  - ses subordonnés directs (hiérarchie de saisie) ;
//  - AUTORITÉ TERRITORIALE : un « responsable » (accès complet, Responsable de Zone/Commune,
//    Capitaine) peut remplir le rapport de tout membre dont le bus est dans sa portée
//    (busInScope). Ainsi, en descendant dans un bus, on remplit les rapports de ses membres.
//    Un SIMPLE membre ne remplit que le sien (pas les autres de son bus).
export function canFillReportFor(
  operator: Member,
  target: Member,
  role: string,
  members: Member[],
  busLines: BloomBusEntity[],
  departments: Department[],
): boolean {
  if (target.id === operator.id) return true;
  if (directReportsOf(operator, role, members, busLines, departments).some((m) => m.id === target.id)) return true;
  const bbRole = bloomBusRoleOf(operator, departments);
  const isManager = FULL_SCOPE_ROLES.includes(role)
    || ['Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune', 'Responsable'].includes(bbRole ?? '');
  if (!isManager) return false;
  const bus = busLines.find((b) => b.id === target.bloomBusId);
  return !!bus && busInScope(operator, bus, role, busLines, departments);
}
