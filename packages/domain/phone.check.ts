// Run: npx tsx packages/domain/phone.check.ts
import assert from 'node:assert';
import { normalizePhone } from './phone.ts';

assert.equal(normalizePhone('+225 07 12 34 56 78'), normalizePhone('07 12 34 56 78'));
assert.equal(normalizePhone('0712345678'), '0712345678');
assert.equal(normalizePhone('225 07 12 34 56 78'), '0712345678');
assert.equal(normalizePhone(''), '');

console.log('phone.check OK');
