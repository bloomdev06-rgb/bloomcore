// Check du dashboard ADN par événement. Lancer : npx tsx src/data/adn.check.ts
import assert from 'node:assert';
import { adnByEvent } from './adn.ts';
import type { Member, Report, Event } from '../types';

const now = new Date('2026-07-15T12:00:00');
const ev = (id: string, date: string): Event => ({ id, title: id, type: 'Culte', date, branch: 'church', closed: false });
const nouveau = (id: string, date: string, extra: Partial<Member> = {}): Member =>
  ({ id, firstName: id, lastName: 'T', level: 'Nouveau', integrationDateRegistered: date, entryDate: date, branch: 'church', departments: {}, healthKPIs: {} , ...extra }) as unknown as Member;

const events = [ev('e1', '2026-07-12'), ev('e2', '2026-07-05'), ev('futur', '2026-08-01')];
const members = [
  nouveau('m1', '2026-07-12', { receivedEventId: 'e1' }),
  nouveau('m2', '2026-07-12', { receivedEventId: 'e1', ojFlag: true }),
  nouveau('m3', '2026-07-12', { receivedEventId: 'autre' }),
  nouveau('m4', '2026-07-05' /* legacy sans receivedEventId → autre */),
  nouveau('hors', '2026-01-01', { receivedEventId: 'e1' }), // hors période
];
const reports = [
  { id: 'r1', reportType: 'rapport_adn', date: '2026-07-12', eventId: 'e1', content: { nouveauxH: 3, nouveauxF: 2, ojH: 1, ojF: 1 } } as unknown as Report,
];

const rows = adnByEvent(members, reports, events, 'month', now);
const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

// e1 : comptage officiel + 1 fiche nouveau + 1 fiche OJ ; hors période exclu.
assert.equal(byKey.e1.countNouveaux, 5);
assert.equal(byKey.e1.countOj, 2);
assert.equal(byKey.e1.ficheNouveaux, 1);
assert.equal(byKey.e1.ficheOj, 1);
// e2 déroulé sans rien → ligne à zéro présente.
assert.equal(byKey.e2.countNouveaux + byKey.e2.ficheNouveaux, 0);
// futur (pas encore déroulé) → pas de ligne.
assert.equal(byKey.futur, undefined);
// autre = fiche 'autre' explicite + legacy sans receivedEventId, en dernière position.
assert.equal(byKey.autre.ficheNouveaux, 2);
assert.equal(rows.at(-1)!.key, 'autre');
// tri : e1 (12/07) avant e2 (05/07)
assert.ok(rows.findIndex((r) => r.key === 'e1') < rows.findIndex((r) => r.key === 'e2'));

console.log('adn.check OK');
