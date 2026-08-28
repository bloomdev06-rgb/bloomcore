// Migration §27 en ligne de commande — la logique vit dans server/migrateBusRoles.ts, où elle
// est aussi appelée AU DÉMARRAGE du serveur. Ce script ne sert donc plus qu'à deux choses :
//   - VOIR ce qui sera migré, avant de déployer (simulation) ;
//   - forcer la migration sans redémarrer, ou après un échec signalé dans les logs.
//
// Usage (terminal du conteneur backend, depuis /app) :
//   npx tsx scripts/migrate-bus-roles.ts                     # simulation, n'écrit rien
//   MIGRATE_CONFIRM=OUI npx tsx scripts/migrate-bus-roles.ts # exécution
import 'dotenv/config';
import { migrateBusRoles } from '../server/migrateBusRoles.ts';

const confirmed = process.env.MIGRATE_CONFIRM === 'OUI';

const r = await migrateBusRoles(confirmed);

console.log(`\nDépartements « bloom_bus » : ${r.busDepartments.length}`);
for (const d of r.busDepartments) console.log(`   - ${d.name} (${d.id}) branche=${d.branch ?? 'aucune'}`);
if (!r.busDepartments.length) {
  console.log('\nAucun département Bloom Bus : rien à migrer.\n');
  process.exit(0);
}

console.log(`\nMembres à migrer : ${r.changes.length}`);
for (const c of r.changes) {
  console.log(`   - ${c.name} (${c.id}) : ${c.from.join(', ')} → busRole=${c.to}`
    + (c.staysInDepartment ? ' [reste membre du département]' : ' [sort de la liste du département]'));
}

if (r.wouldLose.length) {
  console.error(`\n⚠ ${r.wouldLose.length} membre(s) perdraient leur fonction Bloom Bus. Rien n'a été écrit.`);
  process.exit(1);
}
if (!r.changes.length) {
  console.log('\nRien à migrer : aucune fonction territoriale stockée côté département.\n');
  process.exit(0);
}
if (!r.applied) {
  console.log('\nSIMULATION — rien n\'a été écrit. Pour exécuter réellement :');
  console.log('  MIGRATE_CONFIRM=OUI npx tsx scripts/migrate-bus-roles.ts');
  console.log('(ou simplement redémarrer le backend : la migration est lancée au démarrage.)\n');
  process.exit(0);
}
console.log(`\nFait : ${r.changes.length} membre(s) migré(s).`);
console.log('Vérifie avec : MEMBER=<téléphone> npx tsx scripts/diag-roles.ts\n');
