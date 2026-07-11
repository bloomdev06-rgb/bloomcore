// Run: npx tsx src/data/week.check.ts
import assert from 'node:assert';
import { mondayOf, weekId, weekLabel, weekOffset, reportingWindow, isWeekFillable } from './week';

// mondayOf — un mardi et un dimanche de la même semaine calendaire tombent sur le même lundi.
assert.equal(mondayOf(new Date(2026, 6, 8)).getTime(), new Date(2026, 6, 6).getTime()); // mer 8/7 -> lun 6/7
assert.equal(mondayOf(new Date(2026, 6, 12)).getTime(), new Date(2026, 6, 6).getTime()); // dim 12/7 -> lun 6/7
assert.equal(mondayOf(new Date(2026, 6, 6)).getTime(), new Date(2026, 6, 6).getTime()); // lun 6/7 -> lui-même

// weekId — dimanche appartient à la semaine de son lundi (pas celle du lundi suivant).
assert.equal(weekId('2026-07-12'), '2026-07-06');
assert.equal(weekId('2026-07-06'), '2026-07-06');
assert.equal(weekId('2026-07-13'), '2026-07-13');

// Frontière d'année.
assert.equal(weekId('2026-01-01'), '2025-12-29'); // jeudi 1/1/2026 -> lundi 29/12/2025

// weekLabel — dates réelles lundi->dimanche.
assert.equal(weekLabel('2026-07-06'), 'Semaine du 06/07 au 12/07');

// weekOffset.
assert.equal(weekOffset('2026-07-06', -1), '2026-06-29');
assert.equal(weekOffset('2026-07-06', -2), '2026-06-22');
assert.equal(weekOffset('2026-07-06', 1), '2026-07-13');

// reportingWindow / isWeekFillable — semaine en cours verrouillée, S-1/S-2 ouvertes, S-3 verrouillée.
const now = new Date(2026, 6, 8); // mercredi 8/7/2026, semaine en cours = lundi 6/7
const win = reportingWindow(now);
assert.equal(win.current, '2026-07-06');
assert.equal(win.s1, '2026-06-29');
assert.equal(win.s2, '2026-06-22');
assert.equal(isWeekFillable(win.current, now), false);
assert.equal(isWeekFillable(win.s1, now), true);
assert.equal(isWeekFillable(win.s2, now), true);
assert.equal(isWeekFillable('2026-06-15', now), false); // S-3, verrouillée

console.log('week.check OK');
