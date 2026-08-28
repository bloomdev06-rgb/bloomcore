// Diagnostic LECTURE SEULE des affectations de département et des rôles dérivés.
// N'écrit rien, jamais — à lancer sans crainte en production.
//
// Sert à répondre à trois questions sur un cas signalé (« promu responsable d'un département,
// reconnu responsable d'un autre ») :
//   1. qu'est-ce qui est RÉELLEMENT stocké pour ce membre ;
//   2. le même défaut touche-t-il d'autres membres ;
//   3. la structure des départements peut-elle induire la résolution en erreur.
//
// Usage (terminal du conteneur backend, depuis /app) :
//   MEMBER=0757027083 npx tsx scripts/diag-roles.ts      # un membre (téléphone, email ou id)
//   npx tsx scripts/diag-roles.ts                        # balayage global uniquement
import 'dotenv/config';
import { getCollection } from '../server/datastore.ts';
import { bloomBusRoleOf, rankOf, dashboardScope } from '../packages/domain/scope.ts';
import { resolveRoles } from '../server/rbac.ts';

// Même ordre de priorité que src/data/roles.ts : le rôle unique retenu par l'interface.
const ROLE_PRIORITY = [
  'Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur', 'Ministre',
  'Responsable', 'Adjoint', 'Trésorier', 'Coach', 'Leader',
  'Capitaine de Bus', 'Responsable de Zone', 'Responsable de Commune',
  'Responsable de section', 'Membre', 'Nouveau',
];
import { roleForDeptFn } from '../packages/shared/migrate.ts';

const ref = (process.env.MEMBER ?? '').trim();
const norm = (s: unknown) => String(s ?? '').replace(/[\s+]/g, '').toLowerCase();
// Les numéros sont saisis tantôt avec l'indicatif, tantôt sans : on compare sur les
// 8 derniers chiffres, ce qui rapproche « 0757027083 » et « +2250757027083 ».
const tail = (s: unknown) => norm(s).replace(/\D/g, '').slice(-8);

async function main() {
  const members = (await getCollection('members')).filter((m: any) => !m.deletedAt);
  const departments = (await getCollection('departments')).filter((d: any) => !d.deletedAt);
  const admins = (await getCollection('admins')).filter((a: any) => !a.deletedAt);
  const ministries = (await getCollection('ministries')).filter((m: any) => !m.deletedAt);
  const deptById = new Map(departments.map((d: any) => [d.id, d]));

  console.log(`\n=== STRUCTURE ===`);
  console.log(`Membres vivants : ${members.length} | Départements : ${departments.length}`);
  const busDepts = departments.filter((d: any) => d.specialFunction === 'bloom_bus');
  console.log(`Départements « bloom_bus » : ${busDepts.length}`);
  for (const d of busDepts) console.log(`   - ${d.name} (${d.id}) branche=${d.branch ?? 'aucune'}`);
  if (busDepts.length > 1) {
    console.log('   ⚠ Plusieurs instances : la résolution du rôle Bloom Bus prend la PREMIÈRE');
    console.log('     de la liste, pas celle où le membre a réellement une fonction.');
  }

  if (ref) {
    const m = members.find((x: any) => x.id === ref)
      ?? members.find((x: any) => norm(x.email) === norm(ref))
      ?? members.find((x: any) => tail(x.phone) === tail(ref));
    console.log(`\n=== MEMBRE « ${ref} » ===`);
    if (!m) {
      console.log('Introuvable (essayé : id, email, 8 derniers chiffres du téléphone).');
    } else {
      console.log(`${m.firstName} ${m.lastName} — id ${m.id} — tél ${m.phone} — branche ${m.branch}`);
      console.log(`niveau=${m.level} cursus=${m.pastoralCursus} bloomBusId=${m.bloomBusId ?? '(aucun)'}`);
      console.log('Affectations :');
      for (const [id, fn] of Object.entries(m.departments ?? {})) {
        const d: any = deptById.get(id);
        const flag = d ? '' : '   ⚠ CE DÉPARTEMENT N\'EXISTE PAS';
        console.log(`   - ${(d?.name ?? id).padEnd(34)} fonction=${String(fn).padEnd(14)} → rôle « ${roleForDeptFn(fn as any)} »${flag}`);
      }
      if (!Object.keys(m.departments ?? {}).length) console.log('   (aucune)');
      // C'est cette valeur, et elle seule, qui ouvre le module Bloom Bus en entier.
      console.log(`Rôle Bloom Bus dérivé (bloomBusRoleOf) : ${bloomBusRoleOf(m, departments as any) ?? 'AUCUN'}`);
      console.log(`  → accès complet au module Bloom Bus : ${bloomBusRoleOf(m, departments as any) === 'Responsable' ? 'OUI' : 'NON'}`);

      // Rôle unique retenu par l'interface, et département annoncé sur la page d'accueil.
      const roles = resolveRoles(m, admins as any, ministries as any);
      const uiRole = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? 'Membre';
      console.log(`Rôles dérivés : ${roles.join(', ')}`);
      console.log(`Rôle affiché par l'interface : ${m.testRole ? `${m.testRole} (forcé par testRole)` : uiRole}`);
      const scope = dashboardScope(m, uiRole, members as any, [], departments as any, ministries as any);
      const home = scope.deptIds?.[0];
      console.log(`Département annoncé sur la page d'accueil : ${home ? ((deptById.get(home) as any)?.name ?? home) : 'portée globale'}`);
      if (home && !Object.keys(m.departments ?? {}).includes(home)) {
        console.log(`   ⚠ Ce département N'EST PAS dans ses affectations — c'est le défaut ROLE_HOME_DEPT.`);
      }
    }
  }

  console.log(`\n=== TOUS LES RESPONSABLES (fonction « responsable ») ===`);
  let n = 0;
  for (const m of members) {
    for (const [id, fn] of Object.entries(m.departments ?? {})) {
      if (fn !== 'responsable') continue;
      n++;
      const d: any = deptById.get(id);
      console.log(`   ${(m.firstName + ' ' + m.lastName).padEnd(28)} → ${d?.name ?? id}${d ? '' : '  ⚠ département inexistant'}`);
    }
  }
  if (!n) console.log('   (aucun)');

  console.log(`\n=== ANOMALIES ===`);
  const orphans = members.filter((m: any) =>
    Object.keys(m.departments ?? {}).some((id) => !deptById.has(id)));
  console.log(`Membres affectés à un département inexistant : ${orphans.length}`);
  for (const m of orphans) {
    const bad = Object.keys(m.departments).filter((id) => !deptById.has(id));
    console.log(`   - ${m.firstName} ${m.lastName} → ${bad.join(', ')}`);
  }

  // Rattaché à un bus sans aucune fonction dans le département Bloom Bus : le membre
  // apparaît sur la carte et dans les effectifs, mais aucune règle de portée ne le couvre.
  const busIds = new Set(busDepts.map((d: any) => d.id));
  const attachedNoFn = members.filter((m: any) =>
    m.bloomBusId && !Object.keys(m.departments ?? {}).some((id) => busIds.has(id)));
  console.log(`Rattachés à un bus sans fonction dans le département Bloom Bus : ${attachedNoFn.length}`);
  for (const m of attachedNoFn.slice(0, 15)) console.log(`   - ${m.firstName} ${m.lastName}`);

  // Deux « responsable » dans le même département : un seul devrait l'être.
  const byDept = new Map<string, string[]>();
  for (const m of members) {
    for (const [id, fn] of Object.entries(m.departments ?? {})) {
      if (fn !== 'responsable') continue;
      byDept.set(id, [...(byDept.get(id) ?? []), `${m.firstName} ${m.lastName}`]);
    }
  }
  const doubles = [...byDept.entries()].filter(([, who]) => who.length > 1);
  console.log(`Départements avec PLUSIEURS responsables : ${doubles.length}`);
  for (const [id, who] of doubles) {
    console.log(`   - ${(deptById.get(id) as any)?.name ?? id} : ${who.join(', ')}`);
  }

  // Fonction la plus forte détenue, utile pour repérer une promotion posée au mauvais endroit.
  if (ref) {
    console.log(`\n(rappel : rangs — plus le nombre est petit, plus la fonction est élevée)`);
    console.log(`   Responsable=${rankOf('Responsable')} Adjoint=${rankOf('Adjoint')} Capitaine de Bus=${rankOf('Capitaine de Bus')} Membre=${rankOf('Membre')}`);
  }
  console.log('');
}

await main();
