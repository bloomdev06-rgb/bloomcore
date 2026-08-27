// Test du parser + import CSV membres. Lancé via `npm test` (tsx).
import { parseCsv, importMembersFromCsv } from './csvImport.ts';
import type { Member, BloomBusEntity } from '../types.ts';

function assert(cond: boolean, msg: string) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }

// 1) Parser : guillemets, virgule échappée dans un champ quoté, CRLF
const parsed = parseCsv('a,b,c\r\n"x,1","y""2",z\n');
assert(parsed.length === 2, 'parseCsv: 2 lignes');
assert(parsed[1][0] === 'x,1', 'parseCsv: virgule dans champ quoté conservée');
assert(parsed[1][1] === 'y"2', 'parseCsv: guillemet échappé "" -> "');

// 2) Délimiteur point-virgule (export Excel-FR)
const semi = parseCsv('nom;prenom;telephone\nDoe;John;0700');
assert(semi[1][0] === 'Doe' && semi[1][2] === '0700', 'parseCsv: délimiteur ;');

const existing: Member[] = [{
  id: 'm_exist', firstName: 'Ada', lastName: 'Lovelace', phone: '0700000001', email: '',
  gender: 'F', birthDate: '', maritalStatus: 'Célibataire', profession: '', entryDate: '2020-01-01',
  branch: 'church', level: 'stagiaire', pastoralCursus: 'aucun', departments: {}, baptismStatus: 'non_baptise',
  healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 4, presenceCulte: 4, presenceService: 3 },
} as Member];

const busLines: BloomBusEntity[] = [
  { id: 'bus_test_cocody', name: 'Test Cocody', commune: 'Cocody', zone: 'Zone par défaut', centerLat: 5.36, centerLng: -3.99 },
];

const now = new Date('2026-07-21T00:00:00Z');
const csv = [
  'nom,prenom,telephone,email,departement,branche,niveau,cursus,bapteme,sexe,commune',
  'Traoré,Awa,0700000002,awa@x.ci,dept_test,light,boss,serviteur,baptise,F,Cocody',       // ok, accents/enum, commune matchée -> gps
  'Koné,,0700000003,kone@x.ci,dept_test,church,,,,,',                                      // rejet: prénom manquant
  'Doe,John,0700000001,doe@x.ci,dept_test,church,,,,,',                                    // rejet: doublon existant
  'Doe,Jane,0700000002,jane@x.ci,dept_test,church,,,,,',                                   // rejet: doublon dans le lot
  'Yao,Kofi,0700000004,kofi@x.ci,dept_test,inconnu,xxx,yyy,zzz,,Abidjan',                  // ok mais enums invalides -> défauts, commune non matchée -> gps undefined
].join('\n');

const res = importMembersFromCsv(csv, existing, busLines, 'church', now);
assert(res.total === 5, `total=5 (got ${res.total})`);
assert(res.members.length === 2, `2 membres acceptés (got ${res.members.length})`);
assert(res.errors.length === 3, `3 rejets (got ${res.errors.length})`);

const awa = res.members[0];
assert(awa.firstName === 'Awa' && awa.lastName === 'Traoré', 'accents préservés');
assert(awa.branch === 'light' && awa.level === 'boss' && awa.pastoralCursus === 'serviteur', 'enums valides mappés');
assert(awa.baptismStatus === 'baptise' && awa.gender === 'F', 'baptême + sexe mappés');
assert(awa.entryDate === '2026-07-21', 'entryDate = now injecté');
assert(awa.gps?.lat === 5.36 && awa.gps?.lng === -3.99, 'commune matchée -> gps du bus (pas un point fixe)');

const yao = res.members[1];
assert(yao.branch === 'church' && yao.level === 'stagiaire' && yao.pastoralCursus === 'aucun', 'enums invalides -> défauts');
assert(yao.gender === 'H', 'sexe absent -> défaut H');
assert(yao.gps === undefined, 'commune non matchée -> gps undefined, pas de repli fixe');

// ids uniques dans le lot
assert(new Set(res.members.map(m => m.id)).size === res.members.length, 'ids uniques');

// rejets bien lignés (2-indexé après en-tête)
assert(res.errors.some(e => e.line === 3 && /obligatoire/i.test(e.reason)), 'ligne 3 = champ requis');
assert(res.errors.some(e => e.line === 4 && /déjà présent/i.test(e.reason)), 'ligne 4 = doublon existant');
assert(res.errors.some(e => e.line === 5 && /déjà présent/i.test(e.reason)), 'ligne 5 = doublon lot');

console.log('csvImport.check OK');
