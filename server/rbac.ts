// RBAC serveur — rôles RÉELS dérivés des données (jamais du `simulatedRole` UI,
// qui n'est qu'un commutateur de démo côté client). Réutilise les modules purs
// du frontend (permissions.ts, scope.ts) pour que client et serveur ne puissent
// pas diverger sur la sémantique des capacités et du scope.
import { Member, Ministry, PermissionMatrix, Delegation, AdminAccount, Department, BloomBusEntity, SpecialAuthorization } from '../src/types.ts';
import { hasCapability } from '../src/data/permissions.ts';
import { inMemberScope, canFillReportFor, bloomBusRoleOf, MULTI_BRANCH_ROLES } from '../src/data/scope.ts';
import { isBusReportLocked } from '../src/data/reportLock.ts';
import { getKv } from './db.ts';
import { GuardError, readCollection, canonical } from './guards.ts';

const PASTORAL_ROLES = ['Pasteur Titulaire', 'Pasteur Assistant', 'Assistant Pasteur'];
const FULL_SCOPE_ROLES = ['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'];
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

export function resolveRoles(member: Member, admins: AdminAccount[], ministries: Ministry[]): string[] {
  const roles = new Set<string>();
  // Convention adm_<memberId> (types.ts) ; l'id nu est toléré par robustesse.
  const adminEntry = admins.find(
    (a) => !(a as any).deletedAt && (a.id === `adm_${member.id}` || a.id === member.id),
  );
  if (adminEntry) roles.add(adminEntry.role);
  if (PASTORAL_ROLES.includes(member.pastoralCursus)) roles.add('Pasteur');
  if (ministries.some((m) => !(m as any).deletedAt && m.tuteurId === member.id)) roles.add('Ministre');
  for (const fn of Object.values(member.departments ?? {})) roles.add(String(fn));
  if (member.level === 'Coach' || member.level === 'Leader') roles.add(member.level);
  roles.add('Membre');
  return [...roles];
}

export interface RbacContext {
  member: Member;
  roles: string[];
}

// Construit le contexte pour un memberId authentifié — null si le membre a disparu.
export function buildContext(memberId: string): RbacContext | null {
  const member = readCollection('members').find((m: Member) => m.id === memberId);
  if (!member) return null;
  const admins = readCollection('admins') as AdminAccount[];
  const ministries = readCollection('ministries') as Ministry[];
  return { member, roles: resolveRoles(member, admins, ministries) };
}

const hasAny = (roles: string[], allowed: string[]) => roles.some((r) => allowed.includes(r));

// Capacité accordée si N'IMPORTE LEQUEL des rôles résolus la détient dans la
// matrice live (kv permissions), ou via une délégation ciblant l'opérateur.
function hasCapAnyRole(ctx: RbacContext, capability: string): boolean {
  const matrix = (getKv('permissions') ?? {}) as PermissionMatrix;
  const delegations = readCollection('delegations') as Delegation[];
  return ctx.roles.some((role) => hasCapability(matrix, capability, role, ctx.member.id, delegations));
}

// Items ajoutés ou modifiés par rapport au stocké (le scoping ne s'applique
// qu'à ce que l'opérateur touche réellement, pas au reste du whole-array).
function touchedItems(name: string, incoming: any[]): any[] {
  const stored = readCollection(name, true);
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
export function preservedIds(name: string, ctx: RbacContext): Set<string> {
  const stored = readCollection(name, true).filter((s: any) => !s.deletedAt);
  const visible = new Set(filterReadable(name, ctx, stored).map((s: any) => String(s.id)));
  return new Set(
    stored.filter((s: any) => !visible.has(String(s.id))).map((s: any) => String(s.id)),
  );
}

// Items vivants VISIBLES par l'opérateur mais absents du payload → suppressions
// intentionnelles, transformées en tombstone par applyWrite. Le scoping DOIT les couvrir
// (S3 — on ne supprime que dans son périmètre). Les items hors-portée sont exclus ici
// (préservés, cf. preservedIds) : un Capitaine renvoyant ses seuls membres ne tombstone
// plus — et n'est plus 403 par — le reste de l'église qu'il ne voit pas.
function removedItems(name: string, incoming: any[], ctx: RbacContext): any[] {
  const incomingIds = new Set(incoming.map((it) => String(it.id)));
  const preserve = preservedIds(name, ctx);
  return readCollection(name, true).filter(
    (s: any) => !s.deletedAt && !incomingIds.has(String(s.id)) && !preserve.has(String(s.id)),
  );
}

// Porte d'écriture par collection + scoping par item. Lève GuardError(403/400).
export function assertCanWrite(name: string, ctx: RbacContext, incoming: any[]): void {
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
        for (const s of touchedItems(name, incoming) as SpecialAuthorization[]) {
          if (s.memberId === member.id) throw new GuardError(403, 'special_authorizations: auto-octroi interdit');
        }
      }
      return;
    }

    case 'delegations': {
      if (!hasAny(roles, STAFF_ROLES)) throw new GuardError(403, 'delegations: réservé aux Responsables et plus');
      // Interdiction spec (§11.3) : le rapport spirituel Bloom Bus n'est jamais délégable.
      if (incoming.some((d: Delegation) => d.right === 'rapport_bloom_bus_member')) {
        throw new GuardError(400, 'delegations: rapport_bloom_bus_member est interdit de délégation');
      }
      return;
    }

    case 'members': {
      if (!hasCapAnyRole(ctx, 'view_members')) throw new GuardError(403, 'members: capacité view_members requise');
      if (hasAny(roles, FULL_SCOPE_ROLES)) return;
      // Symétrique de la lecture (filterReadable, fail-closed) : sans rôle de périmètre
      // déterminé, un opérateur n'écrit QUE sur sa propre fiche. Sinon inMemberScope ferait
      // du fail-open sur 'Membre' (scope.ts) → écriture sur n'importe quel membre.
      const scopeEntry = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r));
      const departments = readCollection('departments') as Department[];
      const ministries = readCollection('ministries') as Ministry[];
      // Bus lines LIVES (pas le seed figé) : un bus créé/déplacé change les zones/communes
      // servant au scoping Responsable de Zone/Commune.
      const busLines = readCollection('bus_lines') as BloomBusEntity[];
      // Écritures ET suppressions par omission : les deux doivent rester dans le périmètre.
      for (const target of [...touchedItems(name, incoming), ...removedItems(name, incoming, ctx)]) {
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
      const selfBefore = readCollection(name, true).find((s: any) => String(s.id) === String(member.id));
      if (selfBefore) {
        for (const item of touchedItems(name, incoming)) {
          if (String(item.id) !== String(member.id)) continue;
          for (const f of ['departments', 'level', 'pastoralCursus', 'bloomBusId', 'deptAttachmentStatus', 'deptAttachmentOrigin', 'testRole']) {
            if (canonical((item as any)[f]) !== canonical((selfBefore as any)[f])) {
              throw new GuardError(403, `members: champ privilégié '${f}' non modifiable sur votre propre fiche`);
            }
          }
        }
      }
      return;
    }

    case 'events':
    case 'activities':
    case 'departments':
    case 'ministries':
      if (!hasAny(roles, STAFF_ROLES)) throw new GuardError(403, `${name}: réservé aux Responsables et plus`);
      if (name === 'events' && !hasAny(roles, FULL_SCOPE_ROLES)) {
        for (const ev of [...touchedItems(name, incoming), ...removedItems(name, incoming, ctx)]) {
          if (ev.branch && ev.branch !== 'global' && member.branch && ev.branch !== member.branch) {
            throw new GuardError(403, `events: ${ev.id} appartient à l'autre branche`);
          }
        }
      }
      return;

    case 'reports': {
      if (!hasAny(roles, ABOVE_MEMBER_ROLES) && !hasCapAnyRole(ctx, 'rapport_service')) {
        throw new GuardError(403, 'reports: rôle serviteur ou délégation requis');
      }
      // Verrou 24h : un rapport Bloom Bus rempli et/ou validé n'est plus modifiable (ni
      // supprimable) 24h après le dernier de ces deux événements — pour TOUS les rôles,
      // admins compris (immuabilité des rapports déposés). Seul l'acte de validation
      // (validated/validatedAt) reste permis après coup : relecture, pas modification.
      {
        const oldById = new Map(readCollection('reports', true).map((s: any) => [String(s.id), s]));
        for (const r of touchedItems(name, incoming)) {
          const old = oldById.get(String(r.id));
          if (!old || old.deletedAt || !isBusReportLocked(old)) continue;
          const validationOnly = canonical({ ...old, validated: r.validated, validatedAt: r.validatedAt }) === canonical(r);
          if (!validationOnly) {
            throw new GuardError(403, `reports: ${r.id} verrouillé — rapport Bloom Bus non modifiable 24h après remplissage/validation`);
          }
        }
        for (const r of removedItems(name, incoming, ctx)) {
          if (isBusReportLocked(r)) {
            throw new GuardError(403, `reports: ${r.id} verrouillé — suppression impossible 24h après remplissage/validation`);
          }
        }
      }
      if (!hasAny(roles, FULL_SCOPE_ROLES)) {
        const scopeRole = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r))?.[1] ?? 'Membre';
        const allMembers = readCollection('members') as Member[];
        const busLines = readCollection('bus_lines') as BloomBusEntity[];
        const departments = readCollection('departments') as Department[];
        for (const r of [...touchedItems(name, incoming), ...removedItems(name, incoming, ctx)]) {
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

    case 'integration_reports':
    case 'certifications':
    case 'projects':
    case 'bus_lines':
      // Données opérationnelles (projets, lignes Bloom Bus) — écriture réservée à l'encadrement.
      if (!hasAny(roles, ABOVE_MEMBER_ROLES)) throw new GuardError(403, `${name}: rôle d'encadrement requis`);
      return;

    case 'audits': {
      // Journal inviolable : l'append-only vit dans guards.ts. Ici on empêche la
      // FORGE — un membre ne peut insérer que des entrées à son propre nom (S4).
      for (const a of touchedItems(name, incoming)) {
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
      for (const n of touchedItems(name, incoming)) {
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

// Porte de LECTURE (S2) : filtre une collection avant de la renvoyer au client, selon
// les rôles RÉELS. Le filtrage de confidentialité et de scope vivait uniquement côté
// client (rideau cosmétique) ; ici la donnée sensible n'est simplement plus envoyée.
export function filterReadable(name: string, ctx: RbacContext, items: any[]): any[] {
  const { roles, member } = ctx;
  const fullScope = hasAny(roles, FULL_SCOPE_ROLES);

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
      const suiviAuths = (readCollection('special_authorizations') as SpecialAuthorization[]).filter(
        (s) => !s.deletedAt && s.memberId === member.id && s.capability === CAP_VOIR_SUIVI_MEMBRE
          && (s.branchId == null || s.branchId === member.branch),
      );
      let suiviSubjectInScope: (memberId: string) => boolean = () => false;
      if (isCoach || suiviAuths.length) {
        const scopeEntry = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r));
        if (scopeEntry) {
          const byId = new Map((readCollection('members') as Member[]).map((m) => [m.id, m]));
          const departments = readCollection('departments') as Department[];
          const ministries = readCollection('ministries') as Ministry[];
          const busLines = readCollection('bus_lines') as BloomBusEntity[];
          suiviSubjectInScope = (mid) => {
            const subject = byId.get(mid);
            return !!subject && inMemberScope(member, subject, scopeEntry[1], busLines, departments, ministries);
          };
        }
      }
      let out = items.filter((r) => {
        if (!r.confidential) return true;
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
      const scopeEntry = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r));
      // Aucun rôle de périmètre (simple membre) : inMemberScope fait du fail-open,
      // donc on court-circuite ici — il ne voit que sa propre fiche.
      if (!scopeEntry) return items.filter((m) => m.id === member.id);
      const departments = readCollection('departments') as Department[];
      const ministries = readCollection('ministries') as Ministry[];
      const busLines = readCollection('bus_lines') as BloomBusEntity[];
      return items.filter((m) =>
        m.id === member.id ||
        inMemberScope(member, m as Member, scopeEntry[1], busLines, departments, ministries),
      );
    }

    case 'admins':
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
      return hasAny(roles, FULL_SCOPE_ROLES) ? items : [];

    default:
      // ministries, departments, activities, forms, settings : nécessaires au
      // fonctionnement de l'UI, entités transverses sans PII confidentielle par branche.
      return items;
  }
}
