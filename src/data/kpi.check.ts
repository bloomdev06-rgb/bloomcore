// Run: npx tsx src/data/kpi.check.ts
import assert from 'node:assert';
import {
  periodRange, levelToPercent, dominantHealthLevel, isRed, busMobilisationRate,
  moissonTotal, moissonBySource, busVisitesTotal, busPresenceCulteTotal, busActivitesTotal, activeBusIds, activeMemberIds, Period,
  pendingFollowUps, periodHealthLevels, periodWindows,
} from './kpi';
import { Member, Report } from '../types';

// levelToPercent: 1→0%, 3→50%, 5→100%, clamps out-of-range
assert.equal(levelToPercent(1), 0);
assert.equal(levelToPercent(3), 50);
assert.equal(levelToPercent(5), 100);
assert.equal(levelToPercent(9), 100);

// periodRange: 'week' is the calendar week (Monday->now) containing `now`, not a rolling 7 days
const now = new Date(2026, 5, 30, 12); // mardi 30/6/2026
const wk = periodRange('week', now);
assert.equal(wk.to.getTime(), now.getTime());
assert.equal(wk.from.getTime(), new Date(2026, 5, 29).getTime()); // lundi 29/6
assert.equal((periodRange('custom' as Period, now)).from.getTime(), 0);

// dominantHealthLevel: returns the most common level on an axis
const mk = (spirituel: number): Member => ({ healthKPIs: { spirituel } } as Member);
assert.equal(dominantHealthLevel([mk(4), mk(4), mk(2)], 'spirituel'), 4);
assert.equal(dominantHealthLevel([], 'spirituel'), 0);

// isRed: true only past the 7-day threshold, false when the date field is missing (no crash)
const nowRed = new Date(2026, 5, 30, 12); // mardi 30/6/2026, en heure locale (semaine calendaire = lundi 29/6)
const mkMember = (over: Partial<Member> = {}): Member => ({
  integrationState: 'En attente',
  integrationDateRegistered: '2026-06-20',
  ...over,
} as Member);
assert.equal(isRed(mkMember(), nowRed), true); // En attente depuis 10j → clause 1
assert.equal(isRed(mkMember({ integrationDateRegistered: '2026-06-29' }), nowRed), false); // 1 jour
assert.equal(isRed(mkMember({ integrationDateRegistered: undefined }), nowRed), false); // pas de date
// D5 clause 2 — en suivi sans contact > 7j (horloge démarre à l'enregistrement, reset par lastContact)
assert.equal(isRed(mkMember({ integrationState: 'Suivi' }), nowRed), true); // enregistré 10j, jamais contacté
assert.equal(isRed(mkMember({ integrationState: 'Suivi', lastContact: '2026-06-28' }), nowRed), false); // contact il y a 2j → reset
assert.equal(isRed(mkMember({ integrationState: 'Suivi', lastContact: '2026-06-18' }), nowRed), true); // contact il y a 12j → stale
assert.equal(isRed(mkMember({ integrationState: 'Intégré' }), nowRed), false); // hors pipeline

// busMobilisationRate: (mobilisés / rattachés) x 100, null when no rattachés / no report in period
const busMembers: Member[] = [
  { bloomBusId: 'bus_1' } as Member,
  { bloomBusId: 'bus_1' } as Member,
];
const busReports: Report[] = [
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-29', content: { busId: 'bus_1', mobilised: 1 } } as Report,
];
assert.equal(busMobilisationRate(busMembers, busReports, ['bus_1'], 'week', nowRed), 50);
assert.equal(busMobilisationRate([], busReports, ['bus_1'], 'week', nowRed), null);
assert.equal(busMobilisationRate(busMembers, [], ['bus_1'], 'week', nowRed), null);

// busVisitesTotal / busPresenceCulteTotal: derived from rapport_bloom_bus_member (memberId
// scoped to busIds via Member.bloomBusId), not from the activity report.
const visitMembers: Member[] = [
  { id: 'mem_a', bloomBusId: 'bus_1' } as Member,
  { id: 'mem_b', bloomBusId: 'bus_1' } as Member,
  { id: 'mem_c', bloomBusId: 'bus_2' } as Member,
];
const visitReports: Report[] = [
  { reportType: 'rapport_bloom_bus_member', date: '2026-06-29', content: { memberId: 'mem_a', culte: '1er culte Bloom Church' } } as Report,
  { reportType: 'rapport_bloom_bus_member', date: '2026-06-29', content: { memberId: 'mem_b' } } as Report, // pas de culte renseigné
  { reportType: 'rapport_bloom_bus_member', date: '2026-06-29', content: { memberId: 'mem_c', culte: 'Culte Bloom Light' } } as Report,
];
assert.equal(busVisitesTotal(visitReports, visitMembers, ['bus_1'], 'week', nowRed), 2);
assert.equal(busVisitesTotal(visitReports, visitMembers, ['bus_1', 'bus_2'], 'week', nowRed), 3);
assert.equal(busPresenceCulteTotal(visitReports, visitMembers, ['bus_1'], 'week', nowRed), 1);
assert.equal(busPresenceCulteTotal(visitReports, visitMembers, ['bus_1', 'bus_2'], 'week', nowRed), 2);

// busActivitesTotal: un rapport_bloom_bus_life = une activité, compte de rapports par busIds/période
const lifeReports: Report[] = [
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-29', content: { busId: 'bus_1' } } as Report,
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-29', content: { busId: 'bus_2' } } as Report,
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-01', content: { busId: 'bus_1' } } as Report, // outside period
];
assert.equal(busActivitesTotal(lifeReports, ['bus_1'], 'week', nowRed), 1);
assert.equal(busActivitesTotal(lifeReports, ['bus_1', 'bus_2'], 'week', nowRed), 2);

// activeBusIds: bus ids with rapport_bloom_bus_life on ≥2 distinct weeks in the period
const weeklyBusReports: Report[] = [
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-29', content: { busId: 'bus_1' } } as Report,
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-15', content: { busId: 'bus_1' } } as Report, // other week
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-29', content: { busId: 'bus_2' } } as Report, // single week
];
assert.deepEqual([...activeBusIds(weeklyBusReports, 'month', nowRed)].sort(), ['bus_1']);
assert.deepEqual([...activeBusIds(weeklyBusReports, 'week', nowRed)], []); // 1 semaine dans la fenêtre → pas actif
assert.deepEqual([...activeBusIds(weeklyBusReports, 'month', new Date('2026-09-01'))], []); // reports predate the window

// moissonBySource: splits ADN vs Bus within the period
const split = moissonBySource(
  [
    { reportType: 'rapport_adn', date: '2026-06-29', content: { nouveauxHommes: 2, nouveauxFemmes: 3 } } as Report,
    { reportType: 'rapport_bloom_bus_life', date: '2026-06-29', content: { soulsWon: 4 } } as Report,
  ],
  'week',
  nowRed,
);
assert.deepEqual(split, { adn: 5, bus: 4 });

// pendingFollowUps: observations mode 'suivi' + rapports suivi coach non traités
const followReports: Report[] = [
  { id: 'r1', reportType: 'rapport_observation', date: '2026-06-29', content: { mode: 'suivi' } } as Report,
  { id: 'r2', reportType: 'rapport_observation', date: '2026-06-29', content: { mode: 'informatif' } } as Report,
  { id: 'r3', reportType: 'rapport_suivi_coach', date: '2026-06-29', content: { memberId: 'm1' } } as Report,
  { id: 'r4', reportType: 'rapport_suivi_coach', date: '2026-06-29', content: { memberId: 'm2', traite: true } } as Report,
];
assert.deepEqual(pendingFollowUps(followReports).map((r) => r.id), ['r1', 'r3']);

// periodHealthLevels: dominant per axis from the latest bus member report per member in window
const healthReports: Report[] = [
  { reportType: 'rapport_bloom_bus_member', date: '2026-06-28', content: { memberId: 'm1', sprVal: 2, socVal: 3, phyVal: 3, finVal: 1, culte: '1er culte Bloom Church' } } as Report,
  { reportType: 'rapport_bloom_bus_member', date: '2026-06-29', content: { memberId: 'm1', sprVal: 4, socVal: 3, phyVal: 3, finVal: 1, culte: '2e culte Bloom Church' } } as Report, // supersedes m1
  { reportType: 'rapport_bloom_bus_member', date: '2026-06-29', content: { memberId: 'm2', sprVal: 4, socVal: 5, phyVal: 2, finVal: 1, culte: null } } as Report,
];
assert.equal(periodHealthLevels(healthReports, 'week', nowRed).spirituel, 4);
assert.equal(periodHealthLevels([], 'week', nowRed).spirituel, 0);

// periodRange: accepts an explicit {from,to} range (période personnalisée)
const customRange = { from: new Date('2026-06-01'), to: new Date('2026-06-10') };
assert.deepEqual(periodRange(customRange, nowRed), customRange);
assert.deepEqual([...activeMemberIds(
  [{ reportType: 'rapport_service', date: '2026-06-29', content: { presencesService: ['m1'] } } as Report],
  customRange, nowRed,
)], []); // hors range custom

// moissonTotal: sums ADN (H+F) and bus-life moissonNouveaux within the period
const moissonReports: Report[] = [
  { reportType: 'rapport_adn', date: '2026-06-29', content: { nouveauxHommes: 2, nouveauxFemmes: 3 } } as Report,
  { reportType: 'rapport_bloom_bus_life', date: '2026-06-29', content: { soulsWon: 4 } } as Report,
  { reportType: 'rapport_adn', date: '2026-01-01', content: { nouveauxHommes: 100 } } as Report, // out of window
];
assert.equal(moissonTotal(moissonReports, 'week', nowRed), 9);

// activeMemberIds: dedups presencesService across matching reports in period; departmentId scopes, omitted = global
const deptReports: Report[] = [
  { reportType: 'rapport_service', departmentId: 'dept_x', date: '2026-06-29', content: { presencesService: ['mem_1', 'mem_2'] } } as Report,
  { reportType: 'rapport_service', departmentId: 'dept_x', date: '2026-06-29', content: { presencesService: ['mem_2', 'mem_3'] } } as Report, // même semaine calendaire (lundi 29/6) que le report précédent
  { reportType: 'rapport_service', departmentId: 'dept_y', date: '2026-06-29', content: { presencesService: ['mem_9'] } } as Report,
];
assert.deepEqual([...activeMemberIds(deptReports, 'week', nowRed, 'dept_x')].sort(), ['mem_1', 'mem_2', 'mem_3']);
assert.deepEqual([...activeMemberIds(deptReports, 'week', nowRed)].sort(), ['mem_1', 'mem_2', 'mem_3', 'mem_9']);

// periodWindows : hebdo sur les petites plages, mensuel sur l'année, clampé sur custom sans bornes.
{
  const wWeek = periodWindows('week', nowRed);
  assert.ok(wWeek.length >= 2 && wWeek.length <= 18, `week → ${wWeek.length} fenêtres`);
  assert.ok(wWeek.every((w) => w.to - w.from === 7 * 86_400_000), 'fenêtres hebdo de 7 jours');
  const wYear = periodWindows('year', nowRed);
  assert.ok(wYear.length >= 12 && wYear.length <= 13, `year → ${wYear.length} fenêtres mensuelles`);
  const wEpoch = periodWindows('custom', nowRed); // sans bornes → depuis epoch, doit être clampé
  assert.ok(wEpoch.length <= 24, `custom epoch clampé → ${wEpoch.length}`);
  // la dernière fenêtre contient bien now
  const last = periodWindows('month', nowRed).at(-1)!;
  assert.ok(nowRed.getTime() >= last.from && nowRed.getTime() < last.to, 'now dans la dernière fenêtre');
}

console.log('kpi.check OK');
