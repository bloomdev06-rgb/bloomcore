// Purge des lignes Bloom Bus de DÉMONSTRATION réintroduites en production.
//
// Contexte : un cache navigateur vide faisait retomber l'application sur INITIAL_BUS_LINES,
// et le premier import CSV poussait ces bus de démo au serveur (corrigé dans src/data/index.ts,
// voir seedOrEmpty). Ce script nettoie les lignes déjà écrites en base.
//
// CIBLAGE PAR ID DE SEED, jamais par nom : les ids d'INITIAL_BUS_LINES (bus_yop_maroc,
// bus_coc_angre, …) sont ceux du jeu de démonstration et ne peuvent pas entrer en collision
// avec un bus importé, dont l'id est généré. Le script ne peut donc pas supprimer un vrai bus.
//
// PIERRE TOMBALE plutôt que suppression sèche, pour deux raisons :
//   1. un navigateur dont le cache contient encore ces bus les repousserait — applyWrite
//      (server/guards.ts) rejette alors l'écriture en CONFLIT, car le `updatedAt` de la pierre
//      tombale est postérieur au `asOf` de ce client périmé. Une suppression sèche n'offrirait
//      pas cette protection : l'id serait simplement recréé ;
//   2. `readCollection` filtre `deletedAt`, donc l'application ne les voit plus.
//
// Usage (terminal du conteneur backend, depuis /app) :
//   npx tsx scripts/purge-demo-buses.ts                 # simulation, n'écrit rien
//   PURGE_CONFIRM=OUI npx tsx scripts/purge-demo-buses.ts
//
// BUS_IDS=id1,id2 permet de cibler d'autres ids que ceux du jeu de démonstration.
import 'dotenv/config';
import { getCollection, setCollection } from '../server/datastore.ts';
import { INITIAL_BUS_LINES } from '../src/mockData.ts';

const confirmed = process.env.PURGE_CONFIRM === 'OUI';
const targets = new Set(
  (process.env.BUS_IDS ?? INITIAL_BUS_LINES.map((b) => b.id).join(','))
    .split(',').map((s) => s.trim()).filter(Boolean),
);

async function main() {
  const buses = await getCollection('bus_lines');
  const live = buses.filter((b: any) => !b.deletedAt);
  const doomed = live.filter((b: any) => targets.has(String(b.id)));
  const kept = live.filter((b: any) => !targets.has(String(b.id)));

  console.log(`\nLignes Bloom Bus vivantes : ${live.length}`);
  console.log(`  à supprimer (jeu de démonstration) : ${doomed.length}`);
  for (const b of doomed) console.log(`    - ${b.name} (${b.id})`);
  console.log(`  conservées : ${kept.length}`);
  for (const b of kept) console.log(`    - ${b.name} (${b.id})`);

  if (doomed.length === 0) {
    console.log('\nRien à purger : aucune ligne de démonstration en base.\n');
    return;
  }
  // Vider entièrement la collection la ferait ré-injecter par server/seed.ts au démarrage
  // suivant (même piège que la remise à zéro de production) : on refuse.
  if (kept.length === 0) {
    console.error('\nToutes les lignes seraient supprimées : la collection vide serait ré-injectée');
    console.error('depuis le jeu de démonstration au prochain démarrage. Rien n\'a été modifié.\n');
    process.exit(1);
  }

  // Membres rattachés à un bus supprimé : sans ce nettoyage, `bloomBusId` pointerait dans le
  // vide et fausserait silencieusement les KPI (kpi.ts/completude.ts agrègent par bus).
  const members = await getCollection('members');
  const orphans = members.filter((m: any) => m.bloomBusId && targets.has(String(m.bloomBusId)));
  console.log(`\nMembres rattachés à une de ces lignes : ${orphans.length}`);
  for (const m of orphans) console.log(`    - ${m.firstName} ${m.lastName}`);

  if (!confirmed) {
    console.log('\nSIMULATION — rien n\'a été écrit. Pour exécuter réellement :');
    console.log('  PURGE_CONFIRM=OUI npx tsx scripts/purge-demo-buses.ts\n');
    return;
  }

  const now = new Date().toISOString();
  await setCollection('bus_lines', [
    ...kept,
    ...doomed.map((b: any) => ({ ...b, deletedAt: now, updatedAt: now })),
    // Les pierres tombales déjà présentes sont conservées : les réécrire ne servirait à rien
    // et ferait perdre leur horodatage d'origine.
    ...buses.filter((b: any) => b.deletedAt && !targets.has(String(b.id))),
  ]);

  if (orphans.length) {
    await setCollection('members', members.map((m: any) =>
      m.bloomBusId && targets.has(String(m.bloomBusId))
        ? { ...m, bloomBusId: undefined, updatedAt: now }
        : m));
  }

  console.log(`\nFait : ${doomed.length} ligne(s) de démonstration supprimée(s), ${kept.length} conservée(s).`);
  console.log('Recharge l\'application. Si elles réapparaissent, c\'est que le navigateur a encore');
  console.log('l\'ancien cache : vide les données de site pour le domaine, puis reconnecte-toi.\n');
}

await main();
