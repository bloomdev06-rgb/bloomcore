import type { BloomBusEntity, Member } from './types.ts';

export const isBusBranch = (value: unknown): value is 'church' | 'light' => value === 'church' || value === 'light';

// Never choose a majority, overwrite a declared branch, or reassign a member.
export function inferBusBranches(buses: BloomBusEntity[], members: (Member & { deletedAt?: string })[]) {
  const migratedIds: string[] = [];
  const unresolvedIds: string[] = [];
  const result = buses.map(bus => {
    if ((bus as BloomBusEntity & { deletedAt?: string }).deletedAt) return bus;
    const occupants = members.filter(m => !m.deletedAt && m.bloomBusId === bus.id);
    const branches = new Set(occupants.map(m => m.branch));
    if (isBusBranch(bus.branch)) {
      if (occupants.some(m => m.branch !== bus.branch)) unresolvedIds.push(bus.id);
      return bus;
    }
    if (branches.size === 1) {
      const branch = [...branches][0];
      if (isBusBranch(branch)) { migratedIds.push(bus.id); return { ...bus, branch }; }
    }
    unresolvedIds.push(bus.id);
    return bus;
  });
  return { buses: result, migratedIds, unresolvedIds };
}
