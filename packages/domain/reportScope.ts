import type { BloomBusEntity, Department, Member, Ministry, Report } from './types.ts';
import { departmentAuthority } from './authorization.ts';
import { canAssignBusRole, busInScope, CROSS_BRANCH_ROLES, effectiveBranchFor } from './scope.ts';

/** The report's origin determines access, never another affiliation of its subject. */
export function canReadScopedReport(operator: Member, roles: Iterable<string>, report: Report,
  members: Member[], departments: Department[], ministries: Ministry[], buses: BloomBusEntity[]): boolean {
  const held = [...roles];
  if (held.some(r => CROSS_BRANCH_ROLES.includes(r))) return true;
  const subject = members.find(m => m.id === report.content?.memberId);
  const department = departments.find(d => d.id === report.departmentId);
  const isBus = department?.specialFunction === 'bloom_bus' || report.reportType?.startsWith('rapport_bloom_bus');
  const bus = buses.find(b => b.id === (report.content?.busId ?? (isBus ? subject?.bloomBusId : undefined)));
  const branch = report.targetBranch ?? bus?.branch
    ?? (subject && report.departmentId ? effectiveBranchFor(subject, report.departmentId) : subject?.branch)
    ?? department?.branch;
  if (!branch || branch === 'global') return false;
  if (isBus && (!bus?.branch || bus.branch !== branch || (subject && subject.branch !== bus.branch))) return false;
  if (held.includes('Pasteur') && operator.branch === branch) return true;
  if (isBus) {
    const tutored = departments.some(d => d.specialFunction === 'bloom_bus'
      && departmentAuthority(operator, held, d.id, branch, departments, ministries) === 'Ministre');
    if (tutored) return true;
    if (!bus) return false;
    if ((report.authorId === operator.id || subject?.id === operator.id)
      && held.some(role => busInScope(operator, { ...bus, branch }, role, buses, departments))) return true;
    return canAssignBusRole(operator, held, { ...(subject ?? operator), branch, bloomBusId: bus.id },
      'Membre', buses.map(b => b.id === bus.id ? { ...b, branch } : b), departments, ministries);
  }
  if (report.departmentId) {
    if (department?.branch && department.branch !== branch) return false;
    if (subject && (!subject.departments?.[report.departmentId] || effectiveBranchFor(subject, report.departmentId) !== branch)) return false;
    const authority = departmentAuthority(operator, held, report.departmentId, branch, departments, ministries);
    if (authority === 'Responsable de section') return !!report.sectionId
      && report.sectionId === operator.deptSections?.[report.departmentId];
    if (authority) return true;
    // Authors retain their own reports only while attached to their origin scope.
    return report.authorId === operator.id && !!operator.departments?.[report.departmentId]
      && effectiveBranchFor(operator, report.departmentId) === branch;
  }
  if (report.authorId === operator.id && operator.branch === branch) return true;
  return !!subject && subject.branch === branch && operator.branch === branch
    && subject.mentorId === operator.id && held.some(r => ['Coach', 'Leader'].includes(r))
    && ['rapport_suivi_coach', 'rapport_pastoral'].includes(report.reportType ?? '');
}
