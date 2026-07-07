// RBAC serveur — rôles RÉELS dérivés des données (jamais du `simulatedRole` UI,
// qui n'est qu'un commutateur de démo côté client). Réutilise les modules purs
// du frontend (permissions.ts, scope.ts) pour que client et serveur ne puissent
// pas diverger sur la sémantique des capacités et du scope.
import { Member, Ministry, PermissionMatrix, Delegation, AdminAccount, Department } from '../src/types.ts';
import { hasCapability } from '../src/data/permissions.ts';
import { inMemberScope } from '../src/data/scope.ts';
import { INITIAL_BUS_LINES } from '../src/mockData.ts';
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
const SCOPE_ROLE_ORDER: [string, string][] = [
  ['Ministre', 'Ministre'],
  ['Capitaine de Bus', 'Capitaine'],
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

// Items vivants absents du payload → seront transformés en tombstone par applyWrite.
// Le scoping DOIT aussi les couvrir : sinon un opérateur supprime par omission des
// items hors de son périmètre (S3 — un Responsable envoie ses seuls membres et
// tombstone toute l'église). En usage normal le client renvoie le tableau complet,
// donc removedItems est vide et rien n'est bloqué.
function removedItems(name: string, incoming: any[]): any[] {
  const incomingIds = new Set(incoming.map((it) => String(it.id)));
  return readCollection(name, true).filter(
    (s: any) => !s.deletedAt && !incomingIds.has(String(s.id)),
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
      const scopeRole = SCOPE_ROLE_ORDER.find(([r]) => roles.includes(r))?.[1] ?? 'Membre';
      const departments = readCollection('departments') as Department[];
      const ministries = readCollection('ministries') as Ministry[];
      // Écritures ET suppressions par omission : les deux doivent rester dans le périmètre.
      for (const target of [...touchedItems(name, incoming), ...removedItems(name, incoming)]) {
        if (!inMemberScope(member, target as Member, scopeRole, INITIAL_BUS_LINES, departments, ministries)) {
          throw new GuardError(403, `members: ${target.id} hors de votre périmètre (${scopeRole})`);
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
        for (const ev of [...touchedItems(name, incoming), ...removedItems(name, incoming)]) {
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
      if (!hasAny(roles, FULL_SCOPE_ROLES)) {
        for (const r of [...touchedItems(name, incoming), ...removedItems(name, incoming)]) {
          if (r.targetBranch && r.targetBranch !== 'global' && member.branch && r.targetBranch !== member.branch) {
            throw new GuardError(403, `reports: ${r.id} appartient à l'autre branche`);
          }
        }
      }
      return;
    }

    case 'integration_reports':
    case 'certifications':
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
      // §8.3 — miroir exact du filtre client (ReportsView) : le corps pastoral voit
      // les rapports confidentiels ; un Coach/Responsable seulement si explicitement
      // partagé. La confidentialité prime même sur Admin/Super Admin.
      const pastoralCorps = hasAny(roles, ['Pasteur', 'Pasteur Principal', 'Ministre']);
      let out = items.filter((r) => {
        if (!r.confidential) return true;
        if (pastoralCorps) return true;
        return hasAny(roles, ['Coach', 'Responsable']) && !!r.partagerAvecResponsableDept;
      });
      // Hors corps à périmètre global, on ne renvoie que la branche de l'opérateur.
      if (!fullScope && member.branch) {
        out = out.filter((r) => !r.targetBranch || r.targetBranch === 'global' || r.targetBranch === member.branch);
      }
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
      return items.filter((m) =>
        m.id === member.id ||
        inMemberScope(member, m as Member, scopeEntry[1], INITIAL_BUS_LINES, departments, ministries),
      );
    }

    case 'admins':
    case 'delegations':
    case 'certifications':
    case 'integration_reports':
      // Données d'encadrement — invisibles au simple membre.
      return hasAny(roles, ABOVE_MEMBER_ROLES) ? items : [];

    default:
      // events, ministries, departments, activities, forms, settings, notifications,
      // audits : nécessaires au fonctionnement de l'UI, pas de PII confidentielle ici.
      return items;
  }
}
