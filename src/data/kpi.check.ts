// Run: npx tsx src/data/kpi.check.ts
import assert from 'node:assert';
import { periodRange, levelToPercent, dominantHealthLevel, Period } from './kpi';
import { Member } from '../types';

// levelToPercent: 1→0%, 3→50%, 5→100%, clamps out-of-range
assert.equal(levelToPercent(1), 0);
assert.equal(levelToPercent(3), 50);
assert.equal(levelToPercent(5), 100);
assert.equal(levelToPercent(9), 100);

// periodRange: week window is 7 days back from now
const now = new Date('2026-06-30T12:00:00Z');
const wk = periodRange('week', now);
assert.equal(wk.to.getTime(), now.getTime());
assert.equal((now.getTime() - wk.from.getTime()) / 86_400_000, 7);
assert.equal((periodRange('custom' as Period, now)).from.getTime(), 0);

// dominantHealthLevel: returns the most common level on an axis
const mk = (spirituel: number): Member => ({ healthKPIs: { spirituel } } as Member);
assert.equal(dominantHealthLevel([mk(4), mk(4), mk(2)], 'spirituel'), 4);
assert.equal(dominantHealthLevel([], 'spirituel'), 0);

console.log('kpi.check OK');
