// Test du parser + import CSV membres. Lancé via `npm test` (tsx).
import { parseCsv, importMembersFromCsv } from './csvImport.ts';
import type { Member } from '../types.ts';

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

const now = new Date('2026-07-21T00:00:00Z');
const csv = [
  'nom,prenom,telephone,email,branche,niveau,cursus,bapteme,sexe',
  'Traoré,Awa,0700000002,awa@x.ci,light,boss,serviteur,baptise,F',   // ok, accents/enum
  'Koné,,0700000003,,church,,,,',                                     // rejet: prénom manquant
  'Doe,John,0700000001,,church,,,,',                                  // rejet: doublon existant
  'Doe,Jane,0700000002,,church,,,,',                                  // rejet: doublon dans le lot
  'Yao,Kofi,0700000004,,inconnu,xxx,yyy,zzz,',                        // ok mais enums invalides -> défauts
].join('\n');

const res = importMembersFromCsv(csv, existing, 'church', now);
assert(res.total === 5, `total=5 (got ${res.total})`);
assert(res.members.length === 2, `2 membres acceptés (got ${res.members.length})`);
assert(res.errors.length === 3, `3 rejets (got ${res.errors.length})`);

const awa = res.members[0];
assert(awa.firstName === 'Awa' && awa.lastName === 'Traoré', 'accents préservés');
assert(awa.branch === 'light' && awa.level === 'boss' && awa.pastoralCursus === 'serviteur', 'enums valides mappés');
assert(awa.baptismStatus === 'baptise' && awa.gender === 'F', 'baptême + sexe mappés');
assert(awa.entryDate === '2026-07-21', 'entryDate = now injecté');

const yao = res.members[1];
assert(yao.branch === 'church' && yao.level === 'stagiaire' && yao.pastoralCursus === 'aucun', 'enums invalides -> défauts');
assert(yao.gender === 'H', 'sexe absent -> défaut H');

// ids uniques dans le lot
assert(new Set(res.members.map(m => m.id)).size === res.members.length, 'ids uniques');

// rejets bien lignés (2-indexé après en-tête)
assert(res.errors.some(e => e.line === 3 && /obligatoire/i.test(e.reason)), 'ligne 3 = champ requis');
assert(res.errors.some(e => e.line === 4 && /déjà présent/i.test(e.reason)), 'ligne 4 = doublon existant');
assert(res.errors.some(e => e.line === 5 && /déjà présent/i.test(e.reason)), 'ligne 5 = doublon lot');

console.log('csvImport.check OK');
