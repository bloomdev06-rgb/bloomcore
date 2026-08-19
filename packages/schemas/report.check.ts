// Run: npx tsx packages/schemas/report.check.ts
import assert from 'node:assert';
import { ReportSchema, ReportPatchSchema } from './report.ts';
import { INITIAL_REPORTS } from '../../src/mockData.ts';

const seedReport = INITIAL_REPORTS[0];
const r1 = ReportSchema.safeParse(seedReport);
assert.ok(r1.success, `un rapport du seed doit être accepté : ${r1.success ? '' : JSON.stringify(r1.error.issues)}`);

const r2 = ReportSchema.safeParse({ ...seedReport, hack: 1 });
assert.equal(r2.success, false, 'un champ inconnu doit être rejeté (.strict())');

const r3 = ReportSchema.safeParse({ ...seedReport, reportType: 'not_a_type' });
assert.equal(r3.success, false, 'un reportType hors enum doit être rejeté');

const r4 = ReportPatchSchema.safeParse({ id: seedReport.id, validated: true });
assert.ok(r4.success, `un patch partiel {id, validated} doit être accepté : ${r4.success ? '' : JSON.stringify(r4.error.issues)}`);

const r5 = ReportPatchSchema.safeParse({ validated: true });
assert.equal(r5.success, false, 'un patch sans id doit être rejeté');

console.log('report.check OK');
