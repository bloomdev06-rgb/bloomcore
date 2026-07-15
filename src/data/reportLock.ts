// Verrou d'édition des rapports Bloom Bus : un rapport rempli et/ou validé par le
// responsable n'est plus modifiable 24h après le dernier de ces deux événements.
// Pur et partagé client (BloomBusView) / serveur (rbac.assertCanWrite).
import type { Report } from '../types';

export const REPORT_LOCK_MS = 24 * 60 * 60 * 1000;

const BUS_REPORT_TYPES = ['rapport_bloom_bus_member', 'rapport_bloom_bus_life'];

// Dernier événement qui (r)ouvre la fenêtre d'édition : remplissage initial ou validation.
// Rapports d'avant filledAt : fin du jour de saisie (précision jour, généreuse).
export function reportLockAnchor(r: Report): number {
  const stamps = [r.filledAt, r.validatedAt]
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime())
    .filter((t) => !Number.isNaN(t));
  if (stamps.length) return Math.max(...stamps);
  return new Date(`${r.date}T23:59:59`).getTime();
}

export function isBusReportLocked(r: Report, now: Date = new Date()): boolean {
  if (!BUS_REPORT_TYPES.includes(r.reportType)) return false;
  return now.getTime() - reportLockAnchor(r) > REPORT_LOCK_MS;
}
