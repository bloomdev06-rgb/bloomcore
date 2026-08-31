// Rôle effectif d'un membre pour l'UI — miroir frontend de server/rbac.ts:resolveRoles,
// réduit au rôle unique de plus haut privilège qu'attend `simulatedRole`/la matrice de
// permissions. En production, c'est CE rôle (dérivé du membre connecté) qui pilote l'app,
// pas le panneau de simulation (dev-only). Sans ça, tout le monde resterait « Pasteur ».
import { Member, AdminAccount, Ministry, Department } from '../types';
import { roleForDeptFn, roleForLevel } from '../../packages/shared/migrate';
import { departmentToolRoles } from '../../packages/domain/access';

// M5 : cursus snake_case §3 (comparés à member.pastoralCursus migré). Les NOMS de rôles
// (ROLE_PRIORITY, matrice) restent stables — on remappe la valeur stockée → nom de rôle.
const PASTORAL_CURSUS = ['pasteur_titulaire', 'pasteur_assistant', 'assistant_pasteur'];

// Du plus privilégié au moins privilégié. Le premier rôle détenu par le membre gagne.
const ROLE_PRIORITY = [
  'Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre',
  'Responsable', 'Adjoint', 'Trésorier', 'Coach', 'Leader',
  'Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune',
  'Responsable de section', 'ADN', 'Portier', 'GDC', 'Intégration', 'Baptême', 'Membre', 'Nouveau',
];

export function resolveMemberRoles(member: Member, admins: AdminAccount[] = [], ministries: Ministry[] = [], departments: Department[] = []): Set<string> {
  const roles = new Set<string>();
  const adminEntry = admins.find(
    (a) => !(a as any).deletedAt && (a.id === `adm_${member.id}` || a.id === member.id),
  );
  if (adminEntry) roles.add(adminEntry.role);
  if (PASTORAL_CURSUS.includes(member.pastoralCursus)) roles.add('Pasteur');
  if (ministries.some((m) => !(m as any).deletedAt && m.tuteurId === member.id)) roles.add('Ministre');
  for (const fn of Object.values(member.departments ?? {})) roles.add(roleForDeptFn(fn));
  for (const role of departmentToolRoles(member, departments, ministries)) roles.add(role);
  // Fonction du MODULE Bloom Bus : elle ne vit plus dans `departments` depuis la
  // séparation §27, mais elle donne toujours le rôle correspondant (Capitaine de Bus,
  // Responsable de Zone/Commune) — sans quoi le membre perdrait son périmètre territorial.
  if (member.busRole) roles.add(roleForDeptFn(member.busRole));
  for (const role of member.busRoles ?? []) roles.add(roleForDeptFn(role));
  if (member.level === 'coach' || member.level === 'leader') roles.add(roleForLevel(member.level));
  if (member.level === 'nouveau') roles.add('Nouveau');
  roles.add('Membre');
  return roles;
}

export function resolveMemberRole(member: Member | undefined, admins: AdminAccount[] = [], ministries: Ministry[] = [], departments: Department[] = []): string {
  if (!member) return 'Membre';
  const roles = resolveMemberRoles(member, admins, ministries, departments);
  return ROLE_PRIORITY.find((r) => roles.has(r)) ?? 'Membre';
}
