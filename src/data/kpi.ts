// Pure KPI/period helpers reused across dashboards (Accueil, Ministères, Bloom Bus…).
import { Member } from '../types';

export type Period = 'week' | 'month' | 'year' | 'custom';

// Rolling windows back from `now` — matches the spec's "≤ 1 mois" style thresholds.
// ponytail: rolling days, not calendar boundaries. Switch to start-of-month etc.
// if the commanditaire asks for calendar periods.
const WINDOW_DAYS: Record<Exclude<Period, 'custom'>, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export function periodRange(period: Period, now: Date = new Date()): { from: Date; to: Date } {
  if (period === 'custom') return { from: new Date(0), to: now };
  const from = new Date(now);
  from.setDate(from.getDate() - WINDOW_DAYS[period]);
  return { from, to: now };
}

// Health level 1..5 (Très faible → Très bon) → 0..100 % for radar/health widgets.
export function levelToPercent(level: number): number {
  return Math.round(((Math.max(1, Math.min(5, level)) - 1) / 4) * 100);
}

// The level (1..5) where the most members fall, on a given health axis.
// Used by the Accueil "un smiley par critère" row.
export function dominantHealthLevel(members: Member[], axis: keyof Member['healthKPIs']): number {
  if (members.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const m of members) {
    const v = m.healthKPIs[axis];
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [level, count] of counts) {
    if (count > bestCount) {
      best = level;
      bestCount = count;
    }
  }
  return best;
}
