// packages/shared — source de vérité des enums du domaine (ARCHITECTURE_TECHNIQUE.md §3),
// importée par le front (src/) ET l'API (server/). Voir la feuille de route archi-cible.
//
// ⚠️ VALEURS ACTUELLES (telles que stockées aujourd'hui), pas encore celles du doc cible.
// La convergence vers le snake_case FR du §3 (ex. 'Nouveau' → 'nouveau') est une MIGRATION
// DE DONNÉES planifiée (jalon M5) : elle se fera ICI, en un seul endroit, le jour venu.
// Tant qu'on n'y est pas, ces listes reflètent le réel pour ne rien casser en prod.

// Types de rapport — déjà en snake_case, identiques au doc cible §3. On les nomme enfin
// (l'union était inline et anonyme dans types.ts).
export const REPORT_TYPES = [
  'rapport_service',
  'rapport_rsa',
  'rapport_bloom_bus_member',
  'rapport_bloom_bus_life',
  'rapport_adn',
  'rapport_portiers',
  'rapport_culte',
  'rapport_pastoral',
  'rapport_activite',
  'rapport_suivi_coach',
  'rapport_observation',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
