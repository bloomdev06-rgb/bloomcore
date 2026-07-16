// Check du nommage des cultes + chevauchement + génération canonique.
import assert from 'node:assert';
import { sundayName, eventsOverlap, buildCanonicalEvents } from './events.ts';

// Juillet 2026 : dimanches 5, 12, 19, 26 (4 dimanches).
assert.equal(sundayName('2026-07-05', 'church'), 'Bloom Sunday');
assert.equal(sundayName('2026-07-12', 'church'), 'Bloom Sunday');
assert.equal(sundayName('2026-07-19', 'church'), 'Super Sunday');
assert.equal(sundayName('2026-07-26', 'church'), 'Talk Show');
assert.equal(sundayName('2026-07-19', 'light'), 'Light Show');
assert.equal(sundayName('2026-07-26', 'light'), 'Super Sunday');
// Août 2026 : dimanches 2, 9, 16, 23, 30 (5 dimanches) — le 4e (23) retombe sur Bloom/Light Sunday.
assert.equal(sundayName('2026-08-16', 'church'), 'Super Sunday');
assert.equal(sundayName('2026-08-23', 'church'), 'Bloom Sunday');
assert.equal(sundayName('2026-08-30', 'church'), 'Talk Show');
assert.equal(sundayName('2026-08-23', 'light'), 'Light Sunday');
assert.equal(sundayName('2026-08-30', 'light'), 'Super Sunday');

// Chevauchement : même jour + plages qui s'intersectent + branches compatibles.
const ev = (time: string, endTime: string, branch: any = 'church', date = '2026-07-19') => ({ date, time, endTime, branch });
assert.equal(eventsOverlap(ev('07:00', '09:30'), ev('09:00', '10:00')), true);
assert.equal(eventsOverlap(ev('07:00', '09:30'), ev('09:30', '10:00')), false); // bord à bord = pas de conflit
assert.equal(eventsOverlap(ev('07:00', '09:30'), ev('08:00', '09:00', 'light')), false); // branches différentes
assert.equal(eventsOverlap(ev('07:00', '09:30'), ev('08:00', '09:00', 'global')), true); // global chevauche tout
assert.equal(eventsOverlap(ev('07:00', '09:30'), { ...ev('08:00', '09:00'), date: '2026-07-20' }), false);

// Génération canonique depuis un mercredi : 10 dimanches ×3 cultes (dont 2 passés pour
// que la GDC/les comptages aient des occurrences à remplir) + 10 vendredis + ≥2 Inside.
const now = new Date('2026-07-15T12:00:00');
const evs = buildCanonicalEvents(now, 8);
assert.equal(evs.filter((e) => e.id.startsWith('evt4_bc1_')).length, 10);
assert.equal(evs.filter((e) => e.id.startsWith('evt4_bl_')).length, 10);
assert.equal(evs.filter((e) => e.id.startsWith('evt4_bc2_')).length, 10);
assert.equal(evs.filter((e) => e.id.startsWith('evt4_8020_')).length, 10);
assert.ok(evs.filter((e) => e.id.startsWith('evt4_inside_')).length >= 2);
// Des occurrences passées existent (dimanches 05/07 et 12/07).
assert.ok(evs.some((e) => e.id === 'evt4_bc1_2026-07-12'));
assert.equal(evs.find((e) => e.id === 'evt4_bc1_2026-07-12')!.title, 'Bloom Sunday — 1er culte');
// Premier dimanche généré = 2026-07-19 (Super Sunday) — les 2 cultes Church partagent le nom.
assert.equal(evs.find((e) => e.id === 'evt4_bc1_2026-07-19')!.title, 'Super Sunday — 1er culte');
assert.equal(evs.find((e) => e.id === 'evt4_bc2_2026-07-19')!.title, 'Super Sunday — 2e culte');
assert.equal(evs.find((e) => e.id === 'evt4_bl_2026-07-19')!.title, 'Light Show');
// Inside d'août = samedi 1er août, branche light.
const inside = evs.find((e) => e.id === 'evt4_inside_2026-08-01');
assert.ok(inside && inside.branch === 'light' && inside.time === '14:00' && inside.endTime === '17:00');
// 80/20 = vendredi, global.
const f = evs.find((e) => e.id === 'evt4_8020_2026-07-17');
assert.ok(f && f.branch === 'global' && f.time === '19:00' && f.endTime === '20:30');

console.log('events.check OK');
