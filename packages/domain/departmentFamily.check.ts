// Run: npx tsx packages/domain/departmentFamily.check.ts
import assert from 'node:assert';
import { buildDepartmentsForScope, linkMissingBranch } from './departmentFamily.ts';

const draft = { ministryId: 'min_x', type: 'normal' as const, description: '' };

// Portée church/light uniquement -> une seule fiche, pas de familyId.
const church = buildDepartmentsForScope('church', { church: 'Louange', light: '' }, draft, 1000);
assert.equal(church.length, 1);
assert.equal(church[0].branch, 'church');
assert.equal(church[0].familyId, undefined);

// Les deux branches, même nom -> deux fiches distinctes, familyId partagé identique.
const both = buildDepartmentsForScope('both', { church: 'Louange', light: 'Louange' }, draft, 2000);
assert.equal(both.length, 2);
assert.notEqual(both[0].id, both[1].id);
assert.equal(both[0].familyId, both[1].familyId);
assert.equal(both[0].branch, 'church');
assert.equal(both[1].branch, 'light');

// Les deux branches, noms distincts -> noms respectés, familyId toujours partagé.
const distinct = buildDepartmentsForScope('both', { church: 'Bloom Praise', light: 'Light Choir' }, draft, 3000);
assert.equal(distinct[0].name, 'Bloom Praise');
assert.equal(distinct[1].name, 'Light Choir');
assert.equal(distinct[0].familyId, distinct[1].familyId);

// linkMissingBranch : fiche existante sans familyId -> retrofit + fiche liée cohérente.
const existing = { id: 'dept_church', name: 'Chantres', type: 'normal' as const, ministryId: 'min_x', description: '', branch: 'church' as const };
const { updatedExisting, linked } = linkMissingBranch(existing, 'light', 4000);
assert.notEqual(updatedExisting.familyId, undefined);
assert.equal(updatedExisting.familyId, linked.familyId);
assert.equal(updatedExisting.id, 'dept_church'); // fiche existante jamais recréée
assert.equal(linked.branch, 'light');
assert.equal(linked.name, 'Chantres'); // nom initial repris, éditable ensuite indépendamment

// familyId déjà présent -> réutilisé tel quel, jamais régénéré.
const alreadyLinked = { ...existing, familyId: 'fam_stable' };
const second = linkMissingBranch(alreadyLinked, 'light', 5000);
assert.equal(second.updatedExisting.familyId, 'fam_stable');
assert.equal(second.linked.familyId, 'fam_stable');

console.log('departmentFamily.check OK');
