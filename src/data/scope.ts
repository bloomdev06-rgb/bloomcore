// Data-scope restriction for MembersView (P4.3) — narrows which members a role
// can see, below the page-level `view_members` gate (that gate only decides who
// can open the tab at all).
import { Member, BloomBusEntity, Department, Ministry } from '../types';

export const FULL_SCOPE_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'];
// PROFILS-INTERFACES : seuls la ligne pastorale/staff et le Coach (bi-branche) ont le
// commutateur de branche ; tous les autres profils sont verrouillés sur Member.branch.
export const MULTI_BRANCH_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre', 'Coach'];
// La vue « Global » (consolidation des 2 branches) est réservée au staff.
export const GLOBAL_VIEW_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre'];
// ponytail: proxy via shared department, not a real mentor/filleul link — upgrade
// to a dedicated relation once that model exists.
const DEPARTMENT_PROXY_ROLES = ['Responsable', 'Adjoint', 'Coach', 'Leader'];

// Rôles qui gèrent leurs membres uniquement depuis l'onglet Membres de leur page
// Département, pas depuis l'onglet Membres global de la barre latérale.
export const MEMBERS_TAB_DEPT_ONLY_ROLES = ['Responsable', 'Adjoint'];

// Département "maison" d'un rôle sans affectation explicite (démo/simulation de profil).
export const ROLE_HOME_DEPT: Record<string, string> = {
  Responsable: 'dept_tech', Adjoint: 'dept_tech', Coach: 'dept_louange', Leader: 'dept_mres',
  ADN: 'dept_adn', Intégration: 'dept_integration', GDC: 'dept_gdc', Portier: 'dept_ushers',
};

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
    return operatorDeptIds.some(id => targetDeptIds.includes(id));
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
export function bloomBusRoleOf(operator: Member, departments: Department[]): string | undefined {
  const busDept = departments.find(d => d.specialFunction === 'bloom_bus');
  return busDept ? operator.departments?.[busDept.id] : undefined;
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
