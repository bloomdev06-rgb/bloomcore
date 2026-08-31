import { getCollection, setCollection } from './datastore.ts';

const CANONICAL = 'dept_actions_prophetiques';
// Inclut les deux ids de la première version de migration : le correctif converge aussi
// les déploiements qui ont déjà créé une fiche Church et une fiche Light.
const OLD_IDS = new Set([
  'dept_mres', 'dept_intercession',
  'dept_actions_prophetiques_church', 'dept_actions_prophetiques_light',
]);
const rank: Record<string, number> = { responsable: 0, adjoint: 1, tresorier: 2, responsable_section: 3, membre: 4 };

const stronger = (a: unknown, b: unknown): string => (rank[String(a)] ?? 99) <= (rank[String(b)] ?? 99) ? String(a) : String(b);

/** Idempotent migration of historical departments into one shared department. */
export async function runActionsProphetiquesMigration(): Promise<void> {
  try {
    const departments = await getCollection('departments') as any[];
    const old = departments.filter(d => OLD_IDS.has(String(d.id)) && !d.deletedAt);
    if (!old.length && departments.some(d => d.id === CANONICAL && !d.deletedAt)) return;
    const ministryId = old[0]?.ministryId ?? 'min_intimite';
    const base = old[0] ?? { type: 'normal', description: '' };
    const canonical = { id: CANONICAL, name: 'Actions prophétiques', type: base.type ?? 'normal', ministryId, description: base.description ?? '' };
    const nextDepartments = departments
      .filter(d => !OLD_IDS.has(String(d.id)))
      .concat(departments.some(d => d.id === CANONICAL && !d.deletedAt) ? [] : [canonical]);
    const members = await getCollection('members') as any[];
    const nextMembers = members.map(m => {
      const entries = Object.entries(m.departments ?? {}) as [string, string][];
      const matching = entries.filter(([id]) => OLD_IDS.has(id));
      if (!matching.length) return m;
      const rest = Object.fromEntries(entries.filter(([id]) => !OLD_IDS.has(id)));
      rest[CANONICAL] = [rest[CANONICAL], ...matching.map(([, fn]) => fn)]
        .filter(Boolean)
        .reduce((a, b) => stronger(a, b));
      return { ...m, departments: rest, updatedAt: new Date().toISOString() };
    });
    const remapCollection = async (name: string) => {
      const rows = await getCollection(name) as any[];
      let changed = false;
      const mapped = rows.map(row => {
        if (!OLD_IDS.has(String(row.departmentId)) && !OLD_IDS.has(String(row.organizer))) return row;
        changed = true;
        return {
          ...row,
          ...(OLD_IDS.has(String(row.departmentId)) ? { departmentId: CANONICAL } : {}),
          ...(OLD_IDS.has(String(row.organizer)) ? { organizer: CANONICAL } : {}),
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
