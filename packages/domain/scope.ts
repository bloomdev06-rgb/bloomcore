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
  const ownMinistries = role === 'Ministre' ? ministries.filter(m => m.tuteurId === operator?.id) : [];
  const ownMinistry = ownMinistries[0];
  // Les affectations RÉELLES du membre priment. ROLE_HOME_DEPT est une table codée en dur,
  // héritée du mode démonstration (« Simuler profil » faisait semblant d'appartenir à un
  // département correspondant au rôle choisi) : elle était testée EN PREMIER et écrasait donc
  // les vraies données. Un responsable du Département Bloom Bus reconnu « Coach » se voyait
  // ainsi annoncer « votre département (Bloom Praise) » — ROLE_HOME_DEPT.Coach = dept_louange —
  // et son tableau de bord était calculé sur ce département auquel il n'appartient pas, d'où
  // des compteurs tous à zéro. Elle ne sert plus que de dernier recours, pour les profils de
  // test qui n'ont aucun département.
  const homeDeptId = Object.entries(operator?.departments ?? {}).find(([, fn]) => fn === 'responsable')?.[0]
    || Object.keys(operator?.departments ?? {})[0]
    || ROLE_HOME_DEPT[role];
  const assignedDeptIds = Object.keys(operator?.departments ?? {});
  const deptIds: string[] | null =
    role === 'Ministre' ? departments.filter(d => ownMinistries.some(m => m.id === d.ministryId)).map(d => d.id)
    : ['Responsable', 'Coach', 'Leader'].includes(role) ? (assignedDeptIds.length ? assignedDeptIds : homeDeptId ? [homeDeptId] : [])
    : null; // Pasteur/Pasteur Principal/Admin/Super Admin → toute l'église.

  if (deptIds === null) return { members, reports, deptIds: null, label: 'Global' };

  const deptSet = new Set(deptIds);
  const scopedMembers = members.filter(m => Object.keys(m.departments).some(id => deptSet.has(id)));
  const memberIdSet = new Set(scopedMembers.map(m => m.id));
  const scopedReports = reports.filter(r =>
    (r.departmentId && deptSet.has(r.departmentId)) ||
    (r.content?.memberId && memberIdSet.has(r.content.memberId)));
  const label = ownMinistries.length > 1 ? 'Mes ministères'
    : ownMinistry ? ownMinistry.name // les noms de ministère contiennent déjà « Ministère … »
    : deptIds.length > 1 ? 'Mes départements'
    : deptIds.length ? `Département ${departments.find(d => d.id === deptIds[0])?.name ?? ''}`
    : 'Ma portée';
  return { members: scopedMembers, reports: scopedReports, deptIds, label };
}

// Autorité structurelle dans la branche pour le Pasteur, mais portée inter-branches
// exclusivement pour les trois rôles globaux.
export const FULL_SCOPE_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'];
export const CROSS_BRANCH_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal'];
// PROFILS-INTERFACES : seuls la ligne pastorale/staff et le Coach (bi-branche) ont le
// commutateur de branche ; tous les autres profils sont verrouillés sur Member.branch.
export const MULTI_BRANCH_ROLES = CROSS_BRANCH_ROLES;
// La vue « Global » (consolidation des 2 branches) est réservée au staff.
export const GLOBAL_VIEW_ROLES = CROSS_BRANCH_ROLES;
const DEPARTMENT_SUPERVISOR_FUNCTION: Record<string, string> = {
  Responsable: 'responsable',
  Adjoint: 'adjoint',
};

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

// Département "maison" d'un rôle sans affectation explicite (démo/simulation de profil).
export const ROLE_HOME_DEPT: Record<string, string> = {
  Responsable: 'dept_tech', Adjoint: 'dept_tech', Coach: 'dept_louange', Leader: 'dept_actions_prophetiques',
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
  _scopeRole: string,
  busLines: BloomBusEntity[],
  departments: Department[],
  ministries: Ministry[] = [],
): boolean {
  if (target.id === operator.id) return false;
  if (!inMemberScopeForRoles(operator, target, operatorRoles, busLines, departments, ministries)) return false;
  return bestRank(operatorRoles) < bestRank(targetRoles);
}

/**
 * Union des périmètres réellement détenus par un opérateur. Les rôles sont cumulables,
 * mais chacun reste attaché à sa source : être Responsable de D1 ne transforme jamais
 * une simple appartenance à D2 en responsabilité sur D2.
 */
export function inMemberScopeForRoles(
  operator: Member,
  target: Member,
  roles: Iterable<string>,
  busLines: BloomBusEntity[],
  departments: Department[],
  ministries: Ministry[] = [],
): boolean {
  if (target.id === operator.id) return true;
  return [...new Set(roles)].some((role) =>
    inMemberScope(operator, target, role, busLines, departments, ministries));
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
  if (CROSS_BRANCH_ROLES.includes(role)) return true;
  if (role === 'Pasteur') return operator.branch === target.branch;

  if (role === 'Ministre') {
    if (operator.branch !== target.branch) return false;
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

  const supervisorFunction = DEPARTMENT_SUPERVISOR_FUNCTION[role];
  if (supervisorFunction) {
    const operatorDeptIds = Object.entries(operator.departments ?? {})
      .filter(([, fn]) => fn === supervisorFunction)
      .map(([id]) => id);
    const targetDeptIds = Object.keys(target.departments);
    // Correctif audit (validé, Phase 4) — un même département partagé entre les deux branches
    // ne donne portée que sur les membres qui y servent au nom de LA MÊME branche que
    // l'opérateur (branche d'attache, ou deptBranches pour un Coach+ en département
    // secondaire). Sans ce test, un Responsable Church voyait/gérait aussi les membres
    // Light du même département — la branche n'était jamais comparée.
    return operatorDeptIds.some(id =>
      targetDeptIds.includes(id) && effectiveBranchFor(operator, id) === effectiveBranchFor(target, id));
  }

  // Coach/Leader : la portée est la relation d'accompagnement explicite, pas une simple
  // appartenance au même département (qui exposait tous les collègues du département).
  if (role === 'Coach' || role === 'Leader') {
    return target.mentorId === operator.id && operator.branch === target.branch;
  }

  // Responsable de pôle/section : uniquement les personnes rattachées à SON pôle dans
  // le même département et la même branche effective.
  if (role === 'Responsable de section') {
    return Object.entries(operator.departments ?? {}).some(([deptId, fn]) => {
      const sectionId = operator.deptSections?.[deptId];
      return fn === 'responsable_section'
        && !!sectionId
        && target.departments?.[deptId] !== undefined
        && target.deptSections?.[deptId] === sectionId
        && effectiveBranchFor(operator, deptId) === effectiveBranchFor(target, deptId);
    });
  }

  // Outils transverses bornés : Baptême travaille sur les personnes de sa branche ;
  // Intégration uniquement sur les nouveaux/demandes encore en traitement.
  if (role === 'Baptême') return operator.branch === target.branch;
  if (role === 'Intégration') {
    return operator.branch === target.branch
      && (target.level === 'nouveau' || target.deptAttachmentStatus === 'pending');
  }

  // Rôle inconnu ou sans portée métier : refus par défaut.
  return false;
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

// Les départements existent en DEUX instances, une par branche (Department.branch, reliées
// par familyId). `find` renvoyait la PREMIÈRE instance bloom_bus de la liste sans vérifier que
// l'opérateur y a une fonction : un responsable rattaché à l'AUTRE instance était vu comme
// n'ayant aucune fonction Bloom Bus, et retombait sur la portée d'un simple bus — exactement
// le symptôme « responsable du département mais accès limité à son seul bus ».
// On parcourt donc toutes les instances et on retient la fonction réellement détenue, la plus
// forte si le membre en a plusieurs (rankOf : plus le rang est petit, plus la fonction est haute).
export function bloomBusRolesOf(operator: Member, departments: Department[]): Set<string> {
  const busDepts = departments.filter(d => d.specialFunction === 'bloom_bus');
  const roles = new Set<string>();

  // 1. LE PONT. Le responsable DU DÉPARTEMENT Bloom Bus est d'office au sommet du MODULE —
  //    la seule passerelle entre les deux réalités. Il n'a pas besoin de busRole.
  //    (Au-dessus de lui : son ministre de tutelle, les pasteurs et les admin, traités
  //    ailleurs par les rôles globaux.)
  for (const d of busDepts) {
    if (operator.departments?.[d.id] === 'responsable') roles.add('Responsable');
  }

  // 2. La fonction TERRITORIALE, dans son champ dédié. Indépendante de toute fonction tenue
  //    dans le département : on peut être capitaine sans appartenir au département, ou
  //    adjoint du département sans aucune fonction territoriale.
  for (const role of operator.busRoles ?? []) roles.add(roleForDeptFn(role));
  if (operator.busRole) roles.add(roleForDeptFn(operator.busRole));

  // 3. Compatibilité — données d'AVANT la séparation, où la fonction territoriale était rangée
  //    dans l'emplacement du département. Lue tant qu'elles n'ont pas été migrées
  //    (scripts/migrate-bus-roles.ts), pour qu'aucun responsable ne perde son accès entre le
  //    déploiement et la migration. Les fonctions ordinaires (adjoint, trésorier…) ne sont PAS
  //    des rôles du module : elles ne donnent aucun accès territorial.
  //    Les deux orthographes sont acceptées : la valeur migrée (`capitaine`) et le nom de rôle
  //    d'avant la migration M5 (`Capitaine de Bus`), que d'anciennes fiches portent encore.
  const LEGACY: Record<string, string> = {
    capitaine: 'Capitaine de Bus',
    responsable_zone: 'Responsable de Zone',
    responsable_commune: 'Responsable de Commune',
    'Capitaine de Bus': 'Capitaine de Bus',
    'Responsable de Zone': 'Responsable de Zone',
    'Responsable de Commune': 'Responsable de Commune',
  };
  for (const d of busDepts) {
    const legacy = LEGACY[String(operator.departments?.[d.id])];
    if (legacy) roles.add(legacy);
  }
  return roles;
}

// Le rôle le plus haut pilote le périmètre et les droits ; bloomBusRolesOf conserve toutes
// les fonctions pour les listes hiérarchiques et l'affichage.
export function bloomBusRoleOf(operator: Member, departments: Department[]): string | undefined {
  const roles = bloomBusRolesOf(operator, departments);
  return BUS_ROLE_LADDER.find((role) => roles.has(role));
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

// Inverse de directReportsOf : le·s superviseur·s territoriaux directs d'UN membre donné
// (pas de l'opérateur courant). Même chaîne Capitaine → Zone → Commune → Responsable.
export function busSupervisorsOf(
  target: Member,
  members: Member[],
  busLines: BloomBusEntity[],
  departments: Department[],
): Member[] {
  const bbRole = bloomBusRoleOf(target, departments);
  const bus = busLines.find((b) => b.id === target.bloomBusId);
  if ((!bbRole || bbRole === 'Membre' || bbRole === 'Capitaine de Bus') && bus) {
    return members.filter((m) => bloomBusRoleOf(m, departments) === 'Responsable de Zone'
      && busLines.find((b) => b.id === m.bloomBusId)?.zone === bus.zone);
  }
  if (bbRole === 'Responsable de Zone' && bus) {
    return members.filter((m) => bloomBusRoleOf(m, departments) === 'Responsable de Commune'
      && (busLines.find((b) => b.id === m.bloomBusId)?.commune ?? m.gps?.commune) === bus.commune);
  }
  if (bbRole === 'Responsable de Commune') {
    return members.filter((m) => bloomBusRoleOf(m, departments) === 'Responsable');
  }
  return [];
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

// --- Attribution des fonctions Bloom Bus (§27) ---------------------------------------------
// Décisions métier arbitrées le 28/08/2026, absentes du cahier des charges initial qui ne
// décrivait que qui ÉVALUE qui et qui VOIT quoi, jamais qui NOMME :
//   a. un responsable nomme dans son périmètre territorial (un Resp. de Zone nomme les
//      capitaines de sa zone) ;
//   c. uniquement des fonctions STRICTEMENT sous la sienne — jamais son propre niveau ;
//   d. les Responsables de Commune sont nommés par le Responsable du département Bloom Bus,
//      le Ministre de tutelle, les Pasteurs et les comptes Admin ;
//   b. ces fonctions sont indépendantes de l'évolution du membre : un Capitaine peut n'être
//      qu'un « boss » dans son parcours. Le §9.4 (« pas de gestion de l'évolution des
//      membres ») n'est donc PAS contredit — une affectation Bloom Bus n'est pas une évolution.
//
// Du plus élevé au plus bas. 'Responsable' = responsable DU DÉPARTEMENT Bloom Bus, sommet du
// module (c'est ce que renvoie bloomBusRoleOf pour la fonction `responsable`).
export const BUS_ROLE_LADDER = [
  'Responsable', 'Responsable de Commune', 'Responsable de Zone', 'Capitaine de Bus', 'Membre',
] as const;

export function busRankOf(role: string | undefined): number {
  const i = BUS_ROLE_LADDER.indexOf(role as typeof BUS_ROLE_LADDER[number]);
  return i === -1 ? BUS_ROLE_LADDER.length : i; // inconnu = plus bas, fail-closed
}

// L'opérateur peut-il attribuer `targetRole` à `target` ? Deux conditions cumulatives pour la
// ligne territoriale : un rang STRICTEMENT supérieur, et le membre visé dans son périmètre.
export function canAssignBusRole(
  operator: Member,
  operatorRoles: string[],
  target: Member,
  targetRole: string,
  busLines: BloomBusEntity[],
  departments: Department[],
  ministries: Ministry[] = [],
): boolean {
  if (!BUS_ROLE_LADDER.includes(targetRole as typeof BUS_ROLE_LADDER[number])) return false;

  // Décision (d) : Pasteurs et Admin passent partout, comme sur le reste de l'application.
  if (operatorRoles.some(r => FULL_SCOPE_ROLES.includes(r))) return true;

  // …et le Ministre de tutelle DU ministère qui porte le département Bloom Bus — pas
  // n'importe quel ministre, sinon un ministre d'un autre périmètre nommerait ici. Boucle sur
  // TOUTES les instances (church + light), même correctif dual-branche que bloomBusRoleOf.
  const busDepts = departments.filter(d => d.specialFunction === 'bloom_bus');
  if (busDepts.some(d => ministries.some(m => m.id === d.ministryId && m.tuteurId === operator.id))) return true;

  const opRole = bloomBusRoleOf(operator, departments);
  if (!opRole) return false; // aucune fonction Bloom Bus → ne nomme personne
  if (busRankOf(opRole) >= busRankOf(targetRole)) return false; // (c) strictement en dessous

  // Le responsable du département couvre tout le module ; en dessous, le périmètre
  // territorial s'applique au bus du membre visé.
  if (opRole === 'Responsable') return true;
  const targetBus = busLines.find(b => b.id === target.bloomBusId);
  if (!targetBus) return false; // membre sans bus → hors de toute zone/commune
  return busInScope(operator, targetBus, opRole, busLines, departments);
}

// --- Affectations d'un membre, regroupées par branche (§26) ---------------------------------
// Un Coach et au-dessus peut servir dans plusieurs départements, y compris dans les DEUX
// branches, avec une fonction différente à chaque fois. La fiche membre affichait ces
// affectations à plat, sans la fonction occupée — impossible d'y lire « responsable ici,
// simple membre là ». Cette fonction produit la vue attendue : deux groupes, chacun listant
// département + fonction.
//
// La branche d'une affectation est `effectiveBranchFor` : l'override deptBranches quand il
// existe (département secondaire dans l'autre branche), sinon la branche d'attache du membre.
// Un département portant le même rôle fonctionnel dans les deux branches existe en DEUX
// enregistrements distincts (church/light, reliés par familyId) : les deux apparaissent donc
// naturellement, chacun dans son groupe.
export interface MemberAssignment {
  deptId: string;
  name: string;      // nom du département, ou son id s'il a disparu
  fn: string;        // fonction STOCKÉE (membre, responsable…) — libellé via labelFor
  missing: boolean;  // le département n'existe plus : à signaler plutôt qu'à masquer
}

export function memberAssignmentsByBranch(
  member: Member,
  departments: Department[],
): { church: MemberAssignment[]; light: MemberAssignment[]; global: MemberAssignment[] } {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const out = { church: [] as MemberAssignment[], light: [] as MemberAssignment[], global: [] as MemberAssignment[] };
  for (const [deptId, fn] of Object.entries(member.departments ?? {})) {
    const dept = byId.get(deptId);
    const branch = effectiveBranchFor(member, deptId);
    const bucket = branch === 'light' ? out.light : branch === 'global' ? out.global : out.church;
    bucket.push({ deptId, name: dept?.name ?? deptId, fn: String(fn), missing: !dept });
  }
  // Tri stable par nom : l'ordre des clés d'un objet suit l'ordre d'insertion, ce qui ferait
  // sauter les lignes d'une consultation à l'autre.
  for (const list of [out.church, out.light, out.global]) list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return out;
}
