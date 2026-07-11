// Rôle effectif d'un membre pour l'UI — miroir frontend de server/rbac.ts:resolveRoles,
// réduit au rôle unique de plus haut privilège qu'attend `simulatedRole`/la matrice de
// permissions. En production, c'est CE rôle (dérivé du membre connecté) qui pilote l'app,
// pas le panneau de simulation (dev-only). Sans ça, tout le monde resterait « Pasteur ».
import { Member, AdminAccount, Ministry } from '../types';

const PASTORAL_CURSUS = ['Pasteur Titulaire', 'Pasteur Assistant', 'Assistant Pasteur'];

// Du plus privilégié au moins privilégié. Le premier rôle détenu par le membre gagne.
const ROLE_PRIORITY = [
  'Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre',
  'Responsable', 'Adjoint', 'Trésorier', 'Coach', 'Leader',
  'Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune',
  'Responsable de section', 'Membre', 'Nouveau',
];

export function resolveMemberRoles(member: Member, admins: AdminAccount[] = [], ministries: Ministry[] = []): Set<string> {
  const roles = new Set<string>();
  const adminEntry = admins.find(
    (a) => !(a as any).deletedAt && (a.id === `adm_${member.id}` || a.id === member.id),
  );
  if (adminEntry) roles.add(adminEntry.role);
  if (PASTORAL_CURSUS.includes(member.pastoralCursus)) roles.add('Pasteur');
  if (ministries.some((m) => !(m as any).deletedAt && m.tuteurId === member.id)) roles.add('Ministre');
  for (const fn of Object.values(member.departments ?? {})) roles.add(String(fn));
  if (member.level === 'Coach' || member.level === 'Leader') roles.add(member.level);
  if (member.level === 'Nouveau') roles.add('Nouveau');
  roles.add('Membre');
  return roles;
}

export function resolveMemberRole(member: Member | undefined, admins: AdminAccount[] = [], ministries: Ministry[] = []): string {
  if (!member) return 'Membre';
  const roles = resolveMemberRoles(member, admins, ministries);
  return ROLE_PRIORITY.find((r) => roles.has(r)) ?? 'Membre';
}
