// Semaine calendaire lundi → dimanche. Remplace les fenêtres glissantes de kpi.ts pour
// tout ce qui concerne "la semaine" : saisie de rapport, affichage, verrouillage S-1/S-2.
// ponytail: dates 'YYYY-MM-DD' parsées en composants locaux (pas new Date(string), qui
// parse en UTC minuit et peut décaler le jour de semaine d'un jour selon le fuseau).

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=dimanche..6=samedi
  const diff = (day + 6) % 7; // jours écoulés depuis lundi
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - diff);
  return m;
}

// Id canonique d'une semaine = date du lundi, 'YYYY-MM-DD'.
export function weekId(d: Date | string): string {
  return fmt(mondayOf(typeof d === 'string' ? parseDateOnly(d) : d));
}

export function weekOffset(id: string, n: number): string {
  const d = parseDateOnly(id);
  d.setDate(d.getDate() + n * 7);
  return fmt(mondayOf(d));
}

export function weekLabel(id: string): string {
  const monday = parseDateOnly(id);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  return `Semaine du ${monday.toLocaleDateString('fr-FR', opts)} au ${sunday.toLocaleDateString('fr-FR', opts)}`;
}

// Semaine S = celle de `now` (en cours, pas encore terminée → jamais saisissable).
// S-1/S-2 = les deux seules semaines ouvertes à la saisie ; au-delà, verrouillé.
export function reportingWindow(now: Date = new Date()): { current: string; s1: string; s2: string } {
  const current = weekId(now);
  return { current, s1: weekOffset(current, -1), s2: weekOffset(current, -2) };
}

export function isWeekFillable(id: string, now: Date = new Date()): boolean {
  const { s1, s2 } = reportingWindow(now);
  return id === s1 || id === s2;
}
