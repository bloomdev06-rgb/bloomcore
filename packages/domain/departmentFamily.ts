// Départements partagés entre branches — un familyId stable relie deux fiches Department
// (church + light) qui représentent le même département fonctionnel, sans jamais dépendre
// du nom. Utilisé par CreateDepartmentModal (création) et DepartmentsView (rattachement
// a posteriori de la branche manquante) pour éviter deux implémentations divergentes.
import type { Department, Branch } from './types';

interface DeptDraft {
  ministryId: string;
  type: Department['type'];
  description: string;
  specialFunction?: Department['specialFunction'];
}

export function buildDepartmentsForScope(
  scope: 'church' | 'light' | 'both',
  names: { church: string; light: string },
  draft: DeptDraft,
  now: number = Date.now(),
): Department[] {
  if (scope !== 'both') {
    return [{ id: `dept_${now}`, name: names[scope], branch: scope, ...draft }];
  }
  const familyId = `fam_${now}`;
  return [
    { id: `dept_${now}_ch`, name: names.church, branch: 'church', familyId, ...draft },
    { id: `dept_${now}_lt`, name: names.light, branch: 'light', familyId, ...draft },
  ];
}

// Ne modifie que familyId sur la fiche existante (retrofit si absente) — aucun autre champ
// (membres, sections, permissions) n'est touché.
export function linkMissingBranch(
  existing: Department,
  missingBranch: Branch,
  now: number = Date.now(),
): { updatedExisting: Department; linked: Department } {
  const familyId = existing.familyId ?? `fam_${now}`;
  return {
    updatedExisting: { ...existing, familyId },
    linked: {
      id: `dept_${now}`,
      name: existing.name,
      type: existing.type,
      ministryId: existing.ministryId,
      description: existing.description,
      specialFunction: existing.specialFunction,
      branch: missingBranch,
      familyId,
    },
  };
}
