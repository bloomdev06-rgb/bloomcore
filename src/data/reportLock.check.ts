// Check du verrou 24h des rapports Bloom Bus. Lancer : npx tsx src/data/reportLock.check.ts
import assert from 'node:assert';
import { isBusReportLocked } from './reportLock.ts';
import type { Report } from '../types';

const base = {
  id: 'r1', authorId: 'm1', authorName: 'T', authorRole: 'Capitaine de Bus',
  targetBranch: 'church', date: '2026-07-01', confidential: false, content: {},
} as unknown as Report;
const bus = (extra: Partial<Report>): Report => ({ ...base, reportType: 'rapport_bloom_bus_member', ...extra } as Report);

const now = new Date('2026-07-15T12:00:00');
const h = (n: number) => new Date(now.getTime() - n * 3600_000).toISOString();

// Rempli il y a 2h → modifiable ; il y a 25h → verrouillé.
assert.equal(isBusReportLocked(bus({ filledAt: h(2) }), now), false);
assert.equal(isBusReportLocked(bus({ filledAt: h(25) }), now), true);
// Validation récente rouvre la fenêtre même si le remplissage est ancien.
assert.equal(isBusReportLocked(bus({ filledAt: h(48), validatedAt: h(3) }), now), false);
assert.equal(isBusReportLocked(bus({ filledAt: h(48), validatedAt: h(30) }), now), true);
// Rapport legacy sans horodatage : fallback fin du jour de `date`.
assert.equal(isBusReportLocked(bus({ date: '2026-07-01' }), now), true);
assert.equal(isBusReportLocked(bus({ date: '2026-07-14' }), now), false);
// Les autres types de rapport ne sont jamais verrouillés par cette règle.
assert.equal(isBusReportLocked({ ...base, reportType: 'rapport_culte', date: '2026-01-01' } as Report, now), false);

console.log('reportLock.check OK');
