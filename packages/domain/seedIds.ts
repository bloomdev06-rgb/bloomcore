// Identifiants des événements de seed legacy (evt_1..5, evt_culte_*) — utilisé par le
// serveur (server/seed.ts, migration one-shot) et par le frontend (src/data/events.ts).
// Extrait de src/data/events.ts (Phase 1, T1.4) : c'est la seule fonction de ce fichier
// dont le serveur a besoin ; le reste d'events.ts reste côté front (logique de vue).
export const isLegacySeedEventId = (id: string): boolean =>
  /^evt_[1-5]$/.test(id) || id.startsWith('evt_culte_');
