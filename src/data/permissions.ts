import { PermissionMatrix, Delegation } from '../types';

// Garde-fou : le Super Admin voit toujours tout (impossible de s'auto-verrouiller).
// Source unique — Sidebar.tsx (filtrage du nav) et App.tsx (re-validation au changement
// de rôle) doivent utiliser la même règle pour ne jamais diverger.
export function canView(permissionMatrix: PermissionMatrix, tabId: string, role: string): boolean {
  return role === 'Super Admin' || !!permissionMatrix[`view_${tabId}`]?.[role];
}

// §11.3 — une capacité déléguable (DELEGABLE_CAPS) est accordée si le rôle l'a nativement
// dans la matrice, OU si une délégation active cible cet opérateur précis (toId). Sans ce
// second membre, la console de délégation reste un formulaire sans effet (cf. audit B5).
export function hasCapability(
  permissionMatrix: PermissionMatrix,
  capability: string,
  role: string,
  operatorId: string | undefined,
  delegations: Delegation[],
): boolean {
  if (role === 'Super Admin' || !!permissionMatrix[capability]?.[role]) return true;
  return !!operatorId && delegations.some(d => d.right === capability && d.toId === operatorId);
}
