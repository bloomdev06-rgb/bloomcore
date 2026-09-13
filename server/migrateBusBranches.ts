import { getCollection, mergeCollection } from './datastore.ts';
import { inferBusBranches } from '../packages/domain/busBranch.ts';

export async function runBusBranchMigration(): Promise<void> {
  const result = inferBusBranches(await getCollection('bus_lines'), await getCollection('members'));
  if (result.migratedIds.length) {
    const ids = new Set(result.migratedIds);
    await mergeCollection('bus_lines', result.buses.filter(b => ids.has(b.id)).map(b => ({ ...b, updatedAt: new Date().toISOString() })));
    console.info(`[busBranch] ${ids.size} bus rattaché(s) à la branche unique de leurs membres.`);
  }
  if (result.unresolvedIds.length) console.warn(`[busBranch] ${result.unresolvedIds.length} bus à régulariser (vides ou branches incohérentes), aucun membre déplacé.`);
}
