// Run: npx tsx src/data/scope.check.ts
import assert from 'node:assert';
import { inMemberScope, busInScope, directReportsOf, canFillReportFor } from './scope';
import { Member, BloomBusEntity, Department, Ministry } from '../types';

let nextId = 0;
const mk = (over: Partial<Member> = {}): Member => ({
  id: `m${nextId++}`, lastName: '', firstName: '', phone: '', email: '', gender: 'H',
  birthDate: '', maritalStatus: 'Célibataire', profession: '', entryDate: '',
  branch: 'church', level: 'Stagiaire', pastoralCursus: 'Aucun', departments: {},
  healthKPIs: { spirituel: 0, social: 0, financier: 0, physique: 0, presenceCulte: 0, presenceService: 0 },
  baptismStatus: 'Non baptisé',
  ...over,
} as Member);

const busLines: BloomBusEntity[] = [
  { id: 'bus_a', name: 'Bus A', commune: 'Cocody', zone: 'Zone 1', centerLat: 0, centerLng: 0 },
  { id: 'bus_b', name: 'Bus B', commune: 'Yopougon', zone: 'Zone 2', centerLat: 0, centerLng: 0 },
];
const departments: Department[] = [
  { id: 'dept_1', name: 'Louange', type: 'normal', ministryId: 'min_1', description: '' },
  { id: 'dept_2', name: 'Accueil', type: 'normal', ministryId: 'min_2', description: '' },
];
const ministries: Ministry[] = [{ id: 'min_1', name: 'Louange', description: '', tuteurId: 'ministre_1' }];

// Full-scope roles see everyone
assert.equal(inMemberScope(mk({ id: 'op' }), mk({ id: 't' }), 'Super Admin', busLines, departments), true);

// Ministre — scoped to their ministry's departments
const ministre = mk({ id: 'ministre_1' });
assert.equal(inMemberScope(ministre, mk({ departments: { dept_1: 'membre' } }), 'Ministre', busLines, departments, ministries), true);
assert.equal(inMemberScope(ministre, mk({ departments: { dept_2: 'membre' } }), 'Ministre', busLines, departments, ministries), false);

// Capitaine — same bus only
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_a' }), 'Capitaine de Bus', busLines, departments), true);
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_b' }), 'Capitaine de Bus', busLines, departments), false);

// Responsable de Zone — same bus zone
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_a' }), 'Responsable de Zone', busLines, departments), true);
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_b' }), 'Responsable de Zone', busLines, departments), false);

// Responsable de Commune — falls back to gps.commune when no bus
assert.equal(inMemberScope(mk({ gps: { lat: 0, lng: 0, commune: 'Cocody' } }), mk({ gps: { lat: 0, lng: 0, commune: 'Cocody' } }), 'Responsable de Commune', busLines, departments), true);
assert.equal(inMemberScope(mk({ gps: { lat: 0, lng: 0, commune: 'Cocody' } }), mk({ gps: { lat: 0, lng: 0, commune: 'Yopougon' } }), 'Responsable de Commune', busLines, departments), false);

// Shared-department proxy roles (Responsable/Adjoint/Coach/Leader)
assert.equal(inMemberScope(mk({ departments: { dept_1: 'responsable' } }), mk({ departments: { dept_1: 'membre' } }), 'Responsable', busLines, departments), true);
assert.equal(inMemberScope(mk({ departments: { dept_1: 'responsable' } }), mk({ departments: { dept_2: 'membre' } }), 'Responsable', busLines, departments), false);

// Unhandled role fails open
assert.equal(inMemberScope(mk(), mk(), 'Nouveau', busLines, departments), true);

// Operator always sees themself
assert.equal(inMemberScope(mk({ id: 'same' }), mk({ id: 'same' }), 'Coach', busLines, departments), true);

// busInScope (P4.4bis) — le rôle Bloom Bus réel vient de operator.departments[busDept.id],
// jamais du paramètre `role` (qui ne sert plus qu'à l'exception pasteur/rôles système).
const busDept: Department = { id: 'dept_bb', name: 'Bloom Bus', type: 'special', ministryId: 'min_bb', specialFunction: 'bloom_bus', description: '' };
const allDepts = [...departments, busDept];

// Capitaine de Bus — son bus uniquement
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_bb: 'capitaine' } }), busLines[0], 'Membre', busLines, allDepts), true);
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_bb: 'capitaine' } }), busLines[1], 'Membre', busLines, allDepts), false);

// Membre — son bus uniquement
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_bb: 'membre' } }), busLines[0], 'Membre', busLines, allDepts), true);
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_bb: 'membre' } }), busLines[1], 'Membre', busLines, allDepts), false);

// Aucune fonction Bloom Bus déclarée mais un bus rattaché → traité comme Membre
assert.equal(busInScope(mk({ bloomBusId: 'bus_a' }), busLines[0], 'Membre', busLines, allDepts), true);
assert.equal(busInScope(mk({ bloomBusId: 'bus_a' }), busLines[1], 'Membre', busLines, allDepts), false);

// Responsable de Zone — toute sa zone
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_bb: 'responsable_zone' } }), busLines[0], 'Membre', busLines, allDepts), true);
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_bb: 'responsable_zone' } }), busLines[1], 'Membre', busLines, allDepts), false);

// Responsable de Commune — falls back to gps.commune when no bus
assert.equal(busInScope(mk({ departments: { dept_bb: 'responsable_commune' }, gps: { lat: 0, lng: 0, commune: 'Cocody' } }), busLines[0], 'Membre', busLines, allDepts), true);
assert.equal(busInScope(mk({ departments: { dept_bb: 'responsable_commune' }, gps: { lat: 0, lng: 0, commune: 'Yopougon' } }), busLines[0], 'Membre', busLines, allDepts), false);

// Responsable du département Bloom Bus voit tout
assert.equal(busInScope(mk({ departments: { dept_bb: 'responsable' } }), busLines[1], 'Membre', busLines, allDepts), true);

// Seule exception : les pasteurs (et les rôles système Super Admin/Admin) voient tout,
// indépendamment de tout rôle Bloom Bus.
assert.equal(busInScope(mk(), busLines[1], 'Pasteur', busLines), true);
assert.equal(busInScope(mk(), busLines[1], 'Pasteur Principal', busLines), true);
assert.equal(busInScope(mk(), busLines[1], 'Super Admin', busLines), true);
assert.equal(busInScope(mk(), busLines[1], 'Admin', busLines), true);

// Régression P4.4bis — un titre organisationnel seul (Ministre, y compris tuteur du
// ministère qui possède le département Bloom Bus, ou Responsable d'un AUTRE département)
// ne donne plus aucun accès automatique : seul le rôle Bloom Bus réel compte.
assert.equal(busInScope(mk({ id: 'ministre_bb' }), busLines[1], 'Ministre', busLines, allDepts), false);
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_1: 'responsable', dept_bb: 'membre' } }), busLines[0], 'Responsable', busLines, allDepts), true);
assert.equal(busInScope(mk({ bloomBusId: 'bus_a', departments: { dept_1: 'responsable', dept_bb: 'membre' } }), busLines[1], 'Responsable', busLines, allDepts), false);

// directReportsOf / canFillReportFor — hiérarchie de remplissage de rapport (spec
// "semaines/saisie hiérarchique"), un palier à la fois : Capitaine←Membre, Zone←Capitaine,
// Commune←Zone, Dept←Commune, Pasteur←Dept, plus l'auto-remplissage toujours autorisé.
const hierBusLines: BloomBusEntity[] = [
  { id: 'bus_z1a', name: 'Bus Z1A', commune: 'Cocody', zone: 'Zone Nord', centerLat: 0, centerLng: 0 },
  { id: 'bus_z1b', name: 'Bus Z1B', commune: 'Cocody', zone: 'Zone Nord', centerLat: 0, centerLng: 0 },
  { id: 'bus_z2a', name: 'Bus Z2A', commune: 'Cocody', zone: 'Zone Sud', centerLat: 0, centerLng: 0 },
  { id: 'bus_c2a', name: 'Bus C2A', commune: 'Yopougon', zone: 'Zone Ouest', centerLat: 0, centerLng: 0 },
];
const bbDept: Department = { id: 'dept_bb', name: 'Bloom Bus', type: 'special', ministryId: 'min_bb', specialFunction: 'bloom_bus', description: '' };
const hierDepts = [bbDept];

const membre1 = mk({ id: 'membre1', bloomBusId: 'bus_z1a', departments: { dept_bb: 'membre' } });
const capA = mk({ id: 'capA', bloomBusId: 'bus_z1a', departments: { dept_bb: 'capitaine' } });
const capB = mk({ id: 'capB', bloomBusId: 'bus_z1b', departments: { dept_bb: 'capitaine' } });
const capC = mk({ id: 'capC', bloomBusId: 'bus_z2a', departments: { dept_bb: 'capitaine' } });
const zoneLead1 = mk({ id: 'zoneLead1', bloomBusId: 'bus_z1a', departments: { dept_bb: 'responsable_zone' } });
const zoneLead2 = mk({ id: 'zoneLead2', bloomBusId: 'bus_z2a', departments: { dept_bb: 'responsable_zone' } });
const communeLead = mk({ id: 'communeLead', bloomBusId: 'bus_z1a', departments: { dept_bb: 'responsable_commune' } });
const communeLead2 = mk({ id: 'communeLead2', bloomBusId: 'bus_c2a', departments: { dept_bb: 'responsable_commune' } });
const deptLead = mk({ id: 'deptLead', departments: { dept_bb: 'responsable' } });
const pasteur = mk({ id: 'pasteur' });

const hierMembers = [membre1, capA, capB, capC, zoneLead1, zoneLead2, communeLead, communeLead2, deptLead, pasteur];

// Capitaine de Bus -> ses membres (même bus), pas les autres capitaines.
assert.deepEqual(directReportsOf(capA, 'Capitaine de Bus', hierMembers, hierBusLines, hierDepts).map((m) => m.id), ['membre1']);
assert.equal(canFillReportFor(capA, membre1, 'Capitaine de Bus', hierMembers, hierBusLines, hierDepts), true);
assert.equal(canFillReportFor(capA, capB, 'Capitaine de Bus', hierMembers, hierBusLines, hierDepts), false);

// Responsable de Zone -> les Capitaines de sa zone (pas ceux d'une autre zone/commune).
const zone1Reports = directReportsOf(zoneLead1, 'Responsable de Zone', hierMembers, hierBusLines, hierDepts).map((m) => m.id).sort();
assert.deepEqual(zone1Reports, ['capA', 'capB']);
assert.equal(canFillReportFor(zoneLead1, capC, 'Responsable de Zone', hierMembers, hierBusLines, hierDepts), false);

// Responsable de Commune -> les Responsables de Zone de sa commune.
const communeReports = directReportsOf(communeLead, 'Responsable de Commune', hierMembers, hierBusLines, hierDepts).map((m) => m.id).sort();
assert.deepEqual(communeReports, ['zoneLead1', 'zoneLead2']);
assert.equal(canFillReportFor(communeLead, zoneLead2, 'Responsable de Commune', hierMembers, hierBusLines, hierDepts), true);
// Autorité territoriale : le Responsable de Commune peut remplir le rapport de tout membre
// dont le bus est dans sa commune (capA/membre1 sur bus_z1a, Cocody), pas seulement ses zones.
assert.equal(canFillReportFor(communeLead, capA, 'Responsable de Commune', hierMembers, hierBusLines, hierDepts), true);
assert.equal(canFillReportFor(communeLead, membre1, 'Responsable de Commune', hierMembers, hierBusLines, hierDepts), true);
// Un SIMPLE membre ne remplit QUE le sien, jamais un autre membre de son bus.
assert.equal(canFillReportFor(membre1, capA, 'Membre', hierMembers, hierBusLines, hierDepts), false);

// Responsable (dept-lead) -> les Responsables de Commune.
const deptReports = directReportsOf(deptLead, 'Responsable', hierMembers, hierBusLines, hierDepts).map((m) => m.id).sort();
assert.deepEqual(deptReports, ['communeLead', 'communeLead2']);

// Pasteur/Admin (FULL_SCOPE_ROLES) -> les dept-leads.
assert.deepEqual(directReportsOf(pasteur, 'Pasteur', hierMembers, hierBusLines, hierDepts).map((m) => m.id), ['deptLead']);
assert.equal(canFillReportFor(pasteur, deptLead, 'Pasteur', hierMembers, hierBusLines, hierDepts), true);
// Accès complet (Pasteur/Admin) : peut remplir le rapport de tout membre rattaché à un bus.
assert.equal(canFillReportFor(pasteur, communeLead, 'Pasteur', hierMembers, hierBusLines, hierDepts), true);

// Auto-remplissage toujours autorisé, à tout palier, même sans être un supérieur de qui que ce soit.
assert.equal(canFillReportFor(membre1, membre1, 'Membre', hierMembers, hierBusLines, hierDepts), true);

console.log('scope.check OK');
