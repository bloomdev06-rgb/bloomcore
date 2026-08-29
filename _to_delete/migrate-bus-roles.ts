// Migration §27 — séparation du DÉPARTEMENT Bloom Bus et du MODULE Bloom Bus.
//
// Avant : un seul emplacement, `member.departments['<dept bloom_bus>']`, mélangeait deux
// vocabulaires sans rapport — les fonctions du DÉPARTEMENT (responsable, adjoint, trésorier,
// responsable_section, membre) et les fonctions territoriales du MODULE (capitaine,
// responsable_zone, responsable_commune). Conséquence directe : nommer quelqu'un capitaine
// effaçait sa fonction dans le département, et l'inverse.
//
// Après : les fonctions territoriales vivent dans `member.busRole`, l'emplacement département
// ne contient plus que de vraies fonctions de département. Les deux coexistent.
//
// Ce que fait la migration, membre par membre :
//   - valeur territoriale dans un département bloom_bus → recopiée dans `busRole`, puis
//     l'entrée de département est RETIRÉE. Décision de l'utilisateur : « s'il n'ont pas de
//     fonction propre au département, ils sont sortis de la liste des membres du département ».
//   - valeur de vraie fonction de département (responsable, adjoint, …) → laissée intacte.
//     Le responsable du département reste le plus haut responsable du module par le pont
//     implémenté dans bloomBusRoleOf, sans avoir besoin d'un busRole.
//   - un membre cumulant plusieurs valeurs territoriales (deux instances de branche) garde la
//     PLUS HAUTE — jamais de rétrogradation silencieuse.
//   - un `busRole` déjà présent n'est jamais abaissé.
// Les clés correspondantes de deptBranches / deptSections sont nettoyées en même temps, sinon
// elles resteraient à décrire une affectation qui n'existe plus.
//
// Usage (terminal du conteneur backend, depuis /app) :
//   npx tsx scripts/migrate-bus-roles.ts                     # simulation, n'écrit rien
//   MIGRATE_CONFIRM=OUI npx tsx scripts/migrate-bus-roles.ts
import 'dotenv/config';
import { getCollection, setCollection } from '../server/datastore.ts';

const confirmed = process.env.MIGRATE_CONFIRM === 'OUI';

// Du plus fort au plus faible : sert à choisir en cas de cumul.
const TERRITORIAL = ['responsable_commune', 'responsable_zone', 'capitaine'] as const;
type Territorial = typeof TERRITORIAL[number];
// Fiches d'avant la migration M5 : la fonction y est écrite sous son NOM DE RÔLE.
const ALIAS: Record<string, Territorial> = {
  'Capitaine de Bus': 'capitaine',
  'Responsable de Zone': 'responsable_zone',
  'Responsable de Commune': 'responsable_commune',
};
const territorial = (v: unknown): Territorial | undefined => {
  const s = String(v ?? '');
  return (TERRITORIAL as readonly string[]).includes(s) ? (s as Territorial) : ALIAS[s];
};
const rank = (v: string | undefined) => {
  const i = TERRITORIAL.indexOf(territorial(v) as Territorial);
  return i === -1 ? TERRITORIAL.length : i; // absent = plus bas
};
const stronger = (a: string | undefined, b: string | undefined) => (rank(a) <= rank(b) ? a : b);

async function main() {
  const members = await getCollection('members');
  const departments = (await getCollection('departments')).filter((d: any) => !d.deletedAt);
  const busDeptIds = new Set(
    departments.filter((d: any) => d.specialFunction === 'bloom_bus').map((d: any) => String(d.id)),
  );

  console.log(`\nDépartements « bloom_bus » : ${busDeptIds.size}`);
  for (const id of busDeptIds) {
    const d: any = departments.find((x: any) => String(x.id) === id);
    console.log(`   - ${d.name} (${id}) branche=${d.branch ?? 'aucune'}`);
  }
  if (!busDeptIds.size) {
    console.log('\nAucun département Bloom Bus : rien à migrer.\n');
    return;
  }

  const now = new Date().toISOString();
  const changes: string[] = [];

  const migrated = members.map((m: any) => {
    if (m.deletedAt) return m;
    const depts: Record<string, string> = { ...(m.departments ?? {}) };
    let busRole: string | undefined = m.busRole;
    const retirees: string[] = [];

    for (const [deptId, fn] of Object.entries(depts)) {
      if (!busDeptIds.has(deptId)) continue;
      if (rank(fn) === TERRITORIAL.length) continue; // vraie fonction de département : intacte
      busRole = territorial(stronger(busRole, fn));
      delete depts[deptId];
      retirees.push(`${deptId}=${fn}`);
    }
    if (!retirees.length && busRole === m.busRole) return m;

    const deptBranches = { ...(m.deptBranches ?? {}) };
    const deptSections = { ...(m.deptSections ?? {}) };
    for (const entry of retirees) {
      const id = entry.split('=')[0];
      delete deptBranches[id];
      delete deptSections[id];
    }

    // Le membre garde-t-il une place dans le département après migration ?
    const resteAuDept = Object.keys(depts).some((id) => busDeptIds.has(id));
    changes.push(
      `   - ${m.firstName} ${m.lastName} (${m.id}) : ${retirees.join(', ')} → busRole=${busRole}`
      + (resteAuDept ? ' [reste membre du département]' : ' [sort de la liste du département]'),
    );

    return {
      ...m,
      departments: depts,
      deptBranches: Object.keys(deptBranches).length ? deptBranches : undefined,
      deptSections: Object.keys(deptSections).length ? deptSections : undefined,
      busRole,
      updatedAt: now,
    };
  });

  console.log(`\nMembres à migrer : ${changes.length}`);
  for (const line of changes) console.log(line);

  // Contrôle : personne ne doit perdre son accès au module. Un membre qui avait une valeur
  // territoriale et ressort sans busRole serait une régression.
  const perdus = members.filter((m: any) => {
    if (m.deletedAt) return false;
    const avait = Object.entries(m.departments ?? {})
      .some(([id, fn]) => busDeptIds.has(id) && rank(fn as string) < TERRITORIAL.length);
    const apres: any = migrated.find((x: any) => x.id === m.id);
    return avait && !apres?.busRole;
  });
  if (perdus.length) {
    console.error(`\n⚠ ${perdus.length} membre(s) perdraient leur fonction Bloom Bus. Rien n'a été écrit.`);
    process.exit(1);
  }

  if (!changes.length) {
    console.log('\nRien à migrer : aucune fonction territoriale stockée côté département.\n');
    return;
  }
  if (!confirmed) {
    console.log('\nSIMULATION — rien n\'a été écrit. Pour exécuter réellement :');
    console.log('  MIGRATE_CONFIRM=OUI npx tsx scripts/migrate-bus-roles.ts\n');
    return;
  }

  await setCollection('members', migrated);
  console.log(`\nFait : ${changes.length} membre(s) migré(s).`);
  console.log('Vérifie avec : MEMBER=<téléphone> npx tsx scripts/diag-roles.ts\n');
}

await main();
