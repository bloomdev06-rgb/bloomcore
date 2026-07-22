// Couleur de domaine par onglet — jeton d'icône coloré (revue design 2026-07, Move 2).
// Chaque onglet appartient à une famille sémantique, une couleur par famille (pas une
// couleur par onglet : repérage, pas sapin de Noël). Fushia est réservé à la branche
// Bloom Light — volontairement absent de la nav pour ne pas heurter l'accent de branche.
//
// ponytail: classes Tailwind LITTÉRALES (jamais de `text-bc-${x}` concaténé) — le JIT
// v4 ne scanne que des chaînes complètes, une concat serait purgée en prod.
export interface DomainStyle {
  /** couleur pleine du trait d'icône */ icon: string;
  /** fond teinté du jeton (~12-20%) */ tint: string;
}

const FAMILY: Record<string, DomainStyle> = {
  overview: { icon: 'text-bc-green',     tint: 'bg-bc-green/10' },      // Accueil, Rapports
  people:   { icon: 'text-bc-cerulean',  tint: 'bg-bc-cerulean/15' },  // Membres, Ministères, Départements
  souls:    { icon: 'text-bc-gold',      tint: 'bg-bc-gold/15' },      // Intégration, ADN, Baptême
  field:    { icon: 'text-bc-turquoise', tint: 'bg-bc-turquoise/15' }, // Bus, Cultes, Rapport culte, Dénombrement
  learning: { icon: 'text-bc-anis',      tint: 'bg-bc-anis/20' },      // Cursus, Formations
  projects: { icon: 'text-bc-orange',    tint: 'bg-bc-orange/15' },    // Projets
  admin:    { icon: 'text-bc-purple',    tint: 'bg-bc-purple/10' },    // Permissions, Comptes, Config, FormBuilder, Audit
};

const TAB_FAMILY: Record<string, keyof typeof FAMILY> = {
  dashboard: 'overview', reports: 'overview',
  members: 'people', ministeres: 'people', departments: 'people',
  integration: 'souls', adn: 'souls', programs: 'souls',
  bloombus: 'field', events: 'field', rapportculte: 'field', denombrement: 'field',
  cursus: 'learning', formations: 'learning',
  projects: 'projects',
  permissions: 'admin', accounts: 'admin', settings: 'admin', formbuilder: 'admin', audit: 'admin',
};

/** Style du jeton d'icône pour un onglet (fallback : vert socle). */
export function domainStyle(tabId: string): DomainStyle {
  return FAMILY[TAB_FAMILY[tabId] ?? 'overview'];
}
