// Dashboard ADN — synthèse des Nouveaux & OJ reçus par culte/événement, sur une période.
// Deux sources volontairement distinctes (pas d'addition entre elles, sinon double comptage) :
// - le comptage officiel saisi par l'ADN (rapport_adn, content.nouveauxHommes/Femmes + ojHommes/Femmes) ;
// - les fiches d'accueil individuelles (Member.receivedEventId, ojFlag).
// Pur, partagé — style maison src/data/*.
import type { Member, Report, Event } from '../types';
import { PeriodInput, periodRange } from './kpi';

export interface AdnEventRow {
  key: string; // id d'Event, ou 'autre' (hors cadre + fiches d'avant receivedEventId)
  title: string;
  date?: string;
  countNouveaux: number; // comptage rapport_adn
  countOj: number;
  ficheNouveaux: number; // fiches d'accueil individuelles
  ficheOj: number;
}

export function adnByEvent(
  members: Member[],
  reports: Report[],
  events: Event[],
  period: PeriodInput,
  now: Date = new Date(),
): AdnEventRow[] {
  const { from, to } = periodRange(period, now);
  const inPeriod = (d?: string) => !!d && new Date(d) >= from && new Date(d) <= to;
  const todayIso = now.toISOString().split('T')[0];

  const rows = new Map<string, AdnEventRow>();
  const rowFor = (key: string, title: string, date?: string): AdnEventRow => {
    let r = rows.get(key);
    if (!r) {
      r = { key, title, date, countNouveaux: 0, countOj: 0, ficheNouveaux: 0, ficheOj: 0 };
      rows.set(key, r);
    }
    return r;
  };
  const eventById = new Map(events.map((e) => [e.id, e]));

  // Les événements déroulés de la période (même sans aucun nouveau — la ligne à 0 est une info).
  for (const e of events) {
    if (e.date <= todayIso && inPeriod(e.date)) rowFor(e.id, e.title, e.date);
  }

  // Comptages officiels rapport_adn, rattachés à leur événement. Un eventId orphelin
  // (événement purgé/remplacé) retombe dans « Autre » plutôt que d'afficher un id brut.
  for (const r of reports) {
    if (r.reportType !== 'rapport_adn' || !inPeriod(r.date)) continue;
    const ev = r.eventId ? eventById.get(r.eventId) : undefined;
    const row = rowFor(ev ? r.eventId! : 'autre', ev?.title ?? 'Autre', ev?.date);
    row.countNouveaux += Number(r.content?.nouveauxHommes ?? 0) + Number(r.content?.nouveauxFemmes ?? 0);
    row.countOj += Number(r.content?.ojHommes ?? 0) + Number(r.content?.ojFemmes ?? 0);
  }

  // Fiches d'accueil individuelles. Sans receivedEventId (fiches d'avant ce champ, ou reçu
  // hors cadre) → bucket 'autre'.
  for (const m of members) {
    const d = m.integrationDateRegistered || m.entryDate;
    if (!m.integrationDateRegistered && m.level !== 'Nouveau') continue; // pas une fiche d'accueil
    if (!inPeriod(d)) continue;
    const key = m.receivedEventId && eventById.has(m.receivedEventId) ? m.receivedEventId : 'autre';
    const ev = eventById.get(key);
    const row = rowFor(key, ev?.title ?? 'Autre', ev?.date);
    if (m.ojFlag) row.ficheOj += 1;
    else row.ficheNouveaux += 1;
  }

  // Ligne « Autre » nommée proprement + tri : événements récents d'abord, « Autre » en dernier.
  const autre = rows.get('autre');
  if (autre) autre.title = 'Autre (hors culte/événement)';
  return Array.from(rows.values()).sort((a, b) => {
    if (a.key === 'autre') return 1;
    if (b.key === 'autre') return -1;
    return (b.date ?? '').localeCompare(a.date ?? '');
  });
}
