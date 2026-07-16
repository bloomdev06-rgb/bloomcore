// Événements canoniques de l'église + règles de nommage et de chevauchement.
// Pur, partagé client/serveur (seeds, EventsView, réconciliation).
import type { Event, Branch } from '../types';

// ---- Nommage des cultes du dimanche selon le rang du dimanche dans le mois ----
// Church : 1er-2e dimanche = Bloom Sunday · 3e = Super Sunday · DERNIER = Talk Show.
// Light  : 1er-2e = Light Sunday · 3e = Light Show · DERNIER = Super Sunday.
// Mois à 5 dimanches : le 4e (ni 3e ni dernier) retombe sur Bloom/Light Sunday (validé).
export function sundayName(dateIso: string, branch: 'church' | 'light'): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const rank = Math.ceil(d / 7); // 1..5 — rang du dimanche dans le mois
  const daysInMonth = new Date(y, m, 0).getDate();
  const isLast = d + 7 > daysInMonth;
  if (branch === 'church') {
    if (isLast) return 'Talk Show';
    if (rank === 3) return 'Super Sunday';
    return 'Bloom Sunday';
  }
  if (isLast) return 'Super Sunday';
  if (rank === 3) return 'Light Show';
  return 'Light Sunday';
}

// ---- Chevauchement horaire (même jour, même branche ou l'un des deux global) ----
// Un événement sans horaire ne chevauche rien (on ne devine pas).
export function eventsOverlap(a: Pick<Event, 'date' | 'time' | 'endTime' | 'branch'>, b: Pick<Event, 'date' | 'time' | 'endTime' | 'branch'>): boolean {
  if (a.date !== b.date) return false;
  if (a.branch !== 'global' && b.branch !== 'global' && a.branch !== b.branch) return false;
  if (!a.time || !b.time) return false;
  const end = (e: { time?: string; endTime?: string }) => e.endTime ?? '23:59'; // sans fin déclarée = bloque le reste de la journée
  return a.time < end(b) && b.time < end(a);
}

// ---- Génération du jeu canonique d'événements (seeds) ----
// Ids déterministes par date → reconcileMissingById insère les occurrences manquantes à
// chaque boot sans dupliquer, et l'horizon avance tout seul.
// Anciens événements seed (avant lot 4) — purgés des bases/localStorage existants.
export const isLegacySeedEventId = (id: string) => /^evt_[1-5]$/.test(id) || id.startsWith('evt_culte_');

const iso = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return d;
}

export function buildCanonicalEvents(now: Date = new Date(), weeksAhead = 8): Event[] {
  const out: Event[] = [];
  const base = { type: 'Culte', recurrence: 'weekly' as const, closed: false };
  // L'horizon démarre 2 semaines EN ARRIÈRE : les rapports (GDC, comptages ADN,
  // dénombrement) se remplissent après le culte — il faut des occurrences passées.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);

  // Dimanches : 2 cultes Church + 1 culte Light, nom selon le rang du dimanche.
  let sunday = nextWeekday(start, 0);
  for (let i = 0; i < weeksAhead + 2; i++) {
    const date = iso(sunday);
    const churchTitle = sundayName(date, 'church');
    const lightTitle = sundayName(date, 'light');
    out.push(
      { ...base, id: `evt4_bc1_${date}`, title: `${churchTitle} — 1er culte`, date, time: '07:00', endTime: '09:30', branch: 'church', scope: 'church' },
      { ...base, id: `evt4_bl_${date}`, title: lightTitle, date, time: '10:00', endTime: '12:30', branch: 'light', scope: 'light' },
      { ...base, id: `evt4_bc2_${date}`, title: `${churchTitle} — 2e culte`, date, time: '13:00', endTime: '15:30', branch: 'church', scope: 'church' },
    );
    sunday.setDate(sunday.getDate() + 7);
  }

  // 80/20 : tous les vendredis, 19h00 → 20h30, les 2 branches (global).
  let friday = nextWeekday(start, 5);
  for (let i = 0; i < weeksAhead + 2; i++) {
    const date = iso(friday);
    out.push({ ...base, id: `evt4_8020_${date}`, title: '80/20', type: '80/20', date, time: '19:00', endTime: '20:30', branch: 'global', scope: 'both' });
    friday.setDate(friday.getDate() + 7);
  }

  // Inside : 1er samedi du mois, 14h00 → 17h00, Bloom Light uniquement.
  const months = Math.ceil(weeksAhead / 4);
  for (let i = 0; i <= months; i++) {
    const first = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const firstSaturday = nextWeekday(first, 6);
    if (firstSaturday < start) continue;
    const date = iso(firstSaturday);
    out.push({ ...base, id: `evt4_inside_${date}`, title: 'Inside', type: 'Inside', date, time: '14:00', endTime: '17:00', branch: 'light', scope: 'light', recurrence: 'monthly' });
  }

  return out;
}
