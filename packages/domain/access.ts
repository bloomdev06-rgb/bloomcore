import type { Department, Member, Ministry, Project } from './types.ts';

export const DEPARTMENT_TOOL_ROLE: Partial<Record<NonNullable<Department['specialFunction']>, string>> = {
  adn: 'ADN',
  portiers: 'Portier',
  gestion_cultes: 'GDC',
  integration: 'Intégration',
  bapteme: 'Baptême',
};

export function departmentToolRoles(
  member: Member,
  departments: Department[],
  ministries: Ministry[] = [],
): Set<string> {
  const roles = new Set<string>();
  const directIds = new Set(Object.keys(member.departments ?? {}));
  const tutoredMinistries = new Set(
    ministries.filter(m => !(m as Ministry & { deletedAt?: string }).deletedAt && m.tuteurId === member.id).map(m => m.id),
  );
  for (const department of departments) {
    if ((department as Department & { deletedAt?: string }).deletedAt) continue;
    const direct = directIds.has(department.id);
    const tutored = tutoredMinistries.has(department.ministryId)
      && (!department.branch || department.branch === member.branch);
    if (!direct && !tutored) continue;
    const role = department.specialFunction && DEPARTMENT_TOOL_ROLE[department.specialFunction];
    if (role) roles.add(role);
  }
  return roles;
}

export function memberCanReadProject(memberId: string, project: Project): boolean {
  return project.pmoId === memberId || !!project.team?.some(person => person.memberId === memberId);
}
