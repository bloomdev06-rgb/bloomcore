// Import Bloom Bus : le responsable doit pouvoir être retrouvé par téléphone OU par email.
import assert from 'node:assert';
import { importBusesFromCsv } from './busImport.ts';
import type { Member } from '../types.ts';

const member = (id: string, phone: string, email: string): Member => ({
  id, firstName: id, lastName: 'Test', phone, email, gender: 'H', birthDate: '',
  maritalStatus: 'Célibataire', profession: '', entryDate: '2026-01-01', branch: 'church',
  level: 'stagiaire', pastoralCursus: 'aucun', departments: {}, baptismStatus: 'non_baptise',
  healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 3, presenceCulte: 3, presenceService: 3 },
});

const members = [
  member('m_phone', '+225 07 01 02 03 04', 'phone@example.org'),
  member('m_email', '0500000000', 'Captain@Example.org'),
];
const header = 'Nom,Commune,Zone,Latitude,Longitude,ResponsableTelephone,ResponsableEmail,FonctionResponsable';
const run = (row: string) => importBusesFromCsv(`${header}\n${row}`, members, new Date('2026-09-06T00:00:00Z'));

const byPhone = run('Bus Téléphone,Cocody,Zone 1,5.35,-3.99,0701020304,,capitaine');
assert.equal(byPhone.errors.length, 0, 'le téléphone local doit retrouver le membre stocké avec +225');
assert.equal(byPhone.memberPatches[0]?.id, 'm_phone');
assert.equal(byPhone.memberPatches[0]?.busRole, 'capitaine');
assert.equal(byPhone.buses[0]?.branch, 'church', 'branche déduite du capitaine');

const byEmail = run('Bus Email,Cocody,Zone 1,5.35,-3.99,, captain@example.org ,capitaine');
assert.equal(byEmail.errors.length, 0, 'l’email doit être insensible à la casse et aux espaces');
assert.equal(byEmail.memberPatches[0]?.id, 'm_email');
assert.equal(byEmail.memberPatches[0]?.busRole, 'capitaine');

const conflict = run('Bus Conflit,Cocody,Zone 1,5.35,-3.99,0701020304,captain@example.org,capitaine');
assert.equal(conflict.buses.length, 0, 'deux identifiants appartenant à deux membres doivent être refusés');
assert.match(conflict.errors[0]?.reason ?? '', /deux membres différents/i);

const missing = run('Bus Inconnu,Cocody,Zone 1,5.35,-3.99,,absent@example.org,capitaine');
assert.equal(missing.buses.length, 0);
assert.match(missing.errors[0]?.reason ?? '', /aucun membre existant/i);

const branchConflict = importBusesFromCsv(`${header},Branche\nBus,Cocody,Zone 1,5.35,-3.99,0701020304,,capitaine,light`, members);
assert.equal(branchConflict.buses.length, 0, 'colonne Branche contradictoire refusée');
const otherView = importBusesFromCsv(`${header}\nBus,Cocody,Zone 1,5.35,-3.99,0701020304,,capitaine`, members, new Date(), 'light');
assert.equal(otherView.buses.length, 0, 'import dans la mauvaise vue refusé');
console.log('busImport.check OK');
