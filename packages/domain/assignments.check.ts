// §26 — un Coach (et au-dessus) sert dans plusieurs départements, éventuellement dans les deux
// branches, avec une fonction différente à chaque fois. Les cinq cas demandés sont verrouillés
// ici, sur la fonction qui alimente l'affichage de la fiche membre.
import assert from 'node:assert';
import { memberAssignmentsByBranch } from './scope.ts';
import { Department, Member } from './types.ts';

const dept = (id: string, name: string, branch?: 'church' | 'light', familyId?: string): Department =>
  ({ id, name, type: 'normal', ministryId: 'min_x', description: '', branch, familyId });

// « Bloom Praise » et « Light Choir » sont le MÊME département fonctionnel dans les deux
// branches : deux enregistrements distincts reliés par familyId (cf. Department.familyId).
const DEPTS = [
  dept('praise_church', 'Bloom Praise', 'church', 'fam_louange'),
  dept('choir_light', 'Light Choir', 'light', 'fam_louange'),
  dept('tech_church', 'Prod & Tech', 'church'),
  dept('adn_church', 'ADN', 'church'),
];

const coach = (departments: Member['departments'], deptBranches?: Member['deptBranches']): Member =>
  ({ id: 'c1', firstName: 'Coach', lastName: '', branch: 'church', level: 'coach',
     departments, deptBranches } as unknown as Member);

// Cas 1 — plusieurs départements d'une MÊME branche.
{
  const g = memberAssignmentsByBranch(coach({ praise_church: 'responsable', tech_church: 'membre' }), DEPTS);
  assert.equal(g.church.length, 2, 'deux affectations dans Bloom Church');
  assert.equal(g.light.length, 0);
  assert.deepEqual(g.church.map((a) => a.name), ['Bloom Praise', 'Prod & Tech'], 'triées par nom');
}

// Cas 2 — départements DIFFÉRENTS dans Bloom Church et Bloom Light.
{
  const g = memberAssignmentsByBranch(
    coach({ tech_church: 'membre', choir_light: 'adjoint' }, { choir_light: 'light' }), DEPTS);
  assert.deepEqual(g.church.map((a) => a.name), ['Prod & Tech']);
  assert.deepEqual(g.light.map((a) => a.name), ['Light Choir']);
}

// Cas 3 — le MÊME département fonctionnel dans les deux branches (familyId commun).
{
  const g = memberAssignmentsByBranch(
    coach({ praise_church: 'responsable', choir_light: 'membre' }, { choir_light: 'light' }), DEPTS);
  assert.deepEqual(g.church.map((a) => a.name), ['Bloom Praise']);
  assert.deepEqual(g.light.map((a) => a.name), ['Light Choir']);
  assert.equal(g.church.length + g.light.length, 2, 'les deux coexistent, aucune n\'écrase l\'autre');
}

// Cas 4 — un rôle DIFFÉRENT selon le département et la branche.
{
  const g = memberAssignmentsByBranch(
    coach({ praise_church: 'responsable', choir_light: 'membre' }, { choir_light: 'light' }), DEPTS);
  assert.equal(g.church[0].fn, 'responsable', 'responsable côté Church');
  assert.equal(g.light[0].fn, 'membre', 'simple membre côté Light');
}

// Cas 5 — retirer UNE affectation laisse les autres intactes (ce que fait la fiche : on
// enlève une clé de la map, pas de reconstruction globale).
{
  const avant: Member['departments'] = { praise_church: 'responsable', tech_church: 'membre', adn_church: 'membre' };
  const { praise_church, ...apres } = avant; void praise_church;
  const g = memberAssignmentsByBranch(coach(apres), DEPTS);
  assert.deepEqual(g.church.map((a) => a.name), ['ADN', 'Prod & Tech']);
  assert.ok(!g.church.some((a) => a.name === 'Bloom Praise'), 'seule l\'affectation retirée disparaît');
}

// Un département supprimé ne fait pas disparaître l'affectation en silence : elle est
// signalée. C'est exactement le cas qui a rendu des promotions « invisibles » en production.
{
  const g = memberAssignmentsByBranch(coach({ dept_disparu: 'responsable' }), DEPTS);
  assert.equal(g.church.length, 1);
  assert.equal(g.church[0].missing, true, 'le département manquant doit être signalé');
  assert.equal(g.church[0].name, 'dept_disparu');
}

// Aucune affectation : trois groupes vides, jamais d'exception.
{
  const g = memberAssignmentsByBranch(coach({}), DEPTS);
  assert.deepEqual([g.church.length, g.light.length, g.global.length], [0, 0, 0]);
}

console.log('assignments.check OK');
