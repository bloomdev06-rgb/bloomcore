// Run: npx tsx src/data/scope.check.ts
import assert from 'node:assert';
import { inMemberScope } from './scope';
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
  { id: 'dept_1', name: 'Louange', type: 'service', ministryId: 'min_1', description: '' },
  { id: 'dept_2', name: 'Accueil', type: 'service', ministryId: 'min_2', description: '' },
];
const ministries: Ministry[] = [{ id: 'min_1', name: 'Louange', description: '', tuteurId: 'ministre_1' }];

// Full-scope roles see everyone
assert.equal(inMemberScope(mk({ id: 'op' }), mk({ id: 't' }), 'Super Admin', busLines, departments), true);

// Ministre — scoped to their ministry's departments
const ministre = mk({ id: 'ministre_1' });
assert.equal(inMemberScope(ministre, mk({ departments: { dept_1: 'Membre' } }), 'Ministre', busLines, departments, ministries), true);
assert.equal(inMemberScope(ministre, mk({ departments: { dept_2: 'Membre' } }), 'Ministre', busLines, departments, ministries), false);

// Capitaine — same bus only
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_a' }), 'Capitaine', busLines, departments), true);
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_b' }), 'Capitaine', busLines, departments), false);

// Responsable de Zone — same bus zone
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_a' }), 'Responsable de Zone', busLines, departments), true);
assert.equal(inMemberScope(mk({ bloomBusId: 'bus_a' }), mk({ bloomBusId: 'bus_b' }), 'Responsable de Zone', busLines, departments), false);

// Responsable de Commune — falls back to gps.commune when no bus
assert.equal(inMemberScope(mk({ gps: { lat: 0, lng: 0, commune: 'Cocody' } }), mk({ gps: { lat: 0, lng: 0, commune: 'Cocody' } }), 'Responsable de Commune', busLines, departments), true);
assert.equal(inMemberScope(mk({ gps: { lat: 0, lng: 0, commune: 'Cocody' } }), mk({ gps: { lat: 0, lng: 0, commune: 'Yopougon' } }), 'Responsable de Commune', busLines, departments), false);

// Shared-department proxy roles (Responsable/Adjoint/Coach/Leader)
assert.equal(inMemberScope(mk({ departments: { dept_1: 'Responsable' } }), mk({ departments: { dept_1: 'Membre' } }), 'Responsable', busLines, departments), true);
assert.equal(inMemberScope(mk({ departments: { dept_1: 'Responsable' } }), mk({ departments: { dept_2: 'Membre' } }), 'Responsable', busLines, departments), false);

// Unhandled role fails open
assert.equal(inMemberScope(mk(), mk(), 'Nouveau', busLines, departments), true);

// Operator always sees themself
assert.equal(inMemberScope(mk({ id: 'same' }), mk({ id: 'same' }), 'Coach', busLines, departments), true);

console.log('scope.check OK');
