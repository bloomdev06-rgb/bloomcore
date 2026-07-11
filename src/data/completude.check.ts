// Run: npx tsx src/data/completude.check.ts
import assert from 'node:assert';
import { memberReportStatus, weekFillWidget, subordinateFillRate } from './completude';
import type { Member, Report, BloomBusEntity, Department } from '../types';

const now = new Date(2026, 6, 8); // mercredi 8/7/2026 — S-1 = 2026-06-29, S-2 = 2026-06-22
const S1 = '2026-06-29';
const S2 = '2026-06-22';

function mkReport(memberId: string, weekOf: string): Report {
  return {
    id: `r_${memberId}_${weekOf}`,
    authorId: memberId,
    authorName: memberId,
    authorRole: 'Capitaine de Bus',
    targetBranch: 'church',
    date: weekOf,
    weekOf,
    reportType: 'rapport_bloom_bus_member',
    confidential: false,
    content: { memberId },
  };
}

// memberReportStatus — 0/1/2 rapports -> rouge/orange/vert.
assert.equal(memberReportStatus('m1', [], now), 'red');
assert.equal(memberReportStatus('m1', [mkReport('m1', S1)], now), 'orange');
assert.equal(memberReportStatus('m1', [mkReport('m1', S1), mkReport('m1', S2)], now), 'green');
// Rapport hors fenêtre S-1/S-2 ne compte pas.
assert.equal(memberReportStatus('m1', [mkReport('m1', '2026-06-01')], now), 'red');
// weekOf absent -> dérivé de `date`.
const legacy: Report = { ...mkReport('m1', S1), weekOf: undefined, date: '2026-06-30' };
assert.equal(memberReportStatus('m1', [legacy], now), 'orange');

// weekFillWidget — 4/5 rouge (ok=false), 5/5 vert (ok=true).
const roster5 = ['a', 'b', 'c', 'd', 'e'];
const reports4 = roster5.slice(0, 4).map((id) => mkReport(id, S1));
assert.deepEqual(weekFillWidget(roster5, S1, reports4), { filled: 4, total: 5, ok: false });
const reports5 = roster5.map((id) => mkReport(id, S1));
assert.deepEqual(weekFillWidget(roster5, S1, reports5), { filled: 5, total: 5, ok: true });
assert.equal(weekFillWidget([], S1, []).ok, false);

// subordinateFillRate — un Responsable de Zone (operator) a 2 Capitaines directs ; un a
// rempli tout son roster de membres pour S1, l'autre non.
const busLines: BloomBusEntity[] = [
  { id: 'bus_a', name: 'Bus A', commune: 'C1', zone: 'Z1', centerLat: 0, centerLng: 0 },
  { id: 'bus_b', name: 'Bus B', commune: 'C1', zone: 'Z1', centerLat: 0, centerLng: 0 },
];
const bbDept: Department = { id: 'dept_bloom_bus', name: 'Bloom Bus', type: 'spécial', ministryId: 'min_1', description: '', specialFunction: 'bloom_bus' };
const departments: Department[] = [bbDept];

function mkMember(id: string, role: string | undefined, bloomBusId?: string): Member {
  return {
    id, lastName: id, firstName: id, phone: '', email: '', gender: 'H', birthDate: '2000-01-01',
    maritalStatus: 'Célibataire', profession: '', entryDate: '2020-01-01', branch: 'church',
    level: 'Nouveau', pastoralCursus: 'Aucun',
    departments: role ? { [bbDept.id]: role as any } : {},
    bloomBusId,
    healthKPIs: { spirituel: 0, social: 0, financier: 0, physique: 0, presenceCulte: 0, presenceService: 0 },
    baptismStatus: 'Non baptisé',
  };
}

const zoneLead = mkMember('zoneLead', 'Responsable de Zone', 'bus_a'); // bloomBusId sert à résoudre la zone (même convention que busInScope)
const capA = mkMember('capA', 'Capitaine de Bus', 'bus_a');
const capB = mkMember('capB', 'Capitaine de Bus', 'bus_b');
const memA1 = mkMember('memA1', undefined, 'bus_a');
const memA2 = mkMember('memA2', undefined, 'bus_a');
const memB1 = mkMember('memB1', undefined, 'bus_b');
const memB2 = mkMember('memB2', undefined, 'bus_b');
const members = [zoneLead, capA, capB, memA1, memA2, memB1, memB2];

const reports = [mkReport('memA1', S1), mkReport('memA2', S1)]; // bus_a complet, bus_b vide

const rate = subordinateFillRate(zoneLead, 'Responsable de Zone', members, reports, busLines, departments, S1);
assert.equal(rate.pct, 50);
assert.deepEqual(rate.filled.sort(), ['capA']);
assert.deepEqual(rate.missing.sort(), ['capB']);

console.log('completude.check OK');
