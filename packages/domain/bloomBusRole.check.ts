// Régression : « promu responsable du département Bloom Bus, mais l'application ne lui donne
// accès qu'à son propre bus ».
//
// bloomBusRoleOf prenait la PREMIÈRE instance bloom_bus de la liste des départements. Or ces
// départements existent en deux exemplaires, un par branche : un responsable rattaché à la
// seconde instance ressortait sans aucune fonction Bloom Bus, donc sans accès au module.
import assert from 'node:assert';
import { bloomBusRoleOf, bloomBusRolesOf, fullBloomBusAccess } from './scope.ts';
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

// --- Séparation DÉPARTEMENT Bloom Bus / MODULE Bloom Bus -----------------------------------
// Ce sont deux réalités distinctes qui partageaient un seul emplacement de stockage : être
// nommé capitaine effaçait la fonction tenue dans le département, et inversement. Depuis la
// séparation (Member.busRole), les deux coexistent.
const DEPT_SEUL = [AUTRE, dept('dept_bloom_bus')];
const avecBusRole = (departments: Member['departments'], busRole?: string): Member =>
  ({ id: 'm', departments, busRole, branch: 'church' } as unknown as Member);

// Adjoint DU DÉPARTEMENT, sans fonction territoriale : aucune portée dans le module.
assert.equal(bloomBusRoleOf(avecBusRole({ dept_bloom_bus: 'adjoint' }), DEPT_SEUL), undefined,
  'une fonction ordinaire du département n\'ouvre pas le module');

// Les deux à la fois — le cas devenu impossible avant la séparation.
assert.equal(
  bloomBusRoleOf(avecBusRole({ dept_bloom_bus: 'adjoint' }, 'capitaine'), DEPT_SEUL),
  'Capitaine de Bus',
  'adjoint du département ET capitaine du module doivent coexister',
);

// Capitaine SANS appartenir au département : la fonction territoriale suffit.
assert.equal(bloomBusRoleOf(avecBusRole({}, 'responsable_zone'), DEPT_SEUL), 'Responsable de Zone');

// LE PONT : responsable DU DÉPARTEMENT = sommet du module, sans busRole.
assert.equal(bloomBusRoleOf(avecBusRole({ dept_bloom_bus: 'responsable' }), DEPT_SEUL), 'Responsable');
// …et il l'emporte sur un busRole inférieur qu'il détiendrait aussi.
assert.equal(
  bloomBusRoleOf(avecBusRole({ dept_bloom_bus: 'responsable' }, 'capitaine'), DEPT_SEUL),
  'Responsable',
  'le pont prime sur une fonction territoriale plus basse',
);
const cumul = { ...avecBusRole({ dept_bloom_bus: 'responsable' }), busRoles: ['capitaine', 'responsable_zone'] } as Member;
assert.deepEqual(
  [...bloomBusRolesOf(cumul, DEPT_SEUL)].sort(),
  ['Capitaine de Bus', 'Responsable', 'Responsable de Zone'].sort(),
  'les fonctions territoriales cumulées restent toutes visibles même si Responsable pilote le périmètre',
);

// COMPATIBILITÉ : données d'avant la migration, fonction territoriale encore dans le
// département. Doit continuer d'ouvrir l'accès, sinon un responsable le perdrait entre le
// déploiement et la migration.
assert.equal(bloomBusRoleOf(avecBusRole({ dept_bloom_bus: 'responsable_commune' }), DEPT_SEUL),
  'Responsable de Commune', 'les données non encore migrées restent lisibles');

console.log('bloomBusRole.check (séparation département/module) OK');
