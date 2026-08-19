// Run: npx tsx packages/schemas/member.check.ts
import assert from 'node:assert';
import { MemberSchema, MemberPatchSchema } from './member.ts';
import { INITIAL_MEMBERS } from '../../src/mockData.ts';

// (1) un membre du seed passe tel quel.
const seedMember = INITIAL_MEMBERS[0];
const r1 = MemberSchema.safeParse(seedMember);
assert.ok(r1.success, `un membre du seed doit être accepté : ${r1.success ? '' : JSON.stringify(r1.error.issues)}`);

// (2) champ inconnu -> rejeté (.strict()).
const r2 = MemberSchema.safeParse({ ...seedMember, hack: 1 });
assert.equal(r2.success, false, 'un champ inconnu doit être rejeté (.strict())');

// (3) level hors enum -> rejeté.
const r3 = MemberSchema.safeParse({ ...seedMember, level: 'not_a_level' });
assert.equal(r3.success, false, 'un level hors enum doit être rejeté');

// (4) patch partiel {id, firstName} passe.
const r4 = MemberPatchSchema.safeParse({ id: seedMember.id, firstName: 'Test' });
assert.ok(r4.success, `un patch partiel {id, firstName} doit être accepté : ${r4.success ? '' : JSON.stringify(r4.error.issues)}`);

// (5) patch sans id -> rejeté (id jamais optionnel, même en patch).
const r5 = MemberPatchSchema.safeParse({ firstName: 'Test' });
assert.equal(r5.success, false, 'un patch sans id doit être rejeté');

console.log('member.check OK');
