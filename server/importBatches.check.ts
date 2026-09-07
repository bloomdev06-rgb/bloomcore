import assert from 'node:assert';
import { busMemberState, canAccessImportBatch, importedBusHasRemainingMembers, restoreBusMemberState, sameBusMemberState, unchangedSinceImport } from './importBatches.ts';

const member: any = {
  id: 'm1', departments: { dept_bloom_bus: 'adjoint', other: 'membre' },
  bloomBusId: 'old_bus', busRole: 'capitaine', busRoles: ['capitaine'], updatedAt: '2026-09-06T10:00:00.000Z',
};
const before = busMemberState(member, 'dept_bloom_bus');
const imported: any = { ...member, bloomBusId: 'bus_import_1', busRole: 'responsable_zone', updatedAt: '2026-09-06T10:01:00.000Z' };
assert.equal(sameBusMemberState(imported, 'dept_bloom_bus', busMemberState(imported, 'dept_bloom_bus')), true);
assert.equal(sameBusMemberState({ ...imported, busRole: 'responsable_commune' }, 'dept_bloom_bus', busMemberState(imported, 'dept_bloom_bus')), false);
assert.deepEqual(busMemberState(restoreBusMemberState(imported, 'dept_bloom_bus', before), 'dept_bloom_bus'), before);
assert.equal(unchangedSinceImport(imported, '2026-09-06T10:01:00.000Z'), true);
assert.equal(unchangedSinceImport({ ...imported, updatedAt: 'later' }, '2026-09-06T10:01:00.000Z'), false);
assert.equal(importedBusHasRemainingMembers('bus_import_1', [imported], [restoreBusMemberState(imported, 'dept_bloom_bus', before)]), false);
assert.equal(importedBusHasRemainingMembers('bus_import_1', [imported, { ...imported, id: 'm2' }], [restoreBusMemberState(imported, 'dept_bloom_bus', before)]), true);
assert.equal(canAccessImportBatch({ member: { id: 'owner' }, roles: ['Responsable'] }, { createdById: 'owner' }), true);
assert.equal(canAccessImportBatch({ member: { id: 'other' }, roles: ['Responsable'] }, { createdById: 'owner' }), false);
assert.equal(canAccessImportBatch({ member: { id: 'admin' }, roles: ['Admin'] }, { createdById: 'owner' }), true);
console.log('importBatches.check OK');
