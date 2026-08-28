// Régression : « la fiche du membre indique bien Responsable du Département Bloom Bus, mais
// sa page d'accueil lui annonce "votre département (Bloom Praise)" — un département auquel il
// n'appartient à aucun moment ».
//
// dashboardScope testait ROLE_HOME_DEPT[role] EN PREMIER. Cette table est un vestige du mode
// démonstration (le panneau « Simuler profil » faisait semblant d'appartenir à un département
// assorti au rôle choisi) et elle écrasait les affectations réelles : ROLE_HOME_DEPT.Coach vaut
// dept_louange, dont le nom affiché est « Bloom Praise ». Conséquence au-delà du libellé, le
// tableau de bord entier était calculé sur ce département étranger — d'où des compteurs à zéro.
import assert from 'node:assert';
import { dashboardScope, ROLE_HOME_DEPT } from './scope.ts';
import { Department, Member } from './types.ts';

const dept = (id: string, name: string): Department =>
  ({ id, name, type: 'normal', ministryId: 'min_x', description: '' });

const DEPTS = [
  dept('dept_louange', 'Bloom Praise'),
  dept('dept_bloom_bus', 'Département Bloom Bus'),
  dept('dept_tech', 'Tech'),
];

const membre = (departments: Member['departments'], level = 'coach'): Member =>
  ({ id: 'm1', firstName: 'Cas', lastName: 'Signalé', branch: 'church', level, departments } as unknown as Member);

// La table de démonstration associe Coach → dept_louange (« Bloom Praise ») : c'est exactement
// ce que voyait le membre. Son département réel doit désormais l'emporter.
assert.equal(ROLE_HOME_DEPT.Coach, 'dept_louange', 'prérequis du test : la table associe bien Coach à Bloom Praise');

const responsableBus = membre({ dept_bloom_bus: 'responsable' });
const scope = dashboardScope(responsableBus, 'Coach', [responsableBus], [], DEPTS, []);
assert.deepEqual(
  scope.deptIds, ['dept_bloom_bus'],
  'le département RÉEL du membre doit primer sur la table codée en dur',
);
assert.equal(scope.label, 'Département Département Bloom Bus');

// Membre sans fonction « responsable » : on retient sa première affectation réelle,
// toujours pas la table.
const simpleMembre = membre({ dept_bloom_bus: 'membre' });
assert.deepEqual(
  dashboardScope(simpleMembre, 'Coach', [simpleMembre], [], DEPTS, []).deptIds,
  ['dept_bloom_bus'],
);

// Responsable d'un département ET membre d'un autre : la fonction de responsable gagne,
// quel que soit l'ordre des clés.
const double = membre({ dept_tech: 'membre', dept_bloom_bus: 'responsable' });
assert.deepEqual(
  dashboardScope(double, 'Coach', [double], [], DEPTS, []).deptIds,
  ['dept_bloom_bus'],
);

// Aucun département : la table reste le dernier recours, pour les profils de test.
const sansDept = membre({});
assert.deepEqual(
  dashboardScope(sansDept, 'Coach', [sansDept], [], DEPTS, []).deptIds,
  ['dept_louange'],
  'sans aucune affectation, le repli de démonstration reste utile',
);

// Le staff garde une portée globale, la table ne s'y applique pas.
assert.equal(dashboardScope(responsableBus, 'Pasteur', [responsableBus], [], DEPTS, []).deptIds, null);

console.log('dashboardScope.check OK');
