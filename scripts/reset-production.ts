// Remise à zéro pour la mise en production officielle — vide les données de démonstration
// et de test, en ne conservant QU'UN compte : celui qui pourra ensuite enregistrer les vrais
// membres.
//
// Pourquoi un script et non du SQL à la main : il passe par server/datastore.ts, donc il se
// comporte à l'identique sur SQLite (dev) et sur PostgreSQL (prod) — un script SQL aurait dû
// être écrit deux fois et n'aurait été testable que sur l'un des deux. Il applique en plus la
// règle non évidente ci-dessous, qu'un DELETE brut ne connaît pas.
//
// ⚠️ LE PIÈGE QUE CE SCRIPT ÉVITE — à lire avant de faire ce ménage autrement.
// server/seed.ts ré-injecte le jeu de démonstration à CHAQUE démarrage pour toute collection
// TROUVÉE VIDE :
//     if ((await getCollection(name)).length === 0) await setCollection(name, seed);
// Vider entièrement `reports`, `notifications` ou `audits` avec un DELETE ferait donc revenir
// les données de démo au redéploiement suivant, sans le moindre message. On laisse donc dans
// chacune de ces collections UNE ligne « pierre tombale » (deletedAt renseigné) : invisible
// pour l'application (readCollection filtre deletedAt), mais suffisante pour que le seed
// considère la collection comme déjà peuplée et passe son chemin.
// `members` échappe à la règle par construction : le compte conservé la maintient non vide.
//
// Usage (dans le conteneur backend, DATABASE_URL déjà présent dans son environnement) :
//   RESET_CONFIRM=OUI-JE-VIDE-LA-BASE KEEP_MEMBER=<email|téléphone|id> npx tsx scripts/reset-production.ts
//
// Sans les deux variables, le script décrit ce qu'il ferait et ne touche à rien.
import 'dotenv/config';
import { getCollection, setCollection } from '../server/datastore.ts';

const CONFIRM = 'OUI-JE-VIDE-LA-BASE';
const confirmed = process.env.RESET_CONFIRM === CONFIRM;
const keepRef = (process.env.KEEP_MEMBER ?? '').trim();

// Vidées : données transactionnelles de démo. Une pierre tombale y est laissée (voir en-tête).
const WIPED = [
  'reports', 'notifications', 'certifications', 'integration_reports',
  'delegations', 'capability_overrides', 'special_authorizations',
];

// Conservées : structure sans laquelle l'application ne peut pas fonctionner ni enregistrer
// un membre (un département est obligatoire à l'inscription). À revoir ensuite depuis l'UI —
// le script ne prétend pas deviner quels départements ou ministères sont réels.
const KEPT = ['departments', 'ministries', 'activities', 'forms', 'events', 'projects', 'bus_lines'];

const norm = (s: unknown) => String(s ?? '').replace(/\s/g, '').toLowerCase();

function findKeeper(members: any[], ref: string): any | null {
  const r = norm(ref);
  return members.find((m) => m.id === ref)
    ?? members.find((m) => norm(m.email) === r)
    ?? members.find((m) => norm(m.phone) === r)
    ?? null;
}

const tombstone = (name: string) => [{
  id: `_reset_${name}`,
  // Invisible à l'application ; existe uniquement pour empêcher la ré-injection du seed.
  deletedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}];

// Deux réglages d'environnement décident, dans server/seed.ts, si le jeu de DÉMONSTRATION est
// réinjecté à chaque démarrage — indépendamment de tout ce que ce script efface :
//   SEED_TEST_PROFILES = !!(SEED_DEMO_PASSWORD || NODE_ENV !== 'production')
// Quand il vaut true, `ensureSeeded` REMPLACE le jeu Bloom Bus de test à chaque boot et
// `reconcileSeedMembers` réajoute les membres seed manquants. Nettoyer une base servie par un
// backend ainsi configuré ne sert donc strictement à rien : tout revient au redéploiement.
// Constaté en test, d'où ce garde-fou — le script refuse plutôt que de donner une fausse
// impression de propreté.
function assertProductionEnv(): void {
  const problems: string[] = [];
  if (process.env.NODE_ENV !== 'production') {
    problems.push(`NODE_ENV vaut « ${process.env.NODE_ENV ?? 'non défini'} » au lieu de « production »`);
  }
  if (process.env.SEED_DEMO_PASSWORD) {
    problems.push('SEED_DEMO_PASSWORD est renseignée (elle seede 18 profils de test avec un mot de passe connu)');
  }
  if (!problems.length) return;
  console.error('\nCe backend n\'est PAS configuré en production :');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nDans cet état, server/seed.ts réinjecte le jeu de démonstration à CHAQUE démarrage :');
  console.error('le nettoyage serait annulé au redéploiement suivant. Corrige l\'environnement du');
  console.error('backend d\'abord. Rien n\'a été modifié.\n');
  process.exit(1);
}

async function main() {
  const members = await getCollection('members');
  const admins = await getCollection('admins');

  console.log(`\nBase actuelle : ${members.length} membre(s), ${admins.length} compte(s) admin.`);
  for (const name of [...WIPED, ...KEPT]) {
    console.log(`  ${name.padEnd(24)} ${(await getCollection(name)).length}`);
  }

  if (!keepRef) {
    console.error('\nKEEP_MEMBER manquant : indique l\'email, le téléphone ou l\'id du compte à conserver.');
    process.exit(1);
  }
  assertProductionEnv();
  const keeper = findKeeper(members, keepRef);
  if (!keeper) {
    console.error(`\nAucun membre ne correspond à « ${keepRef} ». Rien n'a été modifié.`);
    process.exit(1);
  }

  // Sans son entrée admin, le compte conservé perdrait le rôle Super Admin (rbac.resolveRoles
  // le dérive de cette collection) : il ne pourrait plus rien administrer, et personne d'autre
  // ne le pourrait non plus. On refuse plutôt que de produire une base inutilisable.
  const adminEntry = admins.find((a: any) => a.id === `adm_${keeper.id}` || a.id === keeper.id);
  if (!adminEntry) {
    console.error(`\n${keeper.firstName} ${keeper.lastName} n'a pas d'entrée dans « admins » : il perdrait`);
    console.error('le rôle Super Admin et la base deviendrait inadministrable. Rien n\'a été modifié.');
    process.exit(1);
  }
  if (adminEntry.role !== 'Super Admin') {
    console.error(`\nLe compte conservé a le rôle « ${adminEntry.role} » et non « Super Admin ». Rien n'a été modifié.`);
    process.exit(1);
  }

  console.log(`\nCompte conservé : ${keeper.firstName} ${keeper.lastName} (${keeper.id}) — ${adminEntry.role}`);
  console.log(`Membres supprimés : ${members.length - 1}`);
  console.log(`Collections vidées : ${WIPED.join(', ')}`);
  console.log(`Collections conservées : ${KEPT.join(', ')}, permissions, settings`);

  if (!confirmed) {
    console.log(`\nSIMULATION — rien n'a été écrit. Pour exécuter réellement :`);
    console.log(`  RESET_CONFIRM=${CONFIRM} KEEP_MEMBER=${keepRef} npx tsx scripts/reset-production.ts\n`);
    return;
  }

  await setCollection('members', [keeper]);
  await setCollection('admins', [adminEntry]);
  for (const name of WIPED) await setCollection(name, tombstone(name));

  // Le journal d'audit est append-only et ses pierres tombales RESTENT visibles
  // (readCollection ne les filtre pas pour cette collection) : au lieu d'une ligne technique,
  // on y inscrit l'événement lui-même — la remise à zéro est précisément ce qu'un journal
  // d'audit doit retenir, et cette entrée empêche aussi la ré-injection du seed.
  await setCollection('audits', [{
    id: `aud_reset_prod_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actionType: 'PRODUCTION_RESET',
    operatorName: `${keeper.firstName} ${keeper.lastName}`,
    operatorId: keeper.id,
    details: `Mise en production : base nettoyée, ${members.length - 1} membre(s) de démonstration supprimé(s).`,
    updatedAt: new Date().toISOString(),
  }]);

  console.log('\nFait. Vérifie avant de rouvrir l\'application aux utilisateurs :');
  console.log('  - redémarre le backend et confirme qu\'aucune donnée de démo n\'est revenue ;');
  console.log('  - connecte-toi et vérifie que tu es toujours Super Admin ;');
  console.log('  - vide les données de site de ton navigateur avant de te reconnecter (une file');
  console.log('    de synchronisation hors-ligne restée en localStorage republierait l\'ancien état).\n');
}

await main();
