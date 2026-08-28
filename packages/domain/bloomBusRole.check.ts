// Régression : « promu responsable du département Bloom Bus, mais l'application ne lui donne
// accès qu'à son propre bus ».
//
// bloomBusRoleOf prenait la PREMIÈRE instance bloom_bus de la liste des départements. Or ces
// départements existent en deux exemplaires, un par branche : un responsable rattaché à la
// seconde instance ressortait sans aucune fonction Bloom Bus, donc sans accès au module.
import assert from 'node:assert';
import { bloomBusRoleOf, fullBloomBusAccess } from './scope.ts';
import { Department, Member } from './types.ts';

const dept = (id: string, branch?: 'church' | 'light'): Department => ({
  id, name: `Bloom Bus ${branch ?? ''}`.trim(), type: 'special',
  specialFunction: 'bloom_bus', ministryId: 'min_expansion', description: '', branch,
});
const AUTRE: Department = {
  id: 'dept_louange', name: 'Bloom Praise', type: 'normal', ministryId: 'min_intimite', description: '',
};
const membre = (departments: Member['departments']): Member =>
  ({ id: 'm', departments, branch: 'light' } as unknown as Member);

// Deux instances, la branche du membre arrivant en SECOND : c'est le cas qui échouait.
const deuxInstances = [AUTRE, dept('bus_church', 'church'), dept('bus_light', 'light')];

assert.equal(
  bloomBusRoleOf(membre({ bus_light: 'responsable' }), deuxInstances),
  'Responsable',
  'un responsable de la 2e instance doit être reconnu',
);
assert.equal(
  fullBloomBusAccess(membre({ bus_light: 'responsable' }), 'Responsable', deuxInstances),
  true,
  'et obtenir l\'accès complet au module',
);

// Instance unique : comportement d'origine préservé.
assert.equal(
  bloomBusRoleOf(membre({ dept_bloom_bus: 'capitaine' }), [AUTRE, dept('dept_bloom_bus')]),
  'Capitaine de Bus',
);

// Fonction dans les DEUX instances : la plus forte l'emporte, quel que soit l'ordre.
assert.equal(
  bloomBusRoleOf(membre({ bus_church: 'capitaine', bus_light: 'responsable' }), deuxInstances),
  'Responsable',
);
assert.equal(
  bloomBusRoleOf(membre({ bus_church: 'responsable', bus_light: 'capitaine' }), deuxInstances),
  'Responsable',
);

// Aucune fonction Bloom Bus : rien, et surtout pas d'accès. Le cas signalé — responsable d'un
// AUTRE département — ne doit toujours pas ouvrir le module.
assert.equal(bloomBusRoleOf(membre({ dept_louange: 'responsable' }), deuxInstances), undefined);
assert.equal(
  fullBloomBusAccess(membre({ dept_louange: 'responsable' }), 'Responsable', deuxInstances),
  false,
  'être responsable d\'un autre département n\'ouvre pas le module Bloom Bus',
);

console.log('bloomBusRole.check OK');
