// RBAC serveur — rôles RÉELS dérivés des données (jamais du `simulatedRole` UI,
// qui n'est qu'un commutateur de démo côté client). Réutilise les modules purs
// du frontend (permissions.ts, scope.ts) pour que client et serveur ne puissent
// pas diverger sur la sémantique des capacités et du scope.
import { Member, Ministry, PermissionMatrix, Delegation, AdminAccount, Department, BloomBusEntity, SpecialAuthorization, CapabilityOverride } from '../packages/domain/types.ts';
import { resolveCapability } from '../packages/domain/permissions.ts';
import { inMemberScope, canFillReportFor, busInScope, fullBloomBusAccess, bloomBusRoleOf, MULTI_BRANCH_ROLES, COACH_AND_ABOVE, canManageAccountOf, bestRank, canAssignBusRole } from '../packages/domain/scope.ts';
import { isBusReportLocked } from '../packages/domain/reportLock.ts';
import { getKv } from './datastore.ts';
import { GuardError, readCollection, canonical } from './guards.ts';
import { roleForDeptFn, roleForLevel } from '../packages/shared/migrate.ts';
import { departmentToolRoles, memberCanReadProject } from '../packages/domain/access.ts';

// M5 : valeurs de cursus snake_case §3 (comparées à member.pastoralCursus migré). Le
// vocabulaire de RÔLES (FULL_SCOPE_ROLES, STAFF_ROLES…) reste stable — on remappe les
// valeurs stockées vers ces noms de rôles au moment de la dérivation (cf. M5-PLAN.md §3.4).
const PASTORAL_ROLES = ['pasteur_titulaire', 'pasteur_assistant', 'assistant_pasteur'];
const AUTHORITY_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'];
const CROSS_BRANCH_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal'];
const STAFF_ROLES = ['Responsable', 'Ministre', 'Pasteur', 'Admin', 'Super Admin'];
const ABOVE_MEMBER_ROLES = [
  ...STAFF_ROLES, 'Adjoint', 'Coach', 'Leader',
  'Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune',
];
// Ordre de résolution du rôle de scope pour inMemberScope (qui attend UN rôle).
// §240/§5 — capacité qu'une SpecialAuthorization doit porter pour qu'un non-Coach voie les
// rapports de suivi des membres de son périmètre (exception nominative Ministre/Pasteur).
const CAP_VOIR_SUIVI_MEMBRE = 'consulter_rapports_suivi_membre';

const SCOPE_ROLE_ORDER: [string, string][] = [
  ['Ministre', 'Ministre'],
  ['Capitaine de Bus', 'Capitaine de Bus'],
  ['Responsable de Zone', 'Responsable de Zone'],
  ['Responsable de Commune', 'Responsable de Commune'],
  ['Responsable', 'Responsable'],
  ['Adjoint', 'Adjoint'],
  ['Coach', 'Coach'],
  ['Leader', 'Leader'],
];

export function resolveRoles(member: Member, admins: AdminAccount[], ministries: Ministry[], departments: Department[] = []): string[] {
  const roles = new Set<string>();
  // Convention adm_<memberId> (types.ts) ; l'id nu est toléré par robustesse.
  const adminEntry = admins.find(
    (a) => !(a as any).deletedAt && (a.id === `adm_${member.id}` || a.id === member.id),
  );
  if (adminEntry) roles.add(adminEntry.role);
  if (PASTORAL_ROLES.includes(member.pastoralCursus)) roles.add('Pasteur');
  if (ministries.some((m) => !(m as any).deletedAt && m.tuteurId === member.id)) roles.add('Ministre');
  for (const fn of Object.values(member.departments ?? {})) roles.add(roleForDeptFn(fn));
  for (const role of departmentToolRoles(member, departments, ministries)) roles.add(role);
  // Fonction du MODULE Bloom Bus : elle ne vit plus dans `departments` depuis la
  // séparation §27, mais elle donne toujours le rôle correspondant (Capitaine de Bus,
  // Responsable de Zone/Commune) — sans quoi le membre perdrait son périmètre territorial.
  if (member.busRole) roles.add(roleForDeptFn(member.busRole));
  if (member.level === 'coach' || member.level === 'leader') roles.add(roleForLevel(member.level));
  roles.add('Membre');
  return [...roles];
}

export interface RbacContext {
  member: Member;
  roles: string[];
}

// Construit le contexte pour un memberId authentifié — null si le membre a disparu.
export async function buildContext(memberId: string): Promise<RbacContext | null> {
  const member = (await readCollection('members')).find((m: Member) => m.id === memberId);
  if (!member) return null;
  const admins = await readCollection('admins') as AdminAccount[];
  const ministries = await readCollection('ministries') as Ministry[];
  const departments = await readCollection('departments') as Department[];
  return { member, roles: resolveRoles(member, admins, ministries, departments) };
}

const hasAny = (roles: string[], allowed: string[]) => roles.some((r) => allowed.includes(r));

// Capacité accordée si N'IMPORTE LEQUEL des rôles résolus la détient — via `resolveCapability`
// (matrice live ⊕ CapabilityOverride ⊕ SpecialAuthorization ⊕ délégation), la MÊME logique que
// le client. Sans règle dynamique, identique à hasCapability ; avec, les RÉVOCATIONS de la
// matrice dynamique sont désormais appliquées côté serveur (avant : seulement en UI, cf. audit).
async function hasCapAnyRole(ctx: RbacContext, capability: string): Promise<boolean> {
  const matrix = (await getKv('permissions') ?? {}) as PermissionMatrix;
  const delegations = await readCollection('delegations') as Delegation[];
  const overrides = await readCollection('capability_overrides') as CapabilityOverride[];
  const specialAuths = await readCollection('special_authorizations') as SpecialAuthorization[];
  return ctx.roles.some((role) =>
    resolveCapability(matrix, capability, ctx.member, role, delegations, overrides, specialAuths),
  );
}

// §13.2 — champs de santé confidentiels de la fiche membre, gardés par capacité (miroir exact
// de Member360View). Un opérateur qui ne détient pas la capacité ne les voit ni ne les écrit
// (masquage lecture + repinçage écriture). Retourne la liste des champs healthKPIs à protéger.
async function protectedHealthFields(ctx: RbacContext): Promise<string[]> {
  const blocked: string[] = [];
  if (!(await hasCapAnyRole(ctx, 'consulter_situation_financiere'))) blocked.push('financier');
  if (!(await hasCapAnyRole(ctx, 'consulter_historique_presence'))) blocked.push('presenceCulte', 'presenceService');
  return blocked;
}

// Items ajoutés ou modifiés par rapport au stocké (le scoping ne s'applique
// qu'à ce que l'opérateur touche réellement, pas au reste du whole-array).
async function touchedItems(name: string, incoming: any[]): Promise<any[]> {
  const stored = await readCollection(name, true);
  const byId = new Map(stored.map((s: any) => [String(s.id), s]));
  return incoming.filter((it) => {
    const old = byId.get(String(it.id));
    return !old || canonical(old) !== canonical(it);
  });
}

// Ids stockés HORS de la portée de LECTURE de l'opérateur (symétrie avec filterReadable) :
// ce que la lecture cache est exactement ce que l'écriture doit préserver. Un client scopé
// ne détient qu'un sous-ensemble ; son PUT whole-array omet le reste non pour le supprimer
// mais parce qu'il ne l'a jamais reçu. Ces ids ne sont donc ni des suppressions (pas de 403)
// ni des tombstones (préservés par applyWrite). Full-scope → ensemble vide → LWW classique.
export async function preservedIds(name: string, ctx: RbacContext): Promise<Set<string>> {
  const stored = (await readCollection(name, true)).filter((s: any) => !s.deletedAt);
  const visible = new Set((await filterReadable(name, ctx, stored)).map((s: any) => String(s.id)));
  return new Set(
    stored.filter((s: any) => !visible.has(String(s.id))).map((s: any) => String(s.id)),
  );
}

// Items vivants VISIBLES par l'opérateur mais absents du payload → suppressions
// intentionnelles, transformées en tombstone par applyWrite. Le scoping DOIT les couvrir
// (S3 — on ne supprime que dans son périmètre). Les items hors-portée sont exclus ici
// (préservés, cf. preservedIds) : un Capitaine renvoyant ses seuls membres ne tombstone
// plus — et n'est plus 403 par — le reste de l'église qu'il ne voit pas.
async function removedItems(name: string, incoming: any[], ctx: RbacContext): Promise<any[]> {
  const incomingIds = new Set(incoming.map((it) => String(it.id)));
  const preserve = await preservedIds(name, ctx);
  return (await readCollection(name, true)).filter(
    (s: any) => !s.deletedAt && !incomingIds.has(String(s.id)) && !preserve.has(String(s.id)),
  );
}

// Porte d'écriture par collection + scoping par item. Lève GuardError(403/400).
export async function assertCanWrite(name: string, ctx: RbacContext, incoming: any[]): Promise<void> {
  const { roles, member } = ctx;

  switch (name) {
    case 'permissions':
    case 'admins':
      if (!roles.includes('Super Admin')) throw new GuardError(403, `${name}: réservé au Super Admin`);
      return;

    case 'settings':
    case 'forms':
      if (!hasAny(roles, ['Admin', 'Super Admin'])) throw new GuardError(403, `${name}: réservé aux Admin`);
      return;

    case 'capability_overrides':
      // §11.2 CAHIER — matrice de permissions DYNAMIQUE, configurable « par Admin / Pasteur
      // Principal / Super Admin » (plus large que la matrice statique réservée Super Admin ;
      // exclut le Pasteur simple).
      if (!hasAny(roles, ['Admin', 'Pasteur Principal', 'Super Admin'])) {
        throw new GuardError(403, 'capability_overrides: réservé aux Admin / Pasteur Principal / Super Admin');
      }
      return;

    case 'special_authorizations': {
      // §5 — exception nominative accordée par Ministre/Pasteur. Anti-escalade : personne ne
      // s'auto-octroie une capacité (un compte compromis ne s'élève pas), sauf Super Admin.
      const GRANTORS = ['Ministre', 'Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin'];
      if (!hasAny(roles, GRANTORS)) throw new GuardError(403, 'special_authorizations: réservé aux Ministres et Pasteurs');
      if (!roles.includes('Super Admin')) {
        for (const s of (await touchedItems(name, incoming)) as SpecialAuthorization[]) {
          if (s.memberId === member.id) throw new GuardError(403, 'special_authorizations: auto-octroi interdit');
        }
      }
      return;
    }

    case 'delegations': {
      if (!hasAny(roles, STAFF_ROLES)) throw new GuardError(403, 'delegations: réservé aux Responsables et plus');
      // Interdiction spec (§11.3) : le rapport spirituel n'est jamais délégable. On bloque les DEUX
      // clés (l'ancienne `rapport_bloom_bus_member` ET `consulter_rapports_de_vie`, celle exclue des
      // DELEGABLE_CAPS de l'UI) pour que le garde serveur reflète exactement la règle métier.
      const NON_DELEGABLE = new Set(['rapport_bloom_bus_member', 'consulter_rapports_de_vie']);
      if (incoming.some((d: Delegation) => NON_DELEGABLE.has(d.right))) {
        throw new GuardError(400, 'delegations: le rapport spirituel/de vie n\'est jamais délégable');
      }
      return;
    }

    case 'members': {
      const baptismToolOnly = roles.includes('Baptême') && !hasAny(roles, ABOVE_MEMBER_ROLES);
      if (!baptismToolOnly && !(await hasCapAnyRole(ctx, 'view_members'))) throw new GuardError(403, 'members: capacité view_members requise');
      if (baptismToolOnly) {
        const stored = new Map((await readCollection(name, true)).map((item: any) => [String(item.id), item]));
        const baptismDeptIds = new Set((await readCollection('departments') as Department[])
          .filter(department => department.specialFunction === 'bapteme').map(department => department.id));
        if ((await removedItems(name, incoming, ctx)).length) throw new GuardError(403, 'members: le rôle Baptême ne peut supprimer aucun membre');
        const allowed = new Set(['id', 'departments', 'currentStepId', 'baptismStatus', 'baptismDate', 'baptismViaDepartment', 'updatedAt']);
        for (const item of await touchedItems(name, incoming)) {
          const before = stored.get(String(item.id));
          if (!before || item.branch !== member.branch) throw new GuardError(403, `members: ${item.id} hors du périmètre Baptême`);
          for (const key of new Set([...Object.keys(before), ...Object.keys(item)])) {
            if (!allowed.has(key) && canonical(before[key]) !== canonical(item[key])) {
              throw new GuardError(403, `members: le rôle Baptême ne peut modifier '${key}'`);
            }
          }
          const beforeDepts = before.departments ?? {};
          const afterDepts = item.departments ?? {};
          for (const departmentId of new Set([...Object.keys(beforeDepts), ...Object.keys(afterDepts)])) {
            if (!baptismDeptIds.has(departmentId) && canonical(beforeDepts[departmentId]) !== canonical(afterDepts[departmentId])) {
              throw new GuardError(403, `members: le rôle Baptême ne peut modifier le département ${departmentId}`);
            }
          }
        }
        return;
      }
      // Point 1 (Phase 4) — département secondaire dans l'AUTRE branche (deptBranches) réservé
      // aux rôles Coach+ (COACH_AND_ABOVE, scope.ts). Contrôle sur la CIBLE de l'écriture, donc
      // placé AVANT le court-circuit full-scope ci-dessous : même un Admin ne doit pas pouvoir
      // doter un Membre/Leader d'un rattachement secondaire hors de sa branche d'attache.
      {
        const adminsForRole = await readCollection('admins') as AdminAccount[];
        const ministriesForRole = await readCollection('ministries') as Ministry[];
        for (const item of await touchedItems(name, incoming)) {
          const db = (item as Member).deptBranches;
          if (db && Object.keys(db).length && !hasAny(resolveRoles(item as Member, adminsForRole, ministriesForRole), COACH_AND_ABOVE)) {
            throw new GuardError(403, `members: ${item.id} — département secondaire (deptBranches) réservé aux rôles Coach et plus`);
          }
        }
      }
      // §27 — vocabulaire : les fonctions territoriales (capitaine, responsable de zone/commune)
      // appartiennent au MODULE Bloom Bus et vivent dans `busRole`. Les réintroduire dans
      // l'emplacement département recréerait la confusion que la séparation supprime et
      // rouvrirait un second chemin d'attribution, hors du contrôle de rang plus bas. Placé
      // AVANT le court-circuit full-scope : c'est une erreur de modèle, pas de permission —
      // même un Admin ne doit pas pouvoir l'écrire.
      {
        const TERRITORIAL = ['capitaine', 'responsable_zone', 'responsable_commune'];
        const busDeptIds = new Set((await readCollection('departments') as Department[])
          .filter((d) => d.specialFunction === 'bloom_bus').map((d) => d.id));
        const storedForVocab = new Map((await readCollection(name, true)).map((x: any) => [String(x.id), x]));
        for (const item of await touchedItems(name, incoming)) {
          const before = storedForVocab.get(String((item as any).id));
          for (const deptId of busDeptIds) {
            const apres = (item as Member).departments?.[deptId];
            // Seulement sur CHANGEMENT : une fiche non encore migrée doit rester enregistrable
            // tant qu'on ne touche pas à cette valeur, sinon toute écriture la concernant
            // échouerait entre le déploiement et la migration.
            if (canonical(before?.departments?.[deptId]) === canonical(apres)) continue;
            if (apres && TERRITORIAL.includes(String(apres))) {
              throw new GuardError(400,
                `members: ${item.id} — « ${apres} » est une fonction du MODULE Bloom Bus : elle s'attribue dans le module (champ busRole), pas dans le département`);
            }
          }
        }
      }
      if (hasAny(roles, CROSS_BRANCH_ROLES)) return;
      // Symétrique de la lecture (filterReadable, fail-closed) : sans rôle de périmètre
      // déterminé, un opérateur n'écrit QUE sur sa propre fiche. Sinon inMemberScope ferait
      // du fail-open sur 'Membre' (scope.ts) → écriture sur n'importe quel membre.
      const scopeEntry = roles.includes('Pasteur')
        ? ['Pasteur', 'Pasteur'] as [string, string]
        : SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r));
      const departments = await readCollection('departments') as Department[];
      const ministries = await readCollection('ministries') as Ministry[];
      // Bus lines LIVES (pas le seed figé) : un bus créé/déplacé change les zones/communes
      // servant au scoping Responsable de Zone/Commune.
      const busLines = await readCollection('bus_lines') as BloomBusEntity[];
      // Écritures ET suppressions par omission : les deux doivent rester dans le périmètre.
      for (const target of [...(await touchedItems(name, incoming)), ...(await removedItems(name, incoming, ctx))]) {
        const inScope = scopeEntry
          ? inMemberScope(member, target as Member, scopeEntry[1], busLines, departments, ministries)
          : String((target as Member).id) === String(member.id);
        if (!inScope) {
          throw new GuardError(403, `members: ${target.id} hors de votre périmètre (${scopeEntry?.[1] ?? 'Membre'})`);
        }
      }
      // C1 — défense en profondeur : un opérateur non full-scope ne peut pas s'AUTO-promouvoir
      // en modifiant les champs privilégiés de SA PROPRE fiche (`departments` alimente
      // resolveRoles → escalade de rôle). Les responsables gèrent bien ces champs sur les
      // AUTRES membres (target.id ≠ self, non bloqué ici) — jamais sur eux-mêmes.
      const storedById = new Map((await readCollection(name, true)).map((s: any) => [String(s.id), s]));
      const selfBefore = storedById.get(String(member.id));
      if (selfBefore) {
        for (const item of await touchedItems(name, incoming)) {
          if (String(item.id) !== String(member.id)) continue;
          for (const f of ['departments', 'level', 'pastoralCursus', 'bloomBusId', 'deptAttachmentStatus', 'deptAttachmentOrigin', 'testRole']) {
            if (canonical((item as any)[f]) !== canonical((selfBefore as any)[f])) {
              throw new GuardError(403, `members: champ privilégié '${f}' non modifiable sur votre propre fiche`);
            }
          }
        }
      }
      // Pendant hiérarchique de C1 : promotion/rétrogradation d'un AUTRE membre (target.id ≠
      // self, donc non bloqué par C1 ci-dessus). Un opérateur non full-scope ne peut modifier
      // ces mêmes champs privilégiés que sur une cible de rang STRICTEMENT inférieur au sien
      // (Ministre gère ses Responsables et leurs membres, pas un autre Ministre ; Responsable
      // gère ses membres, pas un pair Responsable).
      {
        const adminsForRank = await readCollection('admins') as AdminAccount[];
        for (const item of await touchedItems(name, incoming)) {
          if (String(item.id) === String(member.id)) continue;
          const stored = storedById.get(String(item.id));
          if (!stored) continue; // création : pas de rang antérieur à comparer
          const changed = ['departments', 'level', 'pastoralCursus'].some(
            (f) => canonical((item as any)[f]) !== canonical((stored as any)[f]),
          );
          if (!changed) continue;
          const targetRolesBefore = resolveRoles(stored as Member, adminsForRank, ministries);
          if (bestRank(roles) >= bestRank(targetRolesBefore)) {
            throw new GuardError(403, `members: ${item.id} — rang égal ou supérieur au vôtre, modification refusée`);
          }
        }
      }
      // §13.2 — repinçage symétrique du masquage lecture : un opérateur qui ne VOIT pas les champs
      // de santé confidentiels (financier/présence, selon sa capacité) ne peut pas les ÉCRIRE. On
      // restaure la valeur stockée sur chaque membre existant modifié → un PUT (whole-array ou
      // delta) d'un opérateur qui les a reçus masqués ne peut ni les effacer ni les falsifier.
      // (full-scope est déjà sorti plus haut ; ne concerne donc que l'encadrement intermédiaire.)
      const blockedFields = await protectedHealthFields(ctx);
      if (blockedFields.length) {
        for (const item of await touchedItems(name, incoming)) {
          const stored = storedById.get(String((item as any).id));
          if (!stored) continue; // création : aucune valeur antérieure à préserver
          (item as any).healthKPIs = { ...((item as any).healthKPIs ?? {}) };
          for (const f of blockedFields) (item as any).healthKPIs[f] = stored.healthKPIs?.[f];
        }
      }
      // §27 — DÉPARTEMENT Bloom Bus et MODULE Bloom Bus sont deux choses distinctes :
      //   - `departments[<dept bloom_bus>]` porte une fonction DE DÉPARTEMENT (responsable,
      //     adjoint, trésorier, …). Seul `responsable` engage le module, par le pont « le
      //     responsable du département est le plus haut responsable du module » : ce
      //     changement-là passe donc par la hiérarchie territoriale. Les autres fonctions du
      //     département suivent les règles ordinaires d'affectation.
      //   - `busRole` porte la fonction TERRITORIALE (capitaine, responsable de zone/commune).
      //     Elle ne s'attribue que depuis le module Bloom Bus, par quelqu'un de rang
      //     strictement supérieur ET dans le périmètre (voir canAssignBusRole).
      // Le contrôle vit ici, côté serveur, pour qu'aucun chemin d'écriture — formulaire,
      // import, appel direct — ne le contourne.
      {
        const allDepts = await readCollection('departments') as Department[];
        const busDeptIds = new Set(allDepts.filter((d) => d.specialFunction === 'bloom_bus').map((d) => d.id));
        const storedById2 = new Map((await readCollection(name, true)).map((x: any) => [String(x.id), x]));
        const allMinistries = await readCollection('ministries') as Ministry[];
        const allBus = await readCollection('bus_lines') as BloomBusEntity[];
        for (const item of await touchedItems(name, incoming)) {
          const before = storedById2.get(String((item as any).id));
          const cible = (before ?? item) as Member;

          for (const deptId of busDeptIds) {
            const avant = before?.departments?.[deptId];
            const apres = (item as Member).departments?.[deptId];
            if (canonical(avant) === canonical(apres)) continue; // fonction inchangée
            // (le vocabulaire territorial a déjà été refusé plus haut, avant le full-scope)
            // Seul le sommet du département engage le module.
            if (String(avant) !== 'responsable' && String(apres) !== 'responsable') continue;
            const roleVise = roleForDeptFn((apres ?? 'membre') as any);
            if (!canAssignBusRole(member, roles, cible, roleVise, allBus, allDepts, allMinistries)) {
              throw new GuardError(403,
                `members: ${item.id} — l'attribution de la fonction Bloom Bus « ${roleVise} » dépasse votre périmètre ou votre niveau`);
            }
          }

          const busAvant = (before as Member | undefined)?.busRole;
          const busApres = (item as Member).busRole;
          if (canonical(busAvant) !== canonical(busApres)) {
            // Retrait comme attribution : les deux modifient la hiérarchie territoriale.
            // Le rang à franchir est le PLUS HAUT des deux, sinon un capitaine pourrait
            // destituer un responsable de commune en le « ramenant » à un rang qu'il domine.
            for (const fn of [busApres, busAvant]) {
              if (!fn) continue;
              const roleVise = roleForDeptFn(fn as any);
              if (!canAssignBusRole(member, roles, cible, roleVise, allBus, allDepts, allMinistries)) {
                throw new GuardError(403,
                  `members: ${item.id} — la fonction Bloom Bus « ${roleVise} » dépasse votre périmètre ou votre niveau`);
              }
            }
          }
        }
      }

      // §9.2 — jalons de baptême, même repinçage, pour la capacité déléguable
      // `modifier_jalons_bapteme_integration`. Elle n'était appliquée QUE côté client
      // (ProgrammesView, boutons « Inscrire au baptême » / avancement d'étape) : la révoquer
      // dans la matrice masquait les boutons mais n'empêchait pas l'écriture par appel API
      // direct — vérifié en test, un Responsable sans la capacité passait un membre à
      // « baptisé » en HTTP 200. Les champs sont exactement ceux que ces boutons écrivent.
      // Placé APRÈS le court-circuit full-scope, comme le masquage santé ci-dessus : la ligne
      // Admin/Pasteur reste souveraine sur ces jalons.
      if (!(await hasCapAnyRole(ctx, 'modifier_jalons_bapteme_integration'))) {
        for (const item of await touchedItems(name, incoming)) {
          const stored = storedById.get(String((item as any).id));
          if (!stored) continue; // création : le formulaire membre porte déjà ces champs
          for (const f of ['baptismStatus', 'baptismDate', 'baptismViaDepartment', 'currentStepId']) {
            (item as any)[f] = stored[f];
          }
        }
      }
      return;
    }

    // 'ministries' à part (pas dans le case partagé ci-dessous) : c'est ici qu'on fixe
    // tuteurId, qui accorde le rôle Ministre (resolveRoles). STAFF_ROLES inclut Responsable
    // ET Ministre — sans ce gate dédié, un Responsable pourrait nommer/révoquer n'importe
    // qui Ministre sans aucun contrôle de portée (trou de sécurité, aucun chemin UI ne le
    // fait déjà : MinisteresView réserve l'édition à Pasteur/Admin/Super Admin — canEdit).
    case 'ministries':
      if (!hasAny(roles, AUTHORITY_ROLES)) throw new GuardError(403, 'ministries: réservé au staff pastoral (Pasteur/Admin/Super Admin)');
      if (!hasAny(roles, CROSS_BRANCH_ROLES)) {
        for (const ministry of [...(await touchedItems(name, incoming)), ...(await removedItems(name, incoming, ctx))]) {
          if (ministry.branch && ministry.branch !== member.branch) throw new GuardError(403, `ministries: ${ministry.id} appartient à l'autre branche`);
        }
      }
      return;

    case 'events':
      if (!hasAny(roles, AUTHORITY_ROLES) && !roles.includes('GDC')) throw new GuardError(403, 'events: rôle GDC ou pastoral requis');
      if (!hasAny(roles, CROSS_BRANCH_ROLES)) {
        for (const ev of [...(await touchedItems(name, incoming)), ...(await removedItems(name, incoming, ctx))]) {
          if (ev.branch && ev.branch !== 'global' && member.branch && ev.branch !== member.branch) {
            throw new GuardError(403, `events: ${ev.id} appartient à l'autre branche`);
          }
        }
      }
      return;

    case 'activities':
    case 'departments': {
      const departments = await readCollection('departments') as Department[];
      const ministries = await readCollection('ministries') as Ministry[];
      const managed = new Set(Object.entries(member.departments ?? {})
        .filter(([, fn]) => fn === 'responsable').map(([id]) => id));
      for (const ministry of ministries.filter(m => m.tuteurId === member.id)) {
        departments.filter(d => d.ministryId === ministry.id && (!d.branch || d.branch === member.branch))
          .forEach(d => managed.add(d.id));
      }
      const targets = [...(await touchedItems(name, incoming)), ...(await removedItems(name, incoming, ctx))];
      if (hasAny(roles, CROSS_BRANCH_ROLES)) return;
      if (roles.includes('Pasteur')) {
        for (const target of targets) {
          const dept = name === 'departments' ? target : departments.find(d => d.id === target.departmentId);
          if (dept?.branch && dept.branch !== member.branch) throw new GuardError(403, `${name}: ${target.id} appartient à l'autre branche`);
        }
        return;
      }
      for (const target of targets) {
        const departmentId = name === 'departments' ? target.id : target.departmentId;
        if (!managed.has(departmentId)) throw new GuardError(403, `${name}: ${target.id} hors des départements supervisés`);
      }
      return;
    }

    case 'reports': {
      const reportTargets = [...(await touchedItems(name, incoming)), ...(await removedItems(name, incoming, ctx))];
      const toolReporter = reportTargets.length > 0 && reportTargets.every(r =>
        (r.reportType === 'rapport_culte' && roles.includes('GDC'))
        || (r.reportType === 'rapport_portiers' && roles.includes('Portier')),
      );
      if (!toolReporter && !hasAny(roles, ABOVE_MEMBER_ROLES) && !(await hasCapAnyRole(ctx, 'rapport_service'))) {
        throw new GuardError(403, 'reports: rôle serviteur ou délégation requis');
      }
      // Verrou 24h : un rapport Bloom Bus rempli et/ou validé n'est plus modifiable (ni
      // supprimable) 24h après le dernier de ces deux événements — pour TOUS les rôles,
      // admins compris (immuabilité des rapports déposés). Seul l'acte de validation
      // (validated/validatedAt) reste permis après coup : relecture, pas modification.
      {
        const oldById = new Map((await readCollection('reports', true)).map((s: any) => [String(s.id), s]));
        for (const r of await touchedItems(name, incoming)) {
          const old = oldById.get(String(r.id));
          if (!old || old.deletedAt || !isBusReportLocked(old)) continue;
          const validationOnly = canonical({ ...old, validated: r.validated, validatedAt: r.validatedAt }) === canonical(r);
          if (!validationOnly) {
            throw new GuardError(403, `reports: ${r.id} verrouillé — rapport Bloom Bus non modifiable 24h après remplissage/validation`);
          }
        }
        for (const r of await removedItems(name, incoming, ctx)) {
          if (isBusReportLocked(r)) {
            throw new GuardError(403, `reports: ${r.id} verrouillé — suppression impossible 24h après remplissage/validation`);
          }
        }
      }
      const departmentsForTools = await readCollection('departments') as Department[];
      for (const r of reportTargets) {
        const department = departmentsForTools.find(d => d.id === r.departmentId);
        const isGdc = r.reportType === 'rapport_culte' || department?.specialFunction === 'gestion_cultes';
        const isPortier = r.reportType === 'rapport_portiers' || department?.specialFunction === 'portiers';
        if (r.reportType === 'rapport_culte' && department?.specialFunction !== 'gestion_cultes') {
          throw new GuardError(400, `reports: ${r.id} doit cibler un département Gestion des Cultes`);
        }
        if (r.reportType === 'rapport_portiers' && department?.specialFunction !== 'portiers') {
          throw new GuardError(400, `reports: ${r.id} doit cibler un département Portiers`);
        }
        if (isGdc && !hasAny(roles, [...AUTHORITY_ROLES, 'GDC'])) throw new GuardError(403, `reports: ${r.id} requiert le rôle GDC`);
        if (isPortier && !hasAny(roles, [...AUTHORITY_ROLES, 'Portier'])) throw new GuardError(403, `reports: ${r.id} requiert le rôle Portier`);
        if ((isGdc || isPortier) && department?.branch && !hasAny(roles, CROSS_BRANCH_ROLES) && department.branch !== member.branch) {
          throw new GuardError(403, `reports: ${r.id} appartient à l'autre branche`);
        }
      }
      if (!hasAny(roles, CROSS_BRANCH_ROLES)) {
        const scopeRole = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r))?.[1] ?? 'Membre';
        const allMembers = await readCollection('members') as Member[];
        const busLines = await readCollection('bus_lines') as BloomBusEntity[];
        const departments = await readCollection('departments') as Department[];
        for (const r of [...(await touchedItems(name, incoming)), ...(await removedItems(name, incoming, ctx))]) {
          if (r.targetBranch && r.targetBranch !== 'global' && member.branch && r.targetBranch !== member.branch) {
            throw new GuardError(403, `reports: ${r.id} appartient à l'autre branche`);
          }
          // Miroir serveur de canFillReportFor (client) : un rapport santé Bloom Bus ne peut
          // viser qu'un subordonné direct (ou soi-même) dans la hiérarchie Bloom Bus. Empêche
          // le bypass par appel API direct que l'UI interdisait déjà.
          if (r.reportType === 'rapport_bloom_bus_member' && r.content?.memberId) {
            const target = allMembers.find((m) => m.id === r.content.memberId);
            if (target && !canFillReportFor(member, target, scopeRole, allMembers, busLines, departments)) {
              throw new GuardError(403, `reports: ${r.id} hors de votre hiérarchie Bloom Bus`);
            }
            // Auto-validation interdite : un membre qui remplit SON propre rapport ne peut pas le
            // marquer validé — la validation est réservée au capitaine (ou au-dessus).
            if (r.content.memberId === member.id && r.validated === true) {
              const captainOrAbove = ['Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune', 'Responsable']
                .includes(bloomBusRoleOf(member, departments) ?? '');
              if (!captainOrAbove) {
                throw new GuardError(403, `reports: auto-validation interdite (réservée au capitaine)`);
              }
            }
          }
        }
      }
      return;
    }

    case 'certifications':
      // §10 — inscription formations/certifications réservée aux habilités par la capacité
      // (par défaut Responsable+ ; PAS Coach). Enforce la capacité fine (avant : UI seule).
      if (!(await hasCapAnyRole(ctx, 'inscrire_formations_certifications'))) {
        throw new GuardError(403, 'certifications: capacité inscrire_formations_certifications requise');
      }
      return;

    case 'integration_reports':
      // Données opérationnelles (projets) — écriture réservée à l'encadrement.
      if (!hasAny(roles, ABOVE_MEMBER_ROLES)) throw new GuardError(403, `${name}: rôle d'encadrement requis`);
      return;

    case 'projects': {
      const targets = [...(await touchedItems(name, incoming)), ...(await removedItems(name, incoming, ctx))];
      if (hasAny(roles, CROSS_BRANCH_ROLES)) return;
      for (const project of targets) {
        const branchOk = project.scope !== 'branche' || !project.branch || project.branch === member.branch;
        const ministryOk = project.scope !== 'ministere' || (await readCollection('ministries') as Ministry[])
          .some(m => m.id === project.ministryId && m.tuteurId === member.id && (!m.branch || m.branch === member.branch));
        const pastoral = roles.includes('Pasteur') && branchOk;
        const minister = roles.includes('Ministre') && ministryOk;
        if (!pastoral && !minister && !memberCanReadProject(member.id, project)) {
          throw new GuardError(403, `projects: ${project.id} hors de votre équipe`);
        }
      }
      return;
    }

    // 'bus_lines' à part : CRUD territorial (créer/déplacer/supprimer un bus/zone/commune),
    // pas une simple saisie — ECRANS-PAR-ONGLET.md §5.3 le réserve explicitement à l'Admin
    // (miroir de canAdminTerritory, BloomBusView.tsx). ABOVE_MEMBER_ROLES (qui inclut Capitaine
    // de Bus, Responsable de Zone/Commune) était un trou : sans AUCUNE restriction de portée,
    // n'importe quel capitaine pouvait supprimer/déplacer via l'API n'importe quel bus de
    // l'église entière, pas seulement le sien (l'UI le lui interdisait déjà — canAdminTerritory
    // masque le bouton, mais un appel API direct passait).
    case 'bus_lines': {
      if (hasAny(roles, ['Admin', 'Super Admin'])) return;
      // §27 pont : le responsable du département Bloom Bus a autorité pleine sur le module,
      // y compris le CRUD territorial (créer/déplacer/supprimer bus/zone), pas seulement
      // l'attribution de busRole (déjà couverte plus bas).
      const deptsAll = await readCollection('departments') as Department[];
      if (fullBloomBusAccess(member, roles[0] ?? 'Membre', deptsAll)) return;
      throw new GuardError(403, 'bus_lines: CRUD territorial réservé à l\'Admin ou au responsable du département Bloom Bus');
    }

    case 'audits': {
      // Journal inviolable : l'append-only vit dans guards.ts. Ici on empêche la
      // FORGE — un membre ne peut insérer que des entrées à son propre nom (S4).
      for (const a of await touchedItems(name, incoming)) {
        if (a.operatorId && a.operatorId !== member.id) {
          throw new GuardError(403, "audits: operatorId doit être le vôtre (journal non falsifiable)");
        }
      }
      return;
    }

    case 'notifications': {
      // L'émission vers autrui (→ fan-out email/SMS/WhatsApp) est réservée à
      // l'encadrement ; un simple membre ne touche que ses propres notifications (S4).
      if (hasAny(roles, ABOVE_MEMBER_ROLES)) return;
      for (const n of await touchedItems(name, incoming)) {
        if (n.targetMemberId && n.targetMemberId !== member.id) {
          throw new GuardError(403, 'notifications: réservé à vos propres notifications');
        }
      }
      return;
    }

    default:
      // Collection inconnue : refus par défaut plutôt qu'autorisation implicite.
      throw new GuardError(403, `${name}: écriture non autorisée`);
  }
}

// Porte de SUPPRESSION de compte — hiérarchie de rang (canManageAccountOf, scope.ts) :
// un Ministre supprime ses Responsables et leurs membres, un Responsable supprime les
// membres de son département, un Membre ne supprime jamais personne. Distinct de
// assertCanWrite('members', …) : la portée structurelle (inMemberScope) reste une
// condition nécessaire, mais on exige EN PLUS un rang strictement supérieur à la cible.
export async function assertCanDelete(ctx: RbacContext, target: Member): Promise<void> {
  const { member, roles } = ctx;
  const admins = await readCollection('admins') as AdminAccount[];
  const ministries = await readCollection('ministries') as Ministry[];
  const departments = await readCollection('departments') as Department[];
  const busLines = await readCollection('bus_lines') as BloomBusEntity[];
  const targetRoles = resolveRoles(target, admins, ministries);
  const scopeEntry = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r));
  const scopeRole = scopeEntry ? scopeEntry[1] : 'Membre';
  if (!canManageAccountOf(member, roles, target, targetRoles, scopeRole, busLines, departments, ministries)) {
    throw new GuardError(403, `members: suppression de ${target.id} refusée (hors périmètre ou rang insuffisant)`);
  }
}

// Porte de LECTURE (S2) : filtre une collection avant de la renvoyer au client, selon
// les rôles RÉELS. Le filtrage de confidentialité et de scope vivait uniquement côté
// client (rideau cosmétique) ; ici la donnée sensible n'est simplement plus envoyée.
export async function filterReadable(name: string, ctx: RbacContext, items: any[]): Promise<any[]> {
  const { roles, member } = ctx;
  const fullScope = hasAny(roles, CROSS_BRANCH_ROLES);

  switch (name) {
    case 'reports': {
      // §8.3 — le corps pastoral voit les rapports confidentiels ; un Coach/Responsable
      // seulement si explicitement partagé. La confidentialité prime même sur Admin/Super Admin.
      const pastoralCorps = hasAny(roles, ['Pasteur', 'Pasteur Principal', 'Ministre']);
      // §240/§5 CAHIER — un rapport de SUIVI de membre (rapport_suivi_coach, confidentiel, ciblant
      // un membre) est visible au Coach dont ce membre relève du périmètre ; et par EXCEPTION
      // NOMINATIVE à un non-Coach porteur d'une SpecialAuthorization (accordée par Ministre/
      // Pasteur). Grant ADDITIF — n'élargit qu'aux parties explicitement autorisées, ne masque rien.
      const isCoach = roles.includes('Coach');
      const suiviAuths = ((await readCollection('special_authorizations')) as SpecialAuthorization[]).filter(
        (s) => !s.deletedAt && s.memberId === member.id && s.capability === CAP_VOIR_SUIVI_MEMBRE
          && (s.branchId == null || s.branchId === member.branch),
      );
      let suiviSubjectInScope: (memberId: string) => boolean = () => false;
      if (isCoach || suiviAuths.length) {
        const scopeEntry = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r));
        if (scopeEntry) {
          const byId = new Map(((await readCollection('members')) as Member[]).map((m) => [m.id, m]));
          const departments = await readCollection('departments') as Department[];
          const ministries = await readCollection('ministries') as Ministry[];
          const busLines = await readCollection('bus_lines') as BloomBusEntity[];
          suiviSubjectInScope = (mid) => {
            const subject = byId.get(mid);
            return !!subject && inMemberScope(member, subject, scopeEntry[1], busLines, departments, ministries);
          };
        }
      }
      // §8.1 — cascade de visibilité par FILIÈRE pour les rapports NON confidentiels : un rapport
      // ne remonte qu'à la hiérarchie de sa filière. Rapport Bloom Bus → hiérarchie Bloom Bus
      // (capitaine/zone/commune/responsable du bus visé) ; rapport de département → hiérarchie du
      // département (fonction supervisrice dans CE département, ou ministre de tutelle). Le corps
      // pastoral / full-scope voient tout ; l'auteur voit toujours le sien. Ainsi un Responsable de
      // dépt ne voit PAS les rapports Bloom Bus de ses membres s'il n'est pas dans la filière bus.
      const scopeRole = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r))?.[1] ?? 'Membre';
      const SUP_DEPT_FNS = new Set(['responsable', 'adjoint', 'responsable_section']);
      let allMembers: Member[] = [];
      let deptsAll: Department[] = [];
      let minsAll: Ministry[] = [];
      let busAll: BloomBusEntity[] = [];
      if (!fullScope && !pastoralCorps) {
        allMembers = await readCollection('members') as Member[];
        deptsAll = await readCollection('departments') as Department[];
        minsAll = await readCollection('ministries') as Ministry[];
        busAll = await readCollection('bus_lines') as BloomBusEntity[];
      }
      const canSeeNonConfidential = (r: any): boolean => {
        if (fullScope || pastoralCorps) return true;
        if (r.authorId && r.authorId === member.id) return true;
        const isBus = r.reportType === 'rapport_bloom_bus_member'
          || r.reportType === 'rapport_bloom_bus_life' || r.departmentId === 'dept_bloom_bus';
        if (isBus) {
          if (r.reportType === 'rapport_bloom_bus_member' && r.content?.memberId) {
            const subject = allMembers.find((m) => m.id === r.content.memberId);
            return !!subject && canFillReportFor(member, subject, scopeRole, allMembers, busAll, deptsAll);
          }
          if (r.content?.busId) {
            const bus = busAll.find((b) => b.id === r.content.busId);
            return !!bus && busInScope(member, bus, scopeRole, busAll, deptsAll);
          }
          return fullBloomBusAccess(member, scopeRole, deptsAll);
        }
        if (r.departmentId) {
          const fn = member.departments?.[r.departmentId];
          if (fn && SUP_DEPT_FNS.has(fn)) return true;
          const dept = deptsAll.find((d) => d.id === r.departmentId);
          return !!dept && minsAll.some((mi) => mi.id === dept.ministryId && mi.tuteurId === member.id);
        }
        // Rapport sans filière identifiable (ni bus ni département) : REFUS par défaut.
        // C'était un `return true` (visibilité de branche, faute de hiérarchie à remonter).
        // Le défaut permissif était le vrai risque : un futur type de rapport introduit sans
        // `departmentId` devenait lisible par tout membre de la branche SILENCIEUSEMENT.
        // Aucun type actuel n'emprunte ce chemin — tous portent un departmentId, sauf
        // rapport_pastoral qui est confidentiel et traité dans l'autre branche — donc ce
        // basculement n'ôte rien à personne aujourd'hui, et transforme un oubli futur en
        // absence visible plutôt qu'en fuite. Auteur, corps pastoral et full-scope sont
        // déjà sortis plus haut : eux continuent de voir.
        return false;
      };
      let out = items.filter((r) => {
        if (!r.confidential) return canSeeNonConfidential(r);
        if (pastoralCorps) return true;
        if (r.reportType === 'rapport_suivi_coach' && r.content?.memberId
            && (isCoach || suiviAuths.length) && suiviSubjectInScope(r.content.memberId)) return true;
        return hasAny(roles, ['Coach', 'Responsable']) && !!r.partagerAvecResponsableDept;
      });
      // Hors corps à périmètre global, on ne renvoie que la branche de l'opérateur.
      if (!fullScope && member.branch) {
        out = out.filter((r) => !r.targetBranch || r.targetBranch === 'global' || r.targetBranch === member.branch);
      }
      // Scale : les rapports de plus de 24 mois restent en base (archives) mais ne sont
      // plus servis au bootstrap — et par symétrie preservedIds, jamais tombstonés par les
      // PUT whole-array des clients qui ne les ont pas reçus. 24 mois = 2× la période max
      // du sélecteur (année) ; le générateur de rapports couvre donc toujours ses bornes.
      const archiveCutoff = new Date();
      archiveCutoff.setMonth(archiveCutoff.getMonth() - 24);
      out = out.filter((r) => {
        const d = new Date(r.weekOf ?? r.date);
        return Number.isNaN(d.getTime()) || d >= archiveCutoff; // sans date lisible → jamais archivé
      });
      return out;
    }

    case 'members': {
      if (fullScope) return items;
      // §13.2 — masque les champs de santé confidentiels non autorisés (financier/présence) sur
      // CHAQUE fiche renvoyée. Symétrique du repinçage en écriture (assertCanWrite members) : ce
      // qu'un opérateur ne voit pas, il ne peut pas l'écrire. (full-scope voit tout, sorti ci-dessus.)
      const blocked = await protectedHealthFields(ctx);
      const mask = (m: any) => {
        if (!blocked.length) return m;
        const hk = { ...(m.healthKPIs ?? {}) };
        for (const f of blocked) delete hk[f];
        return { ...m, healthKPIs: hk };
      };
      if (roles.includes('Baptême')) return items.filter(m => m.id === member.id || m.branch === member.branch).map(mask);
      const scopeEntry = roles.includes('Pasteur')
        ? ['Pasteur', 'Pasteur'] as [string, string]
        : SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r));
      // Aucun rôle de périmètre (simple membre) : inMemberScope fait du fail-open,
      // donc on court-circuite ici — il ne voit que sa propre fiche.
      if (!scopeEntry) return items.filter((m) => m.id === member.id).map(mask);
      const departments = await readCollection('departments') as Department[];
      const ministries = await readCollection('ministries') as Ministry[];
      const busLines = await readCollection('bus_lines') as BloomBusEntity[];
      return items
        .filter((m) =>
          m.id === member.id ||
          inMemberScope(member, m as Member, scopeEntry[1], busLines, departments, ministries),
        )
        .map(mask);
    }

    case 'admins':
      // Qui détient les clés de l'application n'a pas à être connu de tout l'encadrement
      // intermédiaire (Coach, Leader, Adjoint, Capitaine…) alors que l'écran Comptes est
      // réservé aux Admin. Sa SEULE utilité côté client hors de cet écran est de résoudre
      // le rôle de l'OPÉRATEUR (src/data/roles.ts resolveMemberRole, appelé une seule fois,
      // sur lui-même) : on lui renvoie donc sa propre entrée, et rien d'autre. Les rôles
      // full-scope — qui incluent nécessairement les Admin — gardent la liste complète.
      return hasAny(roles, AUTHORITY_ROLES)
        ? items
        : items.filter((a: any) => a.id === `adm_${member.id}` || a.id === member.id);

    case 'delegations':
    case 'certifications':
    case 'integration_reports':
      // Données d'encadrement — invisibles au simple membre.
      return hasAny(roles, ABOVE_MEMBER_ROLES) ? items : [];

    case 'events':
      // Cloisonnement par branche (PROFILS-INTERFACES) : un profil mono-branche ne reçoit
      // que les événements de SA branche (+ global). La ligne pastorale/staff et le Coach
      // (bi-branche) reçoivent tout — règle du cahier, inchangée.
      if (!hasAny(roles, MULTI_BRANCH_ROLES) && member.branch) {
        const b = (x: any) => x.branch ?? x.targetBranch;
        return items.filter((x) => !b(x) || b(x) === 'global' || b(x) === member.branch || x.scope === 'both');
      }
      return items;

    case 'projects': {
      if (fullScope) return items;
      const ministries = await readCollection('ministries') as Ministry[];
      const tutored = new Set(ministries.filter(m => m.tuteurId === member.id).map(m => m.id));
      return items.filter(project => {
        if (memberCanReadProject(member.id, project)) return true;
        if (roles.includes('Pasteur')) return project.scope !== 'branche' || !project.branch || project.branch === member.branch;
        return roles.includes('Ministre') && project.scope === 'ministere' && tutored.has(project.ministryId)
          && (!project.branch || project.branch === member.branch);
      });
    }

    case 'notifications': {
      // Même cloisonnement par branche, PLUS confidentialité personnelle : une notification
      // ciblée (targetMemberId défini) n'est lisible que par son destinataire — l'encadrement
      // la voit pour la supervision (symétrique de l'émission, ABOVE_MEMBER_ROLES). Sans ce
      // filtre, toute notif personnelle fuitait à toute la branche.
      const above = hasAny(roles, ABOVE_MEMBER_ROLES);
      const branchOk = hasAny(roles, MULTI_BRANCH_ROLES) || !member.branch
        ? () => true
        : (x: any) => {
            const b = x.branch ?? x.targetBranch;
            return !b || b === 'global' || b === member.branch || x.scope === 'both';
          };
      return items.filter((n) =>
        branchOk(n) && (above || !n.targetMemberId || n.targetMemberId === member.id));
    }

    case 'audits':
      // Journal d'audit : PII (noms, operatorId, événements PASSWORD_RESET_ISSUED en clair).
      // Réservé à l'encadrement supérieur — invisible au simple membre.
      return hasAny(roles, AUTHORITY_ROLES) ? items : [];

    case 'capability_overrides':
      // Lecture symétrique à l'écriture (assertCanWrite ci-dessus) : la matrice dynamique
      // de capacités n'est pas exposée plus largement en lecture qu'en écriture.
      return hasAny(roles, ['Admin', 'Pasteur Principal', 'Super Admin']) ? items : [];

    case 'special_authorizations':
      // Lecture symétrique à l'écriture (GRANTORS dans assertCanWrite) : les exceptions
      // nominatives (qui a accès aux rapports de suivi confidentiels de qui) ne fuitent
      // pas à tout membre authentifié via /bootstrap.
      return hasAny(roles, ['Ministre', 'Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin'])
        ? items
        : [];

    default:
      // ministries, departments, activities, forms, settings : nécessaires au
      // fonctionnement de l'UI, entités transverses sans PII confidentielle par branche.
      return items;
  }
}

// Porte de lecture des valeurs KV (permissions, settings) — elles ne passent PAS par
// filterReadable, qui ne traite que les collections tableau (voir /bootstrap et GET /:name).
//
// `permissions` ne peut pas être simplement masquée : le client s'en sert pour construire sa
// navigation (canView) et résoudre ses propres capacités. La couper renverrait une application
// vide à tout membre non-Admin. On ne retire donc pas les CAPACITÉS (les lignes), mais les
// RÔLES (les colonnes) : chacun reçoit la configuration des rôles qu'il détient réellement,
// et plus celle des autres. `canView(matrice, onglet, sonRôle)` continue de fonctionner à
// l'identique, tandis que « ce qu'un Pasteur a le droit de faire » cesse d'être public pour
// tout compte authentifié. Les rôles habilités à VOIR l'écran Permissions reçoivent tout.
//
// `settings` est renvoyé tel quel : branches, fuseau, langue, périodes et déclencheurs de
// notification sont indispensables au rendu et ne contiennent aucun secret (les identifiants
// SMTP/Twilio vivent dans l'environnement du serveur, jamais dans cette valeur).
const PERMISSION_MATRIX_VIEWERS = ['Super Admin', 'Admin', 'Pasteur Principal'];

export function filterKv(name: string, ctx: RbacContext, value: unknown): unknown {
  if (name !== 'permissions' || !value || typeof value !== 'object') return value;
  if (hasAny(ctx.roles, PERMISSION_MATRIX_VIEWERS)) return value;
  // `testRole` force un rôle d'affichage côté client (profils de test) : sans sa colonne, un
  // tel compte perdrait toute sa navigation. Inclus pour ne pas casser les profils de test.
  const visible = new Set([...ctx.roles, ...(ctx.member.testRole ? [ctx.member.testRole] : [])]);
  const out: Record<string, Record<string, boolean>> = {};
  for (const [capability, byRole] of Object.entries(value as PermissionMatrix)) {
    if (!byRole || typeof byRole !== 'object') continue;
    const kept: Record<string, boolean> = {};
    for (const [role, allowed] of Object.entries(byRole)) {
      if (visible.has(role)) kept[role] = allowed;
    }
    out[capability] = kept;
  }
  return out;
}
