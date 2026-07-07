// Pure KPI/period helpers reused across dashboards (Accueil, Ministères, Bloom Bus…).
import { Member, Project, Report } from '../types';

export type Period = 'week' | 'month' | 'quarter' | 'year' | 'custom';
// Une période nommée, ou un range explicite (option "Personnalisé" du sélecteur).
export type PeriodInput = Period | { from: Date; to: Date };

// Rolling windows back from `now` — matches the spec's "≤ 1 mois" style thresholds.
// ponytail: rolling days, not calendar boundaries. Switch to start-of-month etc.
// if the commanditaire asks for calendar periods.
const WINDOW_DAYS: Record<Exclude<Period, 'custom'>, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

export function periodRange(period: PeriodInput, now: Date = new Date()): { from: Date; to: Date } {
  if (typeof period === 'object') return period;
  if (period === 'custom') return { from: new Date(0), to: now };
  const from = new Date(now);
  from.setDate(from.getDate() - WINDOW_DAYS[period]);
  return { from, to: now };
}

// Fenêtre "membre actif" de l'Accueil : 1 mois + 1 semaine glissants par rapport à aujourd'hui,
// indépendante du sélecteur de période.
export function activeMemberWindow(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setDate(from.getDate() - 37);
  return { from, to: now };
}

// Health level 1..5 (Très faible → Très bon) → 0..100 % for radar/health widgets.
export function levelToPercent(level: number): number {
  return Math.round(((Math.max(1, Math.min(5, level)) - 1) / 4) * 100);
}

// The level (0..5) where the most values fall (mode). 0 = pas de donnée.
export function dominantLevel(values: number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
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

// The level (1..5) where the most members fall, on a given health axis.
export function dominantHealthLevel(members: Member[], axis: keyof Member['healthKPIs']): number {
  return dominantLevel(members.map((m) => m.healthKPIs[axis]));
}

// KPIS.md "au rouge" — deux clauses (D5) : (1) en attente de validation > 7j, OU
// (2) en cours d'intégration mais sans contact/suivi > 7j. L'horloge de la clause 2
// démarre à l'enregistrement et se réinitialise à chaque contact (lastContact).
export function isRed(m: Member, now: Date = new Date()): boolean {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const pendingTooLong =
    m.integrationState === 'En attente' &&
    !!m.integrationDateRegistered &&
    new Date(m.integrationDateRegistered).getTime() < cutoff;
  // Clause 2 : membre en pipeline (En attente/Suivi) dont le dernier contact remonte à > 7j.
  const followed = m.integrationState === 'En attente' || m.integrationState === 'Suivi';
  const lastTouch = m.lastContact || m.integrationDateRegistered;
  const staleContact = followed && !!lastTouch && new Date(lastTouch).getTime() < cutoff;
  return pendingTooLong || staleContact;
}

// KPIS.md §5 — T_mob_bus = (Σ présents au départ / Σ membres rattachés) × 100, sur la période.
// busIds accepts several ids so callers can scope by bus, zone ou commune (§5 aggrège pareil aux 3 niveaux).
// null = pas de donnée exploitable (aucun membre rattaché, ou aucun rapport de vie sur la période).
export function busMobilisationRate(
  members: Member[],
  reports: Report[],
  busIds: string[],
  period: Period,
  now: Date = new Date(),
): number | null {
  const { from } = periodRange(period, now);
  const rattaches = members.filter((m) => m.bloomBusId && busIds.includes(m.bloomBusId)).length;
  if (rattaches === 0) return null;
  let mobilises = 0;
  let count = 0;
  for (const r of reports) {
    if (r.reportType !== 'rapport_bloom_bus_life') continue;
    if (!busIds.includes(r.content?.busId)) continue;
    if (new Date(r.date) < from) continue;
    mobilises += Number(r.content?.mobilised ?? 0);
    count++;
  }
  if (count === 0) return null;
  return Math.round((mobilises / rattaches) * 100);
}

// KPIS.md §5/§4 — moisson (Bloom Bus + ADN), Σ nouveaux gagnés sur la période.
// busIds : scope Bloom Bus à un sous-ensemble de bus (zone/commune/bus). Sans busIds, agrège tout (vue globale/ministère) ;
// les rapports ADN n'ont pas d'attribution bus, donc ils ne comptent que dans l'agrégat global.
export function moissonTotal(reports: Report[], period: Period, now: Date = new Date(), busIds?: string[]): number {
  const { from } = periodRange(period, now);
  let total = 0;
  for (const r of reports) {
    if (new Date(r.date) < from) continue;
    if (busIds) {
      if (r.reportType === 'rapport_bloom_bus_life' && busIds.includes(r.content?.busId)) {
        total += Number(r.content?.moissonNouveaux ?? 0);
      }
      continue;
    }
    if (r.reportType === 'rapport_adn') {
      total += Number(r.content?.nouveauxHommes ?? 0) + Number(r.content?.nouveauxFemmes ?? 0);
    } else if (r.reportType === 'rapport_bloom_bus_life') {
      total += Number(r.content?.moissonNouveaux ?? 0);
    }
  }
  return total;
}

// KPIS.md §5 — visite : nombre de membres visités distincts (P2.8 — visitesRealisees est
// désormais la liste réelle des IDs de membres visités, plus un simple compte).
export function busVisitesTotal(reports: Report[], busIds: string[], period: Period, now: Date = new Date()): number {
  const { from } = periodRange(period, now);
  const visited = new Set<string>();
  for (const r of reports) {
    if (r.reportType !== 'rapport_bloom_bus_life') continue;
    if (!busIds.includes(r.content?.busId)) continue;
    if (new Date(r.date) < from) continue;
    const ids = r.content?.visitesRealisees;
    if (Array.isArray(ids)) ids.forEach((id: string) => visited.add(id));
  }
  return visited.size;
}

// Accueil — Bloom Bus actifs : bus ayant envoyé un rapport_bloom_bus_life sur ≥ 2 semaines
// distinctes de la période. ponytail: semaine = bucket epoch de 7 jours, pas ISO calendaire.
export function activeBusIds(reports: Report[], period: PeriodInput, now: Date = new Date()): Set<string> {
  const { from, to } = periodRange(period, now);
  const weeksByBus = new Map<string, Set<number>>();
  for (const r of reports) {
    if (r.reportType !== 'rapport_bloom_bus_life') continue;
    const d = new Date(r.date);
    if (d < from || d > to) continue;
    const busId = r.content?.busId;
    if (!busId) continue;
    const week = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
    if (!weeksByBus.has(busId)) weeksByBus.set(busId, new Set());
    weeksByBus.get(busId)!.add(week);
  }
  const ids = new Set<string>();
  for (const [busId, weeks] of weeksByBus) if (weeks.size >= 2) ids.add(busId);
  return ids;
}

// Définitions clés — "Membre actif" : a servi (rapport_service ou rapport_activite) sur la période.
// departmentId optionnel : omis → agrège tous les départements (Accueil §1) ; fourni → scope département (§4).
// ponytail: reste vide tant qu'aucun rapport n'est déposé pour ce scope — donnée réelle manquante, pas un bug
// (voir AUDIT-FRONTEND P1.3). rapport_activite n'a pas encore de constructeur de formulaire (P2, non branché) ;
// le check est déjà là pour ne rien casser une fois ce type produit avec le même content.presencesService.
// Dashboard sparklines — fenêtres hebdo glissantes, N dernières semaines.
function weekWindows(weeks: number, now: Date): { week: string; from: number; to: number }[] {
  const wins: { week: string; from: number; to: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = new Date(now);
    to.setDate(to.getDate() - i * 7);
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    wins.push({ week: to.toISOString().slice(0, 10), from: from.getTime(), to: to.getTime() });
  }
  return wins;
}

// Nombre de baptêmes physiques par semaine.
export function weeklyBaptismCounts(members: Member[], weeks: number = 8, now: Date = new Date()): { week: string; count: number }[] {
  return weekWindows(weeks, now).map(({ week, from, to }) => ({
    week,
    count: members.filter((m) => {
      if (!m.baptismDate) return false;
      const d = new Date(m.baptismDate).getTime();
      return d >= from && d < to;
    }).length,
  }));
}

// Membres actifs distincts par semaine (même définition que activeMemberIds).
export function weeklyActiveCounts(reports: Report[], weeks: number = 8, now: Date = new Date()): { week: string; count: number }[] {
  return weekWindows(weeks, now).map(({ week, from, to }) => {
    const ids = new Set<string>();
    for (const r of reports) {
      if (r.reportType !== 'rapport_service' && r.reportType !== 'rapport_activite') continue;
      const d = new Date(r.date).getTime();
      if (d < from || d >= to) continue;
      const list: string[] = Array.isArray(r.content?.presencesService) ? r.content.presencesService : [];
      list.forEach((id) => ids.add(id));
    }
    return { week, count: ids.size };
  });
}

// Moisson (ADN + Bloom Bus) par semaine (même définition que moissonTotal sans scope bus).
export function weeklyMoissonCounts(reports: Report[], weeks: number = 8, now: Date = new Date()): { week: string; count: number }[] {
  return weekWindows(weeks, now).map(({ week, from, to }) => {
    let count = 0;
    for (const r of reports) {
      const d = new Date(r.date).getTime();
      if (d < from || d >= to) continue;
      if (r.reportType === 'rapport_adn') {
        count += Number(r.content?.nouveauxHommes ?? 0) + Number(r.content?.nouveauxFemmes ?? 0);
      } else if (r.reportType === 'rapport_bloom_bus_life') {
        count += Number(r.content?.moissonNouveaux ?? 0);
      }
    }
    return { week, count };
  });
}

export function activeMemberIds(
  reports: Report[],
  period: PeriodInput,
  now: Date = new Date(),
  departmentId?: string,
): Set<string> {
  const { from, to } = periodRange(period, now);
  const ids = new Set<string>();
  for (const r of reports) {
    if (r.reportType !== 'rapport_service' && r.reportType !== 'rapport_activite') continue;
    if (departmentId && r.departmentId !== departmentId) continue;
    const d = new Date(r.date);
    if (d < from || d > to) continue;
    const list: string[] = Array.isArray(r.content?.presencesService) ? r.content.presencesService : [];
    list.forEach((id) => ids.add(id));
  }
  return ids;
}

// Accueil — split moisson ADN vs Bloom Bus sur la période (mêmes règles que moissonTotal sans scope bus).
export function moissonBySource(reports: Report[], period: PeriodInput, now: Date = new Date()): { adn: number; bus: number } {
  const { from, to } = periodRange(period, now);
  let adn = 0;
  let bus = 0;
  for (const r of reports) {
    const d = new Date(r.date);
    if (d < from || d > to) continue;
    if (r.reportType === 'rapport_adn') {
      adn += Number(r.content?.nouveauxHommes ?? 0) + Number(r.content?.nouveauxFemmes ?? 0);
    } else if (r.reportType === 'rapport_bloom_bus_life') {
      bus += Number(r.content?.moissonNouveaux ?? 0);
    }
  }
  return { adn, bus };
}

// Accueil "À traiter" — remontées avec suivi non traitées : observations en mode "suivi"
// + rapports de suivi coach, tant que content.traite n'est pas posé.
export function pendingFollowUps(reports: Report[]): Report[] {
  return reports.filter(
    (r) =>
      ((r.reportType === 'rapport_observation' && r.content?.mode === 'suivi') ||
        r.reportType === 'rapport_suivi_coach') &&
      !r.content?.traite,
  );
}

// Accueil — santé globale par critère, dérivée des rapport_bloom_bus_member de la période :
// dernier rapport par membre dans la fenêtre, puis niveau dominant par critère. 0 = pas de donnée.
export function periodHealthLevels(
  reports: Report[],
  period: PeriodInput,
  now: Date = new Date(),
): { spirituel: number; social: number; physique: number; financier: number; presenceCulte: number } {
  const { from, to } = periodRange(period, now);
  const latest = new Map<string, Report>();
  for (const r of reports) {
    if (r.reportType !== 'rapport_bloom_bus_member') continue;
    const d = new Date(r.date);
    if (d < from || d > to) continue;
    const memberId = r.content?.memberId;
    if (!memberId) continue;
    const prev = latest.get(memberId);
    if (!prev || new Date(prev.date) < d) latest.set(memberId, r);
  }
  const rows = [...latest.values()];
  const axis = (key: string) => dominantLevel(rows.map((r) => Number(r.content?.[key] ?? 0)));
  return {
    spirituel: axis('sprVal'),
    social: axis('socVal'),
    physique: axis('phyVal'),
    financier: axis('finVal'),
    presenceCulte: dominantLevel(
      rows.map((r) => Math.min(5, Array.isArray(r.content?.culteIds) ? r.content.culteIds.length : 0)),
    ),
  };
}

// Avancement d'un projet en % = objectifs cochés / total (0 si aucun objectif).
export function projectProgress(p: Project): number {
  const objs = p.objectives ?? [];
  if (objs.length === 0) return 0;
  return Math.round((objs.filter((o) => o.done).length / objs.length) * 100);
}
