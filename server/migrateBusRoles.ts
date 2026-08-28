// Migration §27 — séparation du DÉPARTEMENT Bloom Bus et du MODULE Bloom Bus.
//
// Avant : un seul emplacement, `member.departments['<dept bloom_bus>']`, mélangeait deux
// vocabulaires sans rapport — les fonctions du DÉPARTEMENT (responsable, adjoint, trésorier,
// responsable_section, membre) et les fonctions territoriales du MODULE (capitaine,
// responsable_zone, responsable_commune). Conséquence directe : nommer quelqu'un capitaine
// effaçait sa fonction dans le département, et l'inverse — le cumul était impossible.
//
// Après : les fonctions territoriales vivent dans `member.busRole`, l'emplacement département
// ne contient plus que de vraies fonctions de département. Les deux coexistent.
//
// Règles, membre par membre :
//   - valeur territoriale dans un département bloom_bus → recopiée dans `busRole`, puis
//     l'entrée de département est RETIRÉE. Décision : « s'ils n'ont pas de fonction propre au
//     département, ils sortent de la liste de ses membres ».
//   - vraie fonction de département (responsable, adjoint, …) → laissée intacte. Le responsable
//     du département reste le plus haut responsable du module par le pont de bloomBusRoleOf.
//   - cumul de plusieurs valeurs territoriales (deux instances de branche) → la PLUS HAUTE.
//   - un `busRole` déjà présent n'est jamais abaissé.
// Les clés correspondantes de deptBranches / deptSections sont nettoyées, sinon elles
// décriraient une affectation qui n'existe plus.
//
// Exécutée AU DÉMARRAGE du serveur (server/index.ts) : idempotente, no-op dès le second
// passage. Tant qu'elle n'est pas passée, un membre ne peut pas cumuler une fonction de
// département et une fonction territoriale — d'où l'automatisation, plutôt qu'une commande
// manuelle qu'il faudrait penser à lancer.
import { getCollection, setCollection } from './datastore.ts';

// Du plus fort au plus faible : sert à choisir en cas de cumul.
export const TERRITORIAL = ['responsable_commune', 'responsable_zone', 'capitaine'] as const;
export type Territorial = typeof TERRITORIAL[number];

// Fiches d'avant la migration M5 : la fonction y est écrite sous son NOM DE RÔLE.
const ALIAS: Record<string, Territorial> = {
  'Capitaine de Bus': 'capitaine',
  'Responsable de Zone': 'responsable_zone',
  'Responsable de Commune': 'responsable_commune',
};

export const territorial = (v: unknown): Territorial | undefined => {
  const s = String(v ?? '');
  return (TERRITORIAL as readonly string[]).includes(s) ? (s as Territorial) : ALIAS[s];
};
const rank = (v: unknown) => {
  const i = TERRITORIAL.indexOf(territorial(v) as Territorial);
  return i === -1 ? TERRITORIAL.length : i; // absent = plus bas
};
const stronger = (a: unknown, b: unknown) => (rank(a) <= rank(b) ? a : b);

export interface BusRoleMigrationResult {
  busDepartments: { id: string; name: string; branch?: string }[];
  changes: {
    id: string; name: string; from: string[]; to: Territorial | undefined; staysInDepartment: boolean;
  }[];
  members: any[];      // collection complète, migrée (identique à l'entrée si aucun changement)
  wouldLose: string[]; // ids qui perdraient leur fonction — le contrôle de sûreté
  applied: boolean;
}

// Calcule la migration, et l'écrit si `apply`. Ne lève jamais : le démarrage du serveur ne doit
// pas dépendre d'elle. Le contrôle `wouldLose` bloque l'écriture plutôt que de dégrader.
export async function migrateBusRoles(apply = false): Promise<BusRoleMigrationResult> {
  const members = await getCollection('members');
  const departments = (await getCollection('departments')).filter((d: any) => !d.deletedAt);
  const busDepts = departments.filter((d: any) => d.specialFunction === 'bloom_bus');
  const busDeptIds = new Set(busDepts.map((d: any) => String(d.id)));

  const result: BusRoleMigrationResult = {
    busDepartments: busDepts.map((d: any) => ({ id: String(d.id), name: d.name, branch: d.branch })),
    changes: [], members, wouldLose: [], applied: false,
  };
  if (!busDeptIds.size) return result;

  const now = new Date().toISOString();
  const migrated = members.map((m: any) => {
    if (m.deletedAt) return m;
    const depts: Record<string, string> = { ...(m.departments ?? {}) };
    let busRole: unknown = m.busRole;
    const from: string[] = [];

    for (const [deptId, fn] of Object.entries(depts)) {
      if (!busDeptIds.has(deptId)) continue;
      if (rank(fn) === TERRITORIAL.length) continue; // vraie fonction de département : intacte
      busRole = stronger(busRole, fn);
      delete depts[deptId];
      from.push(`${deptId}=${fn}`);
    }
    if (!from.length && busRole === m.busRole) return m;

    const deptBranches = { ...(m.deptBranches ?? {}) };
    const deptSections = { ...(m.deptSections ?? {}) };
    for (const entry of from) {
      const id = entry.split('=')[0];
      delete deptBranches[id];
      delete deptSections[id];
    }

    result.changes.push({
      id: String(m.id),
      name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
      from,
      to: territorial(busRole),
      staysInDepartment: Object.keys(depts).some((id) => busDeptIds.has(id)),
    });

    return {
      ...m,
      departments: depts,
      deptBranches: Object.keys(deptBranches).length ? deptBranches : undefined,
      deptSections: Object.keys(deptSections).length ? deptSections : undefined,
      busRole: territorial(busRole),
      updatedAt: now,
    };
  });

  // Sûreté : personne ne doit ressortir sans la fonction qu'il avait.
  result.wouldLose = members.filter((m: any) => {
    if (m.deletedAt) return false;
    const avait = Object.entries(m.departments ?? {})
      .some(([id, fn]) => busDeptIds.has(id) && rank(fn) < TERRITORIAL.length);
    return avait && !migrated.find((x: any) => x.id === m.id)?.busRole;
  }).map((m: any) => String(m.id));

  result.members = migrated;
  if (apply && result.changes.length && !result.wouldLose.length) {
    await setCollection('members', migrated);
    result.applied = true;
  }
  return result;
}

// Appelée au démarrage. Silencieuse quand il n'y a rien à faire — le cas de tous les
// démarrages suivants.
export async function runBusRoleMigration(): Promise<void> {
  try {
    const r = await migrateBusRoles(true);
    if (r.wouldLose.length) {
      console.error(`[busRole] migration NON appliquée : ${r.wouldLose.length} membre(s) perdraient leur fonction Bloom Bus (${r.wouldLose.join(', ')}).`);
      return;
    }
    if (!r.applied) return;
    console.log(`[busRole] ${r.changes.length} membre(s) migré(s) vers le champ dédié :`);
    for (const c of r.changes) {
      console.log(`  - ${c.name} (${c.id}) ${c.from.join(', ')} → busRole=${c.to}`
        + (c.staysInDepartment ? ' [reste au département]' : ' [sort du département]'));
    }
  } catch (e) {
    // Une migration ratée ne doit pas empêcher le serveur de démarrer : les anciennes valeurs
    // restent lues par bloomBusRoleOf (compatibilité), l'application fonctionne.
    console.error('[busRole] migration ignorée :', (e as Error).message);
  }
}
