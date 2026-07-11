// Complétude de rapport par semaine calendaire (pastilles + widgets) — concern distinct de
// kpi.ts (pas de fenêtre glissante, relation hiérarchique via scope.ts).
import { Member, Report, BloomBusEntity, Department } from '../types';
import { reportingWindow, weekId } from './week';
import { directReportsOf, bloomBusRoleOf } from './scope';

function hasReportForWeek(targetId: string, weekOf: string, reports: Report[]): boolean {
  return reports.some(
    (r) => r.reportType === 'rapport_bloom_bus_member' && r.content?.memberId === targetId && (r.weekOf ?? weekId(r.date)) === weekOf,
  );
}

// Pastille roster : vert si S-1 et S-2 remplis, orange si un seul, rouge si aucun.
export function memberReportStatus(targetId: string, reports: Report[], now: Date = new Date()): 'red' | 'orange' | 'green' {
  const { s1, s2 } = reportingWindow(now);
  const count = (hasReportForWeek(targetId, s1, reports) ? 1 : 0) + (hasReportForWeek(targetId, s2, reports) ? 1 : 0);
  return count === 2 ? 'green' : count === 1 ? 'orange' : 'red';
}

// Widget "tous les membres de ce roster ont-ils un rapport pour cette semaine ?".
export function weekFillWidget(rosterIds: string[], weekOf: string, reports: Report[]): { filled: number; total: number; ok: boolean } {
  const filledIds = new Set(
    reports
      .filter((r) => r.reportType === 'rapport_bloom_bus_member' && (r.weekOf ?? weekId(r.date)) === weekOf && rosterIds.includes(r.content?.memberId))
      .map((r) => r.content.memberId as string),
  );
  return { filled: filledIds.size, total: rosterIds.length, ok: rosterIds.length > 0 && filledIds.size === rosterIds.length };
}

// Disque cliquable niveau bus (Capitaine) — parmi les membres du roster direct (pas de
// sous-hiérarchie à ce niveau, donc pas de subordinateFillRate), qui a un rapport pour `weekOf`.
export function rosterFillDetail(rosterIds: string[], weekOf: string, reports: Report[]): { pct: number; filled: string[]; missing: string[] } {
  const filled: string[] = [];
  const missing: string[] = [];
  for (const id of rosterIds) {
    (hasReportForWeek(id, weekOf, reports) ? filled : missing).push(id);
  }
  const pct = rosterIds.length ? Math.round((filled.length / rosterIds.length) * 100) : 0;
  return { pct, filled, missing };
}

// Disque cliquable : parmi les subordonnés directs de `operator`, quelle proportion a
// elle-même entièrement rempli les rapports de SON propre roster pour `weekOf` — ex. pour
// un Responsable de Zone, quels Capitaines ont fini le rapport de tous leurs membres.
export function subordinateFillRate(
  operator: Member,
  role: string,
  members: Member[],
  reports: Report[],
  busLines: BloomBusEntity[],
  departments: Department[],
  weekOf: string,
): { pct: number; filled: string[]; missing: string[] } {
  const directs = directReportsOf(operator, role, members, busLines, departments);
  const filled: string[] = [];
  const missing: string[] = [];
  for (const d of directs) {
    const subRoster = directReportsOf(d, bloomBusRoleOf(d, departments) ?? '', members, busLines, departments).map((m) => m.id);
    const widget = weekFillWidget(subRoster, weekOf, reports);
    (widget.ok ? filled : missing).push(d.id);
  }
  const pct = directs.length ? Math.round((filled.length / directs.length) * 100) : 0;
  return { pct, filled, missing };
}
