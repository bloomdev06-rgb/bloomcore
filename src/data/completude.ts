// Complétude de rapport par semaine calendaire (pastilles + widgets) — concern distinct de
// kpi.ts (pas de fenêtre glissante, relation hiérarchique via scope.ts).
import { Member, Report, BloomBusEntity, Department } from '../types';
import { reportingWindow, weekId } from './week';
import { directReportsOf, bloomBusRoleOf } from './scope';

// Rapport d'un membre pour une semaine (ou undefined si aucun).
function reportForWeek(targetId: string, weekOf: string, reports: Report[]): Report | undefined {
  return reports.find(
    (r) => r.reportType === 'rapport_bloom_bus_member' && r.content?.memberId === targetId && (r.weekOf ?? weekId(r.date)) === weekOf,
  );
}

// Complétude = uniquement les rapports VALIDÉS. Un rapport « en attente » (validated === false)
// n'est PAS compté comme rempli (validated undefined = rétrocompat → validé).
function hasReportForWeek(targetId: string, weekOf: string, reports: Report[]): boolean {
  const r = reportForWeek(targetId, weekOf, reports);
  return !!r && r.validated !== false;
}

// Statut à trois états d'un rapport (membre, semaine), pour l'affichage à 2 cases devant le membre.
export function memberWeekStatus(targetId: string, weekOf: string, reports: Report[]): 'empty' | 'pending' | 'validated' {
  const r = reportForWeek(targetId, weekOf, reports);
  if (!r) return 'empty';
  return r.validated === false ? 'pending' : 'validated';
}

// Pastille roster : vert si S-1 et S-2 VALIDÉS, orange si un seul, rouge si aucun.
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

// Taux de remplissage RÉEL d'un ensemble de membres pour une semaine : proportion ayant
// SOUMIS un rapport (rempli = en attente OU validé). C'est la source unique des 2 disques et
// de la synthèse d'évolution — branché directement sur les rapports des membres du niveau
// affiché, donc bouge dès qu'un membre remplit et de nouveau quand un supérieur valide.
export function membersFillRate(
  memberIds: string[],
  weekOf: string,
  reports: Report[],
): { pct: number; filled: string[]; validated: string[]; pending: string[]; missing: string[] } {
  const validated: string[] = [];
  const pending: string[] = [];
  const missing: string[] = [];
  for (const id of memberIds) {
    const st = memberWeekStatus(id, weekOf, reports);
    if (st === 'validated') validated.push(id);
    else if (st === 'pending') pending.push(id);
    else missing.push(id);
  }
  const filled = [...validated, ...pending];
  const pct = memberIds.length ? Math.round((filled.length / memberIds.length) * 100) : 0;
  return { pct, filled, validated, pending, missing };
}

// Évolution du taux de remplissage semaine par semaine, sur les mêmes membres/rapports que les
// disques — pour la synthèse. Les semaines proviennent des rapports réellement présents (ordre
// chronologique), complétées par `extraWeeks` (ex. S-1/S-2) pour garantir les semaines courantes.
export function fillRateEvolution(
  memberIds: string[],
  reports: Report[],
  extraWeeks: string[] = [],
): { week: string; pct: number }[] {
  const ids = new Set(memberIds);
  const weeks = new Set<string>(extraWeeks);
  for (const r of reports) {
    if (r.reportType === 'rapport_bloom_bus_member' && ids.has(r.content?.memberId)) {
      weeks.add(r.weekOf ?? weekId(r.date));
    }
  }
  return Array.from(weeks)
    .sort()
    .map((w) => ({ week: w, pct: membersFillRate(memberIds, w, reports).pct }));
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
