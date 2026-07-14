// =============================================================================
// Jeu de données de TEST Bloom Bus — SÉPARÉ du code de production.
//
//   Seed    : npx tsx server/seed-test-dataset.ts
//   Nettoyer: npx tsx server/seed-test-dataset.ts --clean
//
// - Toutes les entités créées portent l'id préfixe `stds_` (Seed Test Data Set)
//   et le marqueur de nom "(TEST)" → repérables et supprimables en une commande.
// - IDEMPOTENT : le seed nettoie d'abord tout `stds_` puis régénère (ids déterministes).
// - Réutilise les comptes de test existants (mem_test_*, login = téléphone + `bloom2026`).
//   Quelques mises à jour de cohérence (mem_test_6 → Responsable dept Bloom Bus,
//   mem_test_10 GPS, min_expansion.tuteurId → mem_test_5) sont SAUVEGARDÉES dans le KV
//   `stds_backup` et RESTAURÉES au --clean.
// - N'écrit que dans les collections `members`, `reports`, `ministries` (+ le KV backup).
//   Aucun nouveau compte de connexion n'est créé.
// =============================================================================
import { getCollection, setCollection, getKv, setKv, db } from './db.ts';
import type { Member, Report, Ministry, CommunityLevel, DeptFunction } from '../src/types.ts';

// Attendre (au lieu d'échouer) si le serveur écrit au même moment — utile quand le script
// tourne dans le conteneur pendant que l'API est active (SQLite, base partagée).
db.exec('PRAGMA busy_timeout = 8000');

const PREFIX = 'stds_';
const BACKUP_KEY = 'stds_backup';
const CLEAN = process.argv.includes('--clean');
const TODAY = new Date().toISOString().split('T')[0];

// ---- Semaines S-1 / S-2 (miroir de src/data/week.ts : lundi local, (day+6)%7) ----
function mondayISO(d: Date): string {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}
function weekOffset(iso: string, n: number): string {
  const [y, mo, da] = iso.split('-').map(Number);
  return mondayISO(new Date(y, mo - 1, da + n * 7));
}
const CUR = mondayISO(new Date());
const S1 = weekOffset(CUR, -1);
const S2 = weekOffset(CUR, -2);

// ---- Nettoyage ----
const dropStds = (arr: any[]) => arr.filter((x) => !String(x.id).startsWith(PREFIX));
function stripStds() {
  setCollection('members', dropStds(getCollection('members')));
  setCollection('reports', getCollection('reports').filter((r: any) =>
    !String(r.id).startsWith(PREFIX)
    && !String(r.content?.memberId ?? '').startsWith(PREFIX)
    && !String(r.content?.busId ?? '').startsWith(PREFIX)));
  setCollection('events', dropStds(getCollection('events')));
  setCollection('activities', dropStds(getCollection('activities')));
}
function restoreBackup() {
  const backup = getKv<any>(BACKUP_KEY);
  if (!backup) return;
  for (const [coll, items] of Object.entries(backup) as [string, any[]][]) {
    if (!Array.isArray(items) || !items.length) continue;
    const cur = getCollection(coll);
    const byId = new Map(cur.map((x: any) => [x.id, x]));
    for (const orig of items) byId.set(orig.id, orig);
    setCollection(coll, [...byId.values()]);
  }
  setKv(BACKUP_KEY, null);
}

if (CLEAN) {
  restoreBackup();
  stripStds();
  console.log('✓ Jeu de test Bloom Bus supprimé (entités `stds_` retirées, comptes test restaurés).');
  process.exit(0);
}

// =============================================================================
// SEED
// =============================================================================
// 0) idempotence : repartir propre (restaure les comptes test puis retire les stds_)
restoreBackup();
stripStds();

const members = getCollection('members') as Member[];
const ministries = getCollection('ministries') as Ministry[];
const departments = getCollection('departments') as any[];
const busLines = getCollection('bus_lines') as any[];
const byId = (id: string) => members.find((m) => m.id === id);

// 1) Sauvegarde AVANT modification des comptes test / ministère
const backup: Record<string, any[]> = { members: [], ministries: [] };
for (const id of ['mem_test_6', 'mem_test_10']) { const m = byId(id); if (m) backup.members.push(structuredClone(m)); }
const minExp = ministries.find((m) => m.id === 'min_expansion');
if (minExp) backup.ministries.push(structuredClone(minExp));
setKv(BACKUP_KEY, backup);

// 2) Mises à jour de cohérence des comptes test
const t6 = byId('mem_test_6');
if (t6) { t6.departments = { dept_bloom_bus: 'Responsable' as DeptFunction }; t6.gps = { lat: 5.3854, lng: -3.9781, commune: 'Cocody' }; } // Responsable du dept Bloom Bus (valide les réceptions)
const t10 = byId('mem_test_10');
if (t10) t10.gps = { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' }; // capitaine bus_yop_maroc
if (minExp) minExp.tuteurId = 'mem_test_5'; // Ministre réel du Ministère de l'Expansion (contient Bloom Bus)

// ---- Générateurs ----
const FIRST = ['Awa', 'Koffi', 'Adjoua', 'Yao', 'Aya', 'Kouadio', 'Mariam', 'Ibrahim', 'Fatou', 'Seydou', 'Aicha', 'Moussa', 'Rokia', 'Bakary', 'Nafi', 'Drissa', 'Salif', 'Kadi', 'Oumar', 'Bintou', 'Sekou', 'Ramata', 'Vamara', 'Assita'];
const LAST = ['Koné', 'Traoré', 'Ouattara', 'Diallo', 'Bamba', 'Cissé', 'Touré', 'Coulibaly', 'Fofana', 'Sanogo', 'Kouassi', 'Yao'];
const LEVELS: CommunityLevel[] = ['Nouveau', 'Stagiaire', 'Boss', 'Leader', 'Coach'];
const CULTES = ['1er culte Bloom Church', '2e culte Bloom Church', 'Culte Bloom Light'];

let phoneN = 1;
let nameN = 0;
const gen: Member[] = [];
const reports: Report[] = [];

function mkMember(id: string, extra: Partial<Member>, i = nameN++): Member {
  const first = FIRST[i % FIRST.length];
  const last = LAST[i % LAST.length];
  return {
    id,
    firstName: first,
    lastName: `${last} (TEST)`,
    phone: `+2250599${String(phoneN++).padStart(6, '0')}`,
    email: `${id}@bloom.test`,
    gender: i % 2 === 0 ? 'H' : 'F',
    birthDate: '1996-03-15',
    maritalStatus: 'Célibataire',
    profession: 'Testeur',
    source: 'seedtest',
    branch: 'church',
    level: 'Boss',
    pastoralCursus: 'Aucun',
    departments: {},
    entryDate: '2025-01-10',
    hasPassedToBossForm: true,
    baptismStatus: 'Baptisé',
    healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
    ...extra,
  } as Member;
}

// ---- A) Un membre dans CHAQUE département (hors bloom_bus, géré par la hiérarchie) ----
let di = 0;
for (const d of departments) {
  if (d.specialFunction === 'bloom_bus') continue;
  gen.push(mkMember(`stds_dept_${d.id}`, {
    departments: { [d.id]: 'Membre' as DeptFunction },
    level: LEVELS[di % LEVELS.length],
    gps: { lat: 5.35 + (di % 7) * 0.01, lng: -4.0 + (di % 5) * 0.01, commune: 'Cocody' },
    healthKPIs: { spirituel: 2 + (di % 4), social: 2 + (di % 3), financier: 3, physique: 3, presenceCulte: 2 + (di % 4), presenceService: 3 },
  }));
  di++;
}

// ---- B) Hiérarchie Bloom Bus ----
// Leads réutilisés / générés par zone & commune
const ZONE_LEAD: Record<string, string> = { 'Zone Est': 'mem_test_11', 'Zone Ouest': 'stds_lead_zone_ouest' };
const COMMUNE_LEAD: Record<string, string> = { 'Cocody': 'mem_test_12', 'Yopougon': 'stds_lead_commune_yop' };
const CAPTAIN_REUSE: Record<string, string> = { 'bus_yop_maroc': 'mem_test_10' };
const COMPLETE_BUS = new Set(['bus_coc_angre']); // ce bus = 100 % validé (complet)

// leads générés (Zone Ouest / Commune Yopougon)
gen.push(mkMember('stds_lead_zone_ouest', {
  departments: { dept_bloom_bus: 'Responsable de Zone' as DeptFunction }, bloomBusId: 'bus_yop_maroc',
  gps: { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' }, level: 'Leader',
}));
gen.push(mkMember('stds_lead_commune_yop', {
  departments: { dept_bloom_bus: 'Responsable de Commune' as DeptFunction }, bloomBusId: 'bus_yop_maroc',
  gps: { lat: 5.3436, lng: -4.0722, commune: 'Yopougon' }, level: 'Coach',
}));

// motifs de statut S-2 / S-1 pour les bus incomplets (none / pending / validated)
const PATTERN: { s1: 'none' | 'pending' | 'validated'; s2: 'none' | 'pending' | 'validated' }[] = [
  { s2: 'none', s1: 'none' },
  { s2: 'none', s1: 'pending' },
  { s2: 'pending', s1: 'validated' },
  { s2: 'validated', s1: 'validated' },
  { s2: 'validated', s1: 'pending' },
];

function jitter(base: number, i: number) { return +(base + ((i % 5) - 2) * 0.003).toFixed(5); }

function pushHealthReport(m: Member, week: string, validated: boolean, captainId: string, captainName: string, i: number) {
  const author = validated ? { id: captainId, name: captainName, role: 'Capitaine de Bus' } : { id: m.id, name: `${m.firstName} ${m.lastName}`, role: 'Membre' };
  reports.push({
    id: `rep_bus_mem_${m.id}_${week}`,
    authorId: author.id, authorName: author.name, authorRole: author.role,
    targetBranch: 'church', date: TODAY, weekOf: week,
    reportType: 'rapport_bloom_bus_member', confidential: false, validated,
    content: {
      memberId: m.id, memberName: `${m.firstName} ${m.lastName}`,
      sprVal: 2 + (i % 4), socVal: 2 + ((i + 1) % 4), finVal: 2 + ((i + 2) % 4), phyVal: 2 + ((i + 3) % 4),
      culte: CULTES[i % CULTES.length], observation: `Rapport de test ${week}`,
    },
  } as Report);
}

for (const bus of busLines) {
  const commune: string = bus.commune, zone: string = bus.zone;
  // Capitaine (réutilisé ou généré)
  let captainId = CAPTAIN_REUSE[bus.id];
  let captainName: string;
  if (captainId) {
    const c = byId(captainId); captainName = c ? `${c.firstName} ${c.lastName}` : 'Capitaine';
  } else {
    const cap = mkMember(`stds_cap_${bus.id}`, {
      departments: { dept_bloom_bus: 'Capitaine de Bus' as DeptFunction }, bloomBusId: bus.id,
      gps: { lat: jitter(bus.centerLat, 0), lng: jitter(bus.centerLng, 0), commune }, level: 'Coach',
    });
    gen.push(cap); captainId = cap.id; captainName = `${cap.firstName} ${cap.lastName}`;
  }

  // ~5 membres du bus, avec rapports S-2/S-1 selon le motif (ou 100 % validé si bus complet)
  const busMemberIds: string[] = [];
  const nMembers = COMPLETE_BUS.has(bus.id) ? 4 : 5;
  for (let i = 0; i < nMembers; i++) {
    const m = mkMember(`stds_m_${bus.id}_${i}`, {
      bloomBusId: bus.id, level: LEVELS[i % LEVELS.length],
      gps: { lat: jitter(bus.centerLat, i + 1), lng: jitter(bus.centerLng, i + 1), commune },
      healthKPIs: { spirituel: 2 + (i % 4), social: 3, financier: 2 + (i % 3), physique: 3, presenceCulte: 2 + (i % 4), presenceService: 3 },
    });
    gen.push(m); busMemberIds.push(m.id);

    const pat = COMPLETE_BUS.has(bus.id) ? { s2: 'validated', s1: 'validated' } as const : PATTERN[i % PATTERN.length];
    if (pat.s2 !== 'none') pushHealthReport(m, S2, pat.s2 === 'validated', captainId, captainName, i);
    if (pat.s1 !== 'none') pushHealthReport(m, S1, pat.s1 === 'validated', captainId, captainName, i + 1);
  }

  // Rapport d'activité (rapport_bloom_bus_life) pour les bus de Cocody & Yopougon
  if (['bus_coc_angre', 'bus_yop_maroc', 'bus_abo_gendarmerie'].includes(bus.id)) {
    reports.push({
      id: `stds_repact_${bus.id}`,
      authorId: captainId, authorName: captainName, authorRole: 'Capitaine de Bus',
      targetBranch: 'church', date: TODAY, reportType: 'rapport_bloom_bus_life', confidential: false,
      content: {
        busId: bus.id, activityName: 'Évangélisation de quartier', activityDay: 'Samedi',
        description: `Sortie Bloom Bus ${bus.name} (test)`, observation: undefined,
        presenceList: busMemberIds.slice(0, 3), soulsWon: 2 + (busMemberIds.length % 4),
      },
    } as Report);
  }
}

// ---- C) Membres en attente « Origine : Bloom Bus » (onglet Intégration du Responsable dept) ----
const PENDING_BUS = ['bus_coc_angre', 'bus_yop_maroc', 'bus_abo_gendarmerie'];
for (let i = 0; i < PENDING_BUS.length; i++) {
  const bl = busLines.find((b) => b.id === PENDING_BUS[i]);
  gen.push(mkMember(`stds_pending_${i}`, {
    departments: { dept_bloom_bus: 'Membre' as DeptFunction }, bloomBusId: PENDING_BUS[i],
    level: 'Stagiaire', deptAttachmentStatus: 'pending', deptAttachmentOrigin: 'bloom_bus',
    gps: { lat: jitter(bl.centerLat, i), lng: jitter(bl.centerLng, i), commune: bl.commune },
  }));
}

// ---- Écriture ----
setCollection('members', [...members, ...gen]);
setCollection('reports', [...getCollection('reports'), ...reports]);
setCollection('ministries', ministries);

// ---- Récap ----
const pendingCount = gen.filter((m) => m.deptAttachmentStatus === 'pending').length;
console.log('✓ Jeu de données de test Bloom Bus généré.');
console.log(`  Membres générés (stds_) : ${gen.length}  (dont ${pendingCount} en attente « Origine Bloom Bus »)`);
console.log(`  Rapports générés        : ${reports.length}  (santé S-1=${S1} / S-2=${S2} + activités)`);
console.log(`  Comptes test mis à jour : mem_test_6 (Responsable dept Bloom Bus), mem_test_10 (GPS Yopougon), min_expansion.tuteurId=mem_test_5`);
console.log('  Nettoyage : npx tsx server/seed-test-dataset.ts --clean');
