// §27 — qui peut attribuer une fonction Bloom Bus, et à qui.
//
// Le cahier des charges décrivait qui ÉVALUE qui (cascade des rapports) et qui VOIT quoi,
// mais jamais qui NOMME. Règles arbitrées le 28/08/2026 et verrouillées ici :
//   a. un responsable nomme dans son périmètre territorial ;
//   c. uniquement STRICTEMENT sous son niveau — jamais son propre rang ;
//   d. les Responsables de Commune relèvent du responsable de département, du Ministre de
//      tutelle, des Pasteurs et des Admin ;
//   b. ces fonctions sont indépendantes de l'évolution du membre (un Capitaine peut n'être
//      qu'un « boss ») — le §9.4 n'est donc pas contredit.
import assert from 'node:assert';
import { canAssignBusRole, busRankOf } from './scope.ts';
import { BloomBusEntity, Department, Member, Ministry } from './types.ts';

const BUS_DEPT: Department = {
  id: 'dept_bloom_bus', name: 'Bloom Bus', type: 'special',
  specialFunction: 'bloom_bus', ministryId: 'min_expansion', description: '',
};
const DEPTS = [BUS_DEPT];
const MINISTRIES: Ministry[] = [
  { id: 'min_expansion', name: "Ministère de l'Expansion", description: '', tuteurId: 'ministre' },
];
const bus = (id: string, zone: string, commune: string): BloomBusEntity =>
  ({ id, name: id, zone, commune, centerLat: 5, centerLng: -4 });
const BUS = [
  bus('bus_a', 'Zone Nord', 'Abobo'),
  bus('bus_b', 'Zone Nord', 'Abobo'),
  bus('bus_c', 'Zone Sud', 'Koumassi'),
];
const who = (id: string, fn: string | undefined, busId?: string): Member =>
  ({ id, firstName: id, lastName: '', branch: 'church', bloomBusId: busId,
     departments: fn ? { dept_bloom_bus: fn } : {} } as unknown as Member);

const cible = (busId: string) => who('cible', 'membre', busId);
const can = (op: Member, roles: string[], target: Member, role: string) =>
  canAssignBusRole(op, roles, target, role, BUS, DEPTS, MINISTRIES);

// L'échelle est ordonnée du plus haut au plus bas.
assert.ok(busRankOf('Responsable') < busRankOf('Responsable de Commune'));
assert.ok(busRankOf('Responsable de Commune') < busRankOf('Responsable de Zone'));
assert.ok(busRankOf('Responsable de Zone') < busRankOf('Capitaine de Bus'));

// (a) Un Responsable de Zone nomme un capitaine DANS SA ZONE…
const respZone = who('rz', 'responsable_zone', 'bus_a');
assert.equal(can(respZone, ['Membre'], cible('bus_b'), 'Capitaine de Bus'), true, 'même zone : autorisé');
// …et pas ailleurs.
assert.equal(can(respZone, ['Membre'], cible('bus_c'), 'Capitaine de Bus'), false, 'autre zone : refusé');

// (c) Jamais son propre niveau, ni au-dessus.
assert.equal(can(respZone, ['Membre'], cible('bus_b'), 'Responsable de Zone'), false, 'même rang : refusé');
assert.equal(can(respZone, ['Membre'], cible('bus_b'), 'Responsable de Commune'), false, 'au-dessus : refusé');

// Un Responsable de Commune nomme zones et capitaines de SA commune.
const respCommune = who('rc', 'responsable_commune', 'bus_a');
assert.equal(can(respCommune, ['Membre'], cible('bus_b'), 'Responsable de Zone'), true);
assert.equal(can(respCommune, ['Membre'], cible('bus_b'), 'Capitaine de Bus'), true);
assert.equal(can(respCommune, ['Membre'], cible('bus_c'), 'Responsable de Zone'), false, 'autre commune : refusé');
assert.equal(can(respCommune, ['Membre'], cible('bus_b'), 'Responsable de Commune'), false, 'même rang : refusé');

// Un Capitaine ne nomme personne : il est au bas de la ligne territoriale.
const capitaine = who('cap', 'capitaine', 'bus_a');
assert.equal(can(capitaine, ['Membre'], cible('bus_a'), 'Capitaine de Bus'), false);
assert.equal(can(capitaine, ['Membre'], cible('bus_a'), 'Membre'), true, 'il peut retirer une fonction sur son bus');

// (d) Le responsable DU DÉPARTEMENT couvre tout le module, sans limite territoriale.
const respDept = who('rd', 'responsable', 'bus_a');
assert.equal(can(respDept, ['Membre'], cible('bus_c'), 'Responsable de Commune'), true);

// (d) Ministre de tutelle DU ministère porteur, Pasteurs et Admin : partout.
const ministre = who('ministre', undefined);
assert.equal(can(ministre, ['Ministre'], cible('bus_c'), 'Responsable de Commune'), true);
for (const role of ['Pasteur', 'Pasteur Principal', 'Admin', 'Super Admin']) {
  assert.equal(can(who('x', undefined), [role], cible('bus_c'), 'Responsable de Commune'), true, `${role} doit pouvoir nommer`);
}

// Un ministre d'un AUTRE ministère n'a aucun droit ici.
const autreMinistre = who('autre', undefined);
assert.equal(
  canAssignBusRole(autreMinistre, ['Ministre'], cible('bus_c'), 'Capitaine de Bus', BUS, DEPTS,
    [{ id: 'min_autre', name: 'Autre', description: '', tuteurId: 'autre' }]),
  false, 'un ministre hors du ministère porteur ne nomme pas',
);

// Sans aucune fonction Bloom Bus, on ne nomme personne — même en étant Coach ailleurs.
assert.equal(can(who('coach', undefined), ['Coach'], cible('bus_a'), 'Capitaine de Bus'), false);

// Un rôle qui n'appartient pas à l'échelle Bloom Bus est refusé (on ne détourne pas ce
// chemin pour attribuer une fonction de département ordinaire).
assert.equal(can(respDept, ['Membre'], cible('bus_a'), 'Adjoint'), false);

// (e) Le membre visé doit avoir un bus pour que le périmètre territorial s'évalue ;
// sans bus, seul le responsable de département (ou au-dessus) peut agir.
assert.equal(can(respZone, ['Membre'], who('cible', 'membre'), 'Capitaine de Bus'), false);
assert.equal(can(respDept, ['Membre'], who('cible', 'membre'), 'Capitaine de Bus'), true);

console.log('busAssign.check OK');
