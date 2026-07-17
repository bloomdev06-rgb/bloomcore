// Nom d'opérateur par défaut (#10) — valeur temporaire tant que l'authentification n'est pas
// branchée à l'UI. Centralisée ici : quand l'auth arrivera, un seul point à retirer au lieu
// de ~14 duplications. `operatorDisplayName` dédoublonne aussi le ternaire prénom+nom.
export const DEFAULT_OPERATOR_NAME = 'Affeny Grah';

export function operatorDisplayName(op?: { firstName: string; lastName: string } | null): string {
  return op ? `${op.firstName} ${op.lastName}` : DEFAULT_OPERATOR_NAME;
}
