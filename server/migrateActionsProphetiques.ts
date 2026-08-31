import { getCollection, setCollection } from './datastore.ts';

const CANONICAL = {
  church: 'dept_actions_prophetiques_church',
  light: 'dept_actions_prophetiques_light',
} as const;
const FAMILY_ID = 'fam_actions_prophetiques';
const OLD_IDS = new Set(['dept_mres', 'dept_intercession']);
const rank: Record<string, number> = { responsable: 0, adjoint: 1, tresorier: 2, responsable_section: 3, membre: 4 };

const branchOf = (value: unknown): 'church' | 'light' => value === 'light' ? 'light' : 'church';
const stronger = (a: unknown, b: unknown): string => (rank[String(a)] ?? 99) <= (rank[String(b)] ?? 99) ? String(a) : String(b);

/** Idempotent migration of the two historical departments into one family. */
export async function runActionsProphetiquesMigration(): Promise<void> {
  try {
    const departments = await getCollection('departments') as any[];
    const old = departments.filter(d => OLD_IDS.has(String(d.id)) && !d.deletedAt);
    if (!old.length && departments.some(d => d.id === CANONICAL.church || d.id === CANONICAL.light)) return;
    const ministryId = old[0]?.ministryId ?? 'min_intimite';
    const base = old[0] ?? { type: 'normal', description: '' };
    const canonical = [
      { id: CANONICAL.church, name: 'Actions prophétiques', type: base.type ?? 'normal', ministryId, description: base.description ?? '', branch: 'church', familyId: FAMILY_ID },
      { id: CANONICAL.light, name: 'Actions prophétiques', type: base.type ?? 'normal', ministryId, description: base.description ?? '', branch: 'light', familyId: FAMILY_ID },
    ];
    const nextDepartments = departments
      .filter(d => !OLD_IDS.has(String(d.id)))
      .concat(canonical.filter(c => !departments.some(d => d.id === c.id)));
    const members = await getCollection('members') as any[];
    const nextMembers = members.map(m => {
      const entries = Object.entries(m.departments ?? {}) as [string, string][];
      const matching = entries.filter(([id]) => OLD_IDS.has(id));
      if (!matching.length) return m;
      const rest = Object.fromEntries(entries.filter(([id]) => !OLD_IDS.has(id)));
      const target = CANONICAL[branchOf(m.branch)];
      rest[target] = matching.map(([, fn]) => fn).reduce((a, b) => stronger(a, b));
      return { ...m, departments: rest, updatedAt: new Date().toISOString() };
    });
    const remapCollection = async (name: string) => {
      const rows = await getCollection(name) as any[];
      let changed = false;
      const mapped = rows.map(row => {
        if (!OLD_IDS.has(String(row.departmentId)) && !OLD_IDS.has(String(row.organizer))) return row;
        changed = true;
        const branch = branchOf(row.branch ?? row.targetBranch);
        const target = CANONICAL[branch];
        return {
          ...row,
          ...(OLD_IDS.has(String(row.departmentId)) ? { departmentId: target } : {}),
          ...(OLD_IDS.has(String(row.organizer)) ? { organizer: target } : {}),
          updatedAt: new Date().toISOString(),
        };
      });
      if (changed) await setCollection(name, mapped);
    };
    await setCollection('departments', nextDepartments);
    await setCollection('members', nextMembers);
    await remapCollection('activities');
    await remapCollection('reports');
    await remapCollection('events');
    await setCollection('departments', nextDepartments.concat(old.map(d => ({ ...d, deletedAt: new Date().toISOString() }))));
    console.log(`[actions-prophetiques] migration appliquée : ${matchingCount(members, old)} membre(s), ${old.length} ancien(s) département(s).`);
  } catch (e) {
    console.error('[actions-prophetiques] migration non appliquée:', e instanceof Error ? e.message : e);
  }
}

function matchingCount(members: any[], old: any[]): number {
  const ids = new Set(old.map(d => String(d.id)));
  return members.filter(m => Object.keys(m.departments ?? {}).some(id => ids.has(id))).length;
}
