import type { BloomBusEntity, ImportBatch, ImportBusMemberState, Member } from '../packages/domain/types.ts';
import { canonical } from './guards.ts';

export function busMemberState(member: Member, departmentId: string): ImportBusMemberState {
  return {
    bloomBusId: member.bloomBusId ?? null,
    busRole: member.busRole ?? null,
    busRoles: member.busRoles ? [...member.busRoles] : null,
    busDepartmentFunction: member.departments?.[departmentId] ?? null,
  };
}

export function sameBusMemberState(member: Member, departmentId: string, expected: ImportBusMemberState): boolean {
  return canonical(busMemberState(member, departmentId)) === canonical(expected);
}

export function restoreBusMemberState(member: Member, departmentId: string, state: ImportBusMemberState): Member {
  const departments = { ...(member.departments ?? {}) };
  if (state.busDepartmentFunction === null) delete departments[departmentId];
  else departments[departmentId] = state.busDepartmentFunction;

  const restored: Member = { ...member, departments };
  if (state.bloomBusId === null) delete restored.bloomBusId;
  else restored.bloomBusId = state.bloomBusId;
  if (state.busRole === null) delete restored.busRole;
  else restored.busRole = state.busRole;
  if (state.busRoles === null) delete restored.busRoles;
  else restored.busRoles = [...state.busRoles];
  return restored;
}

export function unchangedSinceImport(item: Member | BloomBusEntity, importedUpdatedAt: string): boolean {
  return typeof (item as any).updatedAt === 'string' && (item as any).updatedAt === importedUpdatedAt;
}

export function importedBusHasRemainingMembers(busId: string, currentMembers: Member[], restoredMembers: Member[]): boolean {
  const restoredById = new Map(restoredMembers.map(member => [member.id, member]));
  return currentMembers.some(member => {
    if (member.bloomBusId !== busId) return false;
    const restored = restoredById.get(member.id);
    return !restored || restored.bloomBusId === busId;
  });
}

export function canAccessImportBatch(
  ctx: { member: { id: string }; roles: string[] },
  batch: Pick<ImportBatch, 'createdById'>,
): boolean {
  return batch.createdById === ctx.member.id || ctx.roles.includes('Admin') || ctx.roles.includes('Super Admin');
}
