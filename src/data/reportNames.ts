// Libellés d'affichage des types de rapport (source unique — utilisé par ReportsView
// et le journal d'audit dans App.tsx pour ne jamais montrer la clé snake_case brute).
export const REPORT_NAMES: Record<string, string> = {
  rapport_service: 'Rapport de Service Hebdomadaire',
  rapport_rsa: "Rapport de Suivi d'Actions (RSA)",
  rapport_bloom_bus_member: 'Évaluation de Santé Spirituelle',
  rapport_bloom_bus_life: "Rapport d'Activité Bloom Bus",
  rapport_adn: 'Comptage ADN Nouveaux & OJ',
  rapport_portiers: 'Comptage Affluence Portiers',
  rapport_culte: 'Synthèse de Culte Complète',
  rapport_pastoral: 'Évaluation Confidentielle du Cursus',
  rapport_activite: "Rapport d'activité (département)",
  rapport_suivi_coach: 'Suivi Coach',
  rapport_observation: 'Observation',
};

export const reportName = (t: string): string => REPORT_NAMES[t] ?? t;
